import { sha256 } from "@/lib/crypto";
import { legacyRolePermissions } from "@/lib/domain/permissions";
import type { Actor, Agent, OAuthGrant } from "@/lib/domain/types";
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "@/lib/errors";
import { isAgentActive, TOKEN_PREFIX } from "@/lib/services/agents";
import {
	ADMIN,
	agentActor,
	createTestContext,
	EDITOR,
	type TestContext,
} from "../helpers";

const NOW = "2026-11-02T12:00:00.000Z";

function member(id: string, role: "editor" | "admin" = "editor"): Actor {
	return { type: "member", id, name: id, role };
}

describe("AgentService", () => {
	let t: TestContext;
	beforeEach(() => {
		t = createTestContext();
	});

	it("creates an agent and a token that authenticates as that agent", async () => {
		const agent = await t.services.agents.create(ADMIN, {
			name: "Ops bot",
			description: "PagerDuty bridge",
		});
		expect(agent).toMatchObject({
			name: "Ops bot",
			description: "PagerDuty bridge",
			permissions: ["status.read", "drafts.read", "drafts.write"],
			revision: 1,
		});
		expect(agent.credentials).toEqual([]);

		const created = await t.services.agents.createToken(ADMIN, agent.id, {});
		expect(created.token.startsWith(TOKEN_PREFIX)).toBe(true);
		expect(created.credentialId.startsWith("tok_")).toBe(true);
		await expect(
			t.services.agents.authenticate(created.token),
		).resolves.toEqual({
			type: "agent",
			id: agent.id,
			name: "Ops bot",
			permissions: ["status.read", "drafts.read", "drafts.write"],
			credential: { type: "token", id: created.credentialId },
		});
		expect((await t.services.agents.list(ADMIN))[0]?.lastUsedAt).toBe(NOW);

		t.clock.advance(30_000);
		await t.services.agents.authenticate(created.token);
		expect((await t.services.agents.list(ADMIN))[0]?.lastUsedAt).toBe(NOW);
		t.clock.advance(60_000);
		await t.services.agents.authenticate(created.token);
		expect((await t.services.agents.list(ADMIN))[0]?.lastUsedAt).toBe(
			"2026-11-02T12:01:30.000Z",
		);
	});

	it("rejects unknown, malformed, revoked and expired tokens", async () => {
		await expect(
			t.services.agents.authenticate(undefined),
		).resolves.toBeUndefined();
		await expect(
			t.services.agents.authenticate("Bearer nope"),
		).resolves.toBeUndefined();
		await expect(
			t.services.agents.authenticate(`${TOKEN_PREFIX}unknown`),
		).resolves.toBeUndefined();

		const agent = await t.services.agents.create(ADMIN, { name: "Revoked" });
		const created = await t.services.agents.createToken(ADMIN, agent.id, {});
		const revoked = await t.services.agents.revokeToken(
			ADMIN,
			created.credentialId,
		);
		expect(revoked.revokedAt).toBe(NOW);
		t.clock.advance(1000);
		expect(
			(await t.services.agents.revokeToken(ADMIN, created.credentialId))
				.revokedAt,
		).toBe(NOW);
		await expect(
			t.services.agents.authenticate(created.token),
		).resolves.toBeUndefined();

		const expiring = await t.services.agents.createToken(ADMIN, agent.id, {
			expiresInDays: 1,
		});
		expect(
			expiring.agent.credentials.find(
				(credential) => credential.id === expiring.credentialId,
			)?.expiresAt,
		).toBe("2026-11-03T12:00:01.000Z");
		await expect(
			t.services.agents.authenticate(expiring.token),
		).resolves.toMatchObject({ id: agent.id });
		t.clock.advance(2 * 86_400_000);
		await expect(
			t.services.agents.authenticate(expiring.token),
		).resolves.toBeUndefined();
	});

	it("refuses a token that is revoked while the request records its use", async () => {
		const agent = await t.services.agents.create(ADMIN, { name: "Race" });
		const created = await t.services.agents.createToken(ADMIN, agent.id, {});
		const update = t.store.update.bind(t.store);
		let raced = false;
		vi.spyOn(t.store, "update").mockImplementation(
			async (collection, doc, options) => {
				if (!raced && collection === "agent_tokens") {
					raced = true;
					const current = await t.store.get(
						"agent_tokens",
						created.credentialId,
					);
					await update("agent_tokens", {
						...current,
						revokedAt: NOW,
					} as never);
				}
				return update(collection, doc, options);
			},
		);
		await expect(
			t.services.agents.authenticate(created.token),
		).resolves.toBeUndefined();
		expect(
			(await t.store.get("agent_tokens", created.credentialId))?.revokedAt,
		).toBe(NOW);
	});

	it("reports active state", () => {
		const now = new Date(NOW);
		expect(isAgentActive({ revokedAt: "x" }, now)).toBe(false);
		expect(isAgentActive({ expiresAt: "2026-11-01T00:00:00.000Z" }, now)).toBe(
			false,
		);
		expect(isAgentActive({ expiresAt: "2026-12-01T00:00:00.000Z" }, now)).toBe(
			true,
		);
		expect(isAgentActive({}, now)).toBe(true);
	});

	it("lets an admin change permissions and blocks escalation", async () => {
		const agent = await t.services.agents.create(ADMIN, { name: "Bot" });
		await expect(
			t.services.agents.create(ADMIN, {
				name: "Sender",
				permissions: ["notifications.send"],
			}),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.agents.create(ADMIN, {
				name: "Nope",
				permissions: ["drafts.review"],
			}),
		).rejects.toBeInstanceOf(ValidationError);
		const limited = agentActor(["agents.manage", "status.read"]);
		await expect(
			t.services.agents.create(limited, {
				name: "More",
				permissions: ["incidents.publish"],
			}),
		).rejects.toBeInstanceOf(ForbiddenError);

		const saved = await t.services.agents.update(ADMIN, agent.id, {
			name: "Renamed",
			permissions: ["status.read", "incidents.publish", "notifications.send"],
			revision: agent.revision,
		});
		expect(saved).toMatchObject({
			name: "Renamed",
			permissions: ["status.read", "incidents.publish", "notifications.send"],
			revision: 2,
		});
		await expect(
			t.services.agents.update(ADMIN, agent.id, {
				name: "Again",
				revision: 1,
			}),
		).rejects.toBeInstanceOf(ConflictError);

		const owner = member("mem_ed");
		const owned = await t.services.agents.createOwned({
			name: "Mine",
			ownerId: owner.id,
			createdBy: { type: "member", id: owner.id, name: owner.name },
		});
		await t.services.agents.update(owner, owned.id, {
			name: "Mine 2",
			revision: owned.revision,
		});
		await expect(
			t.services.agents.update(owner, owned.id, {
				permissions: ["status.read"],
				revision: owned.revision + 1,
			}),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(
			t.services.agents.update(EDITOR, owned.id, {
				name: "Stolen",
				revision: owned.revision + 1,
			}),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.agents.create(EDITOR, { name: "x" }),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(
			t.services.agents.create(ADMIN, { name: "" }),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("shows an agent to its owner, its connection, and a reader", async () => {
		const owner = member("mem_ed");
		const owned = await t.services.agents.createOwned({
			name: "Mine",
			ownerId: owner.id,
			createdBy: { type: "member", id: owner.id, name: owner.name },
		});
		const team = await t.services.agents.create(ADMIN, { name: "Team" });
		expect(
			(await t.services.agents.choices(owner)).map((agent) => agent.name),
		).toEqual(["Mine"]);
		expect(
			await t.services.agents.choices(agentActor(["status.read"])),
		).toEqual([]);
		expect(
			(await t.services.agents.choices(ADMIN))
				.map((agent) => agent.name)
				.sort(),
		).toEqual(["Mine", "Team"]);
		await expect(
			t.services.agents.requireChoice(owner, team.id),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.agents.requireChoice(ADMIN, team.id),
		).resolves.toMatchObject({ id: team.id });
		await expect(
			t.services.agents.requireChoice(agentActor(["status.read"]), team.id),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.agents.requireChoice(agentActor(["agents.manage"]), team.id),
		).resolves.toMatchObject({ id: team.id });
		await expect(t.services.agents.get(owner, team.id)).rejects.toBeInstanceOf(
			NotFoundError,
		);
		expect(await t.services.agents.list(agentActor(["status.read"]))).toEqual(
			[],
		);
		expect(await t.services.oauth.list(agentActor(["status.read"]))).toEqual(
			[],
		);
		expect(
			await t.services.agents.recentActivity(agentActor(["status.read"])),
		).toEqual([]);
		expect(
			await t.services.agents.list(agentActor(["agents.read"])),
		).toHaveLength(2);
		await t.services.agents.releaseOwner(owner.id);
		expect(
			(await t.services.agents.get(ADMIN, owned.id)).ownerId,
		).toBeUndefined();
		expect(
			(await t.store.find("agent_activity")).some(
				(row) => row.type === "owner_removed",
			),
		).toBe(true);
	});

	it("deletes an agent and its credentials", async () => {
		const agent = await t.services.agents.create(ADMIN, { name: "Bot" });
		await t.services.agents.createToken(ADMIN, agent.id, {});
		await t.services.agents.delete(ADMIN, agent.id);
		await expect(t.store.count("agent_tokens")).resolves.toBe(0);
		await expect(t.store.count("agents")).resolves.toBe(0);
		await expect(
			t.services.agents.delete(ADMIN, agent.id),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.agents.revokeToken(ADMIN, "tok_missing"),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("builds agents for tokens and grants that have no agent yet", async () => {
		const secret = `${TOKEN_PREFIX}${"a".repeat(32)}`;
		await t.store.insert("agent_tokens", {
			id: "agt_legacy",
			name: "Legacy",
			description: "Old token",
			tokenHash: sha256(secret),
			tokenPrefix: secret.slice(0, 11),
			role: "editor",
			createdBy: { type: "member", id: ADMIN.id, name: ADMIN.name },
			createdAt: NOW,
		});
		await t.store.insert("members", {
			id: "mem_ed",
			email: "ed@acme.dev",
			name: "Ed",
			role: "editor",
			passwordHash: "x",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const grant: OAuthGrant = {
			id: "ogr_legacygrant",
			clientId: "ocl_x",
			clientName: "Cursor",
			memberId: "mem_ed",
			accessTokenHash: "a",
			accessTokenExpiresAt: "2026-12-02T12:00:00.000Z",
			refreshTokenHash: "b",
			refreshTokenExpiresAt: "2026-12-02T12:00:00.000Z",
			createdAt: NOW,
		};
		await t.store.insert("oauth_grants", grant);
		await t.store.insert("oauth_grants", {
			...grant,
			id: "ogr_orphan",
			memberId: "mem_missing",
			accessTokenHash: "c",
			refreshTokenHash: "d",
		});
		await t.services.agents.migrate();
		const tokenAgent = await t.services.agents.get(ADMIN, "agt_legacy");
		expect(tokenAgent.permissions).toEqual(legacyRolePermissions("editor"));
		expect(tokenAgent.migratedFrom).toBe("token");
		expect(tokenAgent.description).toBe("Old token");
		await expect(t.services.agents.authenticate(secret)).resolves.toMatchObject(
			{
				id: "agt_legacy",
			},
		);
		const oauthAgent = await t.services.agents.get(ADMIN, "agt_legacygrant");
		expect(oauthAgent).toMatchObject({
			name: "Cursor",
			ownerId: "mem_ed",
			migratedFrom: "oauth",
		});
		expect(await t.store.get("oauth_grants", "ogr_orphan")).toBeUndefined();
		await t.services.agents.migrate();
		expect(await t.store.count("agents")).toBe(2);

		const saved = await t.services.agents.update(ADMIN, tokenAgent.id, {
			permissions: ["status.read"],
			revision: tokenAgent.revision,
		});
		expect(saved.migratedFrom).toBeUndefined();
		await t.store.delete("members", "mem_ed");
		await expect(t.services.oauth.list(ADMIN)).resolves.toEqual([]);
	});

	it("keeps the existing agent when a legacy id is already taken", async () => {
		const existing: Agent = {
			id: "agt_legacy",
			name: "Already",
			permissions: ["status.read"],
			createdBy: { type: "member", id: ADMIN.id, name: ADMIN.name },
			revision: 1,
			createdAt: NOW,
			updatedAt: NOW,
		};
		await t.store.insert("agents", existing);
		await t.store.insert("agent_tokens", {
			id: "agt_legacy",
			name: "Legacy",
			tokenHash: "hash",
			tokenPrefix: "icmd_legacy",
			role: "admin",
			createdBy: existing.createdBy,
			createdAt: NOW,
		});
		await t.services.agents.migrate();
		expect(await t.store.count("agents")).toBe(1);
		expect((await t.store.get("agent_tokens", "agt_legacy"))?.agentId).toBe(
			"agt_legacy",
		);
		expect((await t.services.agents.get(ADMIN, "agt_legacy")).name).toBe(
			"Already",
		);
	});

	it("fails a migration that cannot store the agent", async () => {
		const insert = t.store.insert.bind(t.store);
		vi.spyOn(t.store, "insert").mockImplementation(async (collection, doc) => {
			if (collection === "agents") {
				throw new Error("disk");
			}
			return insert(collection, doc);
		});
		await t.store.insert("agent_tokens", {
			id: "agt_disk",
			name: "Disk",
			tokenHash: "hash",
			tokenPrefix: "icmd_disk00",
			role: "editor",
			createdBy: { type: "member", id: ADMIN.id, name: ADMIN.name },
			createdAt: NOW,
		});
		await expect(t.services.agents.migrate()).rejects.toThrow("disk");
	});

	it("fails a migration when the conflicting agent is gone", async () => {
		await t.store.insert("agents", {
			id: "agt_gone",
			name: "Gone",
			permissions: ["status.read"],
			createdBy: { type: "member", id: ADMIN.id, name: ADMIN.name },
			revision: 1,
			createdAt: NOW,
			updatedAt: NOW,
		});
		await t.store.insert("agent_tokens", {
			id: "agt_gone",
			name: "Gone",
			tokenHash: "hash",
			tokenPrefix: "icmd_gone00",
			role: "editor",
			createdBy: { type: "member", id: ADMIN.id, name: ADMIN.name },
			createdAt: NOW,
		});
		const get = t.store.get.bind(t.store);
		vi.spyOn(t.store, "get").mockImplementation(
			async (collection, id, options) => {
				if (collection === "agents" && id === "agt_gone") {
					return undefined;
				}
				return get(collection, id, options);
			},
		);
		await expect(t.services.agents.migrate()).rejects.toBeInstanceOf(
			ConflictError,
		);
	});

	it("retries a revision conflict when it clears an owner", async () => {
		const owner = member("mem_ed");
		const owned = await t.services.agents.createOwned({
			name: "Mine",
			ownerId: owner.id,
			createdBy: { type: "member", id: owner.id, name: owner.name },
		});
		const update = t.store.update.bind(t.store);
		let failed = false;
		vi.spyOn(t.store, "update").mockImplementation(
			async (collection, doc, options) => {
				if (!failed && collection === "agents") {
					failed = true;
					return undefined;
				}
				return update(collection, doc, options);
			},
		);
		await t.services.agents.releaseOwner(owner.id);
		expect(
			(await t.services.agents.get(ADMIN, owned.id)).ownerId,
		).toBeUndefined();
		failed = false;
		const again = await t.services.agents.createOwned({
			name: "Stuck",
			ownerId: owner.id,
			createdBy: { type: "member", id: owner.id, name: owner.name },
		});
		vi.spyOn(t.store, "update").mockImplementation(
			async (collection, doc, options) => {
				if (collection === "agents") {
					return undefined;
				}
				return update(collection, doc, options);
			},
		);
		await t.services.agents.releaseOwner(owner.id);
		expect((await t.store.get("agents", again.id))?.ownerId).toBe(owner.id);
	});

	it("keeps the action when the activity log cannot store a row", async () => {
		const insert = t.store.insert.bind(t.store);
		vi.spyOn(t.store, "insert").mockImplementation(async (collection, doc) => {
			if (collection === "agent_activity") {
				throw new Error("log down");
			}
			return insert(collection, doc);
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const agent = await t.services.agents.create(ADMIN, { name: "Bot" });
		expect(agent.name).toBe("Bot");
		expect(error).toHaveBeenCalled();
		error.mockRestore();
		vi.restoreAllMocks();
		vi.spyOn(t.store, "deleteMany").mockRejectedValueOnce(new Error("prune"));
		const pruneError = vi.spyOn(console, "error").mockImplementation(() => {});
		const kept = await t.services.agents.create(ADMIN, { name: "Kept" });
		expect(kept.name).toBe("Kept");
		expect(pruneError).toHaveBeenCalled();
		pruneError.mockRestore();
	});

	it("drops activity that is older than 90 days", async () => {
		const agent = await t.services.agents.create(ADMIN, { name: "Bot" });
		t.clock.advance(90 * 86_400_000 + 3_600_000);
		await t.services.agents.update(ADMIN, agent.id, {
			name: "Renamed",
			revision: agent.revision,
		});
		expect(
			(await t.store.find("agent_activity")).map((row) => row.type),
		).toEqual(["agent_renamed"]);
	});

	it("names a legacy credential that has no name", async () => {
		await t.store.insert("members", {
			id: "mem_ed",
			email: "ed@acme.dev",
			name: "Ed",
			role: "viewer",
			passwordHash: "x",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await t.store.insert("agent_tokens", {
			id: "agt_blank",
			name: "",
			tokenHash: "hash-blank",
			tokenPrefix: "icmd_blank0",
			role: "viewer",
			createdBy: { type: "member", id: ADMIN.id, name: ADMIN.name },
			createdAt: NOW,
		});
		await t.store.insert("oauth_grants", {
			id: "plain_grant",
			clientId: "ocl_x",
			clientName: "",
			memberId: "mem_ed",
			accessTokenHash: "a",
			accessTokenExpiresAt: "2026-12-02T12:00:00.000Z",
			refreshTokenHash: "b",
			refreshTokenExpiresAt: "2026-12-02T12:00:00.000Z",
			createdAt: NOW,
		});
		await t.services.agents.migrate();
		expect((await t.services.agents.get(ADMIN, "agt_blank")).name).toBe(
			"Agent",
		);
		expect((await t.services.agents.get(ADMIN, "agt_plain_grant")).name).toBe(
			"Agent",
		);
	});

	it("stops when a save or a delete loses the row", async () => {
		const agent = await t.services.agents.create(ADMIN, { name: "Bot" });
		const created = await t.services.agents.createToken(ADMIN, agent.id, {});
		await t.store.delete("agents", agent.id);
		await expect(
			t.services.agents.authenticate(created.token),
		).resolves.toBeUndefined();

		const update = t.store.update.bind(t.store);
		vi.spyOn(t.store, "update").mockImplementation(
			async (collection, doc, options) =>
				collection === "agents" ? undefined : update(collection, doc, options),
		);
		const current = await t.services.agents.create(ADMIN, { name: "Live" });
		await expect(
			t.services.agents.update(ADMIN, current.id, {
				name: "Next",
				revision: current.revision,
			}),
		).rejects.toBeInstanceOf(ConflictError);
		vi.restoreAllMocks();

		const remove = t.store.delete.bind(t.store);
		vi.spyOn(t.store, "delete").mockImplementation(async (collection, id) =>
			collection === "agents" ? false : remove(collection, id),
		);
		await expect(
			t.services.agents.delete(ADMIN, current.id),
		).rejects.toBeInstanceOf(NotFoundError);
		vi.restoreAllMocks();

		await t.store.insert("agent_tokens", {
			id: "tok_orphan",
			tokenHash: "hash-orphan",
			tokenPrefix: "icmd_orf000",
			createdBy: { type: "member", id: ADMIN.id, name: ADMIN.name },
			createdAt: NOW,
		});
		await expect(
			t.services.agents.revokeToken(ADMIN, "tok_orphan"),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("leaves an owner that changed before the clear", async () => {
		const owner = member("mem_ed");
		const owned = await t.services.agents.createOwned({
			name: "Mine",
			ownerId: owner.id,
			createdBy: { type: "member", id: owner.id, name: owner.name },
		});
		const get = t.store.get.bind(t.store);
		vi.spyOn(t.store, "get").mockImplementation(
			async (collection, id, options) => {
				const row = await get(collection, id, options);
				if (collection === "agents" && options?.consistent && row) {
					return { ...row, ownerId: "mem_other" } as typeof row;
				}
				return row;
			},
		);
		await t.services.agents.releaseOwner(owner.id);
		expect((await get("agents", owned.id))?.ownerId).toBe(owner.id);

		vi.spyOn(t.store, "get").mockImplementation(
			async (collection, id, options) => {
				if (collection === "agents" && options?.consistent) {
					return undefined;
				}
				return get(collection, id, options);
			},
		);
		await t.services.agents.releaseOwner(owner.id);
		expect((await get("agents", owned.id))?.ownerId).toBe(owner.id);
	});
});
