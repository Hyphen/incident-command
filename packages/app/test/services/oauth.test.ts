import { pkceChallenge } from "@/lib/crypto";
import {
	DEFAULT_AGENT_PERMISSIONS,
	permissionsForRole,
} from "@/lib/domain/permissions";
import type { Actor, Role } from "@/lib/domain/types";
import {
	ForbiddenError,
	NotFoundError,
	OAuthError,
	ValidationError,
} from "@/lib/errors";
import { SYSTEM_ACTOR } from "@/lib/services/context";
import { memberActor } from "@/lib/services/members";
import {
	ACCESS_TOKEN_PREFIX,
	type AuthorizationParams,
	CODE_TTL_MS,
	REFRESH_TOKEN_PREFIX,
	REFRESH_TOKEN_TTL_MS,
	UNUSED_CLIENT_TTL_MS,
} from "@/lib/services/oauth";
import { agentActor, createTestContext, type TestContext } from "../helpers";

const RESOURCE = "https://status.acme.dev/api/mcp";
const REDIRECT = "http://localhost:33418/callback";
/** The example verifier of RFC 7636 appendix B. */
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

let memberCount = 0;

async function addMember(t: TestContext, role: Role, name: string) {
	memberCount += 1;
	const { token } = await t.services.members.invite(SYSTEM_ACTOR, {
		email: `member-${memberCount}@test.dev`,
		role,
	});
	const member = await t.services.members.acceptInvite(token, {
		name,
		password: "password123",
	});
	return { member, actor: memberActor(member) };
}

function register(t: TestContext, metadata: Record<string, unknown> = {}) {
	return t.services.oauth.register({
		client_name: "Claude Code",
		redirect_uris: [REDIRECT],
		...metadata,
	});
}

function authorization(
	clientId: string,
	overrides: AuthorizationParams = {},
): AuthorizationParams {
	return {
		response_type: "code",
		client_id: clientId,
		redirect_uri: REDIRECT,
		code_challenge: pkceChallenge(VERIFIER),
		code_challenge_method: "S256",
		state: "state-123",
		resource: RESOURCE,
		...overrides,
	};
}

/** Approves an authorization request and returns the code from the redirect. */
async function approve(
	t: TestContext,
	actor: Actor,
	clientId: string,
	overrides: AuthorizationParams = {},
): Promise<string> {
	const url = await t.services.oauth.approve(
		actor,
		authorization(clientId, overrides),
		RESOURCE,
	);
	return new URL(url).searchParams.get("code") ?? "";
}

/** Sends a token request. An override of `undefined` leaves out the parameter. */
function token(t: TestContext, params: Record<string, string | undefined>) {
	const defined: Record<string, string> = {};
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			defined[key] = value;
		}
	}
	return t.services.oauth.token(defined);
}

function exchange(
	t: TestContext,
	clientId: string,
	code: string,
	overrides: Record<string, string | undefined> = {},
) {
	return token(t, {
		grant_type: "authorization_code",
		client_id: clientId,
		code,
		redirect_uri: REDIRECT,
		code_verifier: VERIFIER,
		resource: RESOURCE,
		...overrides,
	});
}

/** Registers a client, approves it as the member and exchanges the code. */
async function connect(t: TestContext, actor: Actor) {
	const client = await register(t);
	const code = await approve(t, actor, client.client_id);
	return { client, tokens: await exchange(t, client.client_id, code) };
}

async function expectOAuthError(promise: Promise<unknown>, error: string) {
	const failure = await promise.catch((reason: unknown) => reason);
	expect(failure).toBeInstanceOf(OAuthError);
	expect((failure as OAuthError).error).toBe(error);
}

describe("OAuthService", () => {
	let t: TestContext;
	beforeEach(() => {
		t = createTestContext();
	});

	it("registers public clients and rejects bad metadata", async () => {
		await expect(register(t)).resolves.toEqual({
			client_id: expect.stringMatching(/^ocl_[0-9a-z]{24}$/),
			client_id_issued_at: Date.parse("2026-11-02T12:00:00.000Z") / 1000,
			client_name: "Claude Code",
			redirect_uris: [REDIRECT],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		});
		await expect(
			t.services.oauth.register({ redirect_uris: [REDIRECT] }),
		).resolves.toMatchObject({ client_name: "Unnamed agent" });
		await expectOAuthError(
			t.services.oauth.register(undefined),
			"invalid_client_metadata",
		);
		await expectOAuthError(
			register(t, { redirect_uris: [] }),
			"invalid_client_metadata",
		);
	});

	it.each([
		["https://app.example.com/callback", true],
		["http://localhost:8080/callback", true],
		["http://127.0.0.1/callback", true],
		["http://[::1]:8080/callback", true],
		["cursor://anysphere.cursor-retrieval/oauth/callback", true],
		["com.example.app:/oauth2redirect", true],
		["http://app.example.com/callback", false],
		["https://app.example.com/callback#fragment", false],
		["https://app.example.com/callback#", false],
		["javascript:alert(1)", false],
		["data:text/html,hello", false],
		["file:///etc/passwd", false],
		["ftp://files.example.com/callback", false],
		["wss://app.example.com/callback", false],
		["mailto:agent@example.com", false],
		["not a url", false],
	])("accepts the redirect URI %s: %s", async (uri, allowed) => {
		const result = register(t, { redirect_uris: [uri] });
		if (allowed) {
			await expect(result).resolves.toMatchObject({ redirect_uris: [uri] });
		} else {
			await expectOAuthError(result, "invalid_redirect_uri");
		}
	});

	it("removes clients that no member approved in 30 days", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const approved = await register(t);
		await approve(t, actor, approved.client_id);
		const unused = await register(t);
		t.clock.advance(UNUSED_CLIENT_TTL_MS + 1);
		await register(t);
		const check = (clientId: string) =>
			t.services.oauth.check(authorization(clientId), RESOURCE);
		await expect(check(approved.client_id)).resolves.toMatchObject({
			kind: "consent",
		});
		await expect(check(unused.client_id)).resolves.toMatchObject({
			kind: "invalid",
		});
	});

	it("does not redirect for an unknown client or redirect URI", async () => {
		const { client_id } = await register(t);
		const check = (params: AuthorizationParams) =>
			t.services.oauth.check(params, RESOURCE);
		for (const params of [
			authorization("ocl_unknown"),
			authorization(client_id, { client_id: undefined }),
			authorization(client_id, { redirect_uri: "https://evil.example/cb" }),
			authorization(client_id, { redirect_uri: undefined }),
			authorization(client_id, { redirect_uri: "https://localhost/callback" }),
		]) {
			await expect(check(params)).resolves.toMatchObject({ kind: "invalid" });
		}
		// RFC 8252: a loopback redirect URI can use any port.
		await expect(
			check(
				authorization(client_id, {
					redirect_uri: "http://localhost:50123/callback",
				}),
			),
		).resolves.toMatchObject({
			kind: "consent",
			request: { redirectUri: "http://localhost:50123/callback" },
		});
	});

	it("sends other request errors to the agent", async () => {
		const { client_id } = await register(t);
		const error = async (overrides: AuthorizationParams) => {
			const check = await t.services.oauth.check(
				authorization(client_id, overrides),
				RESOURCE,
			);
			expect(check.kind).toBe("redirect");
			const url = new URL(check.kind === "redirect" ? check.url : "");
			expect(url.origin + url.pathname).toBe(REDIRECT);
			expect(url.searchParams.get("state")).toBe("state-123");
			return url.searchParams.get("error");
		};
		expect(await error({ response_type: "token" })).toBe(
			"unsupported_response_type",
		);
		expect(await error({ code_challenge: undefined })).toBe("invalid_request");
		expect(await error({ code_challenge: "short" })).toBe("invalid_request");
		expect(await error({ code_challenge_method: "plain" })).toBe(
			"invalid_request",
		);
		expect(await error({ resource: "https://other.example.com/api/mcp" })).toBe(
			"invalid_target",
		);
		for (const resource of [
			undefined,
			"https://status.acme.dev",
			"https://status.acme.dev/api/mcp/",
		]) {
			await expect(
				t.services.oauth.check(
					authorization(client_id, { resource }),
					RESOURCE,
				),
			).resolves.toMatchObject({ kind: "consent" });
		}
	});

	it("connects an agent that acts as the member", async () => {
		const { member, actor } = await addMember(t, "editor", "Ed Editor");
		const client = await register(t);
		const redirect = new URL(
			await t.services.oauth.approve(
				actor,
				authorization(client.client_id),
				RESOURCE,
			),
		);
		expect(redirect.origin + redirect.pathname).toBe(REDIRECT);
		expect(redirect.searchParams.get("state")).toBe("state-123");
		const code = redirect.searchParams.get("code") ?? "";
		const tokens = await exchange(t, client.client_id, code);
		expect(tokens).toEqual({
			access_token: expect.stringMatching(
				new RegExp(`^${ACCESS_TOKEN_PREFIX}`),
			),
			token_type: "Bearer",
			expires_in: 3600,
			refresh_token: expect.stringMatching(
				new RegExp(`^${REFRESH_TOKEN_PREFIX}`),
			),
		});
		await expect(
			t.services.oauth.authenticate(tokens.access_token),
		).resolves.toEqual({
			type: "agent",
			id: expect.stringMatching(/^agt_/),
			name: "Ed Editor via Claude Code",
			permissions: [...DEFAULT_AGENT_PERMISSIONS],
			credential: {
				type: "oauth",
				id: expect.stringMatching(/^ogr_/),
			},
		});
		expect(await t.services.oauth.list(actor)).toEqual([
			{
				id: expect.stringMatching(/^ogr_/),
				clientName: "Claude Code",
				memberId: member.id,
				memberName: "Ed Editor",
				lastUsedAt: "2026-11-02T12:00:00.000Z",
				expiresAt: "2026-12-02T12:00:00.000Z",
				createdAt: "2026-11-02T12:00:00.000Z",
			},
		]);
		// A code works one time.
		await expectOAuthError(
			exchange(t, client.client_id, code),
			"invalid_grant",
		);
		// Only a member can approve an agent.
		await expect(
			t.services.oauth.approve(
				agentActor(["agents.manage"], { id: "agt_x", name: "Bot" }),
				authorization(client.client_id),
				RESOURCE,
			),
		).rejects.toBeInstanceOf(ForbiddenError);
	});

	it("keeps the chosen name for each connection after a token refresh", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const { client_id } = await register(t);
		for (const name of ["Primary agent", "Backup agent"]) {
			const url = await t.services.oauth.approve(
				actor,
				authorization(client_id),
				RESOURCE,
				`  ${name}  `,
			);
			const code = new URL(url).searchParams.get("code") ?? "";
			const tokens = await exchange(t, client_id, code);
			const refreshed = await token(t, {
				grant_type: "refresh_token",
				client_id,
				refresh_token: tokens.refresh_token,
				resource: RESOURCE,
			});
			await expect(
				t.services.oauth.authenticate(refreshed.access_token),
			).resolves.toMatchObject({
				name: `Ed Editor via ${name}`,
			});
		}
		expect(
			(await t.services.oauth.list(actor))
				.map((grant) => grant.clientName)
				.sort(),
		).toEqual(["Backup agent", "Primary agent"]);
		const check = await t.services.oauth.check(
			authorization(client_id),
			RESOURCE,
		);
		expect(check).toMatchObject({
			kind: "consent",
			client: { name: "Claude Code" },
		});
	});

	it.each(["", "   ", "x".repeat(121)])(
		"rejects the agent name %j before it issues a code",
		async (name) => {
			const { actor } = await addMember(t, "viewer", "Vi Viewer");
			const { client_id } = await register(t);
			await expect(
				t.services.oauth.approve(
					actor,
					authorization(client_id),
					RESOURCE,
					name,
				),
			).rejects.toBeInstanceOf(ValidationError);
			expect(await t.store.find("oauth_codes")).toEqual([]);
		},
	);

	it("connects an agent that sends no resource indicator or state", async () => {
		const { actor } = await addMember(t, "viewer", "Vi Viewer");
		const { client_id } = await register(t);
		const redirect = new URL(
			await t.services.oauth.approve(
				actor,
				authorization(client_id, { resource: undefined, state: undefined }),
				RESOURCE,
			),
		);
		expect(redirect.searchParams.has("state")).toBe(false);
		const code = redirect.searchParams.get("code") ?? "";
		const tokens = await exchange(t, client_id, code, { resource: undefined });
		await expect(
			t.services.oauth.authenticate(tokens.access_token),
		).resolves.toMatchObject({
			permissions: ["status.read", "drafts.read"],
		});
		await expect(
			t.services.oauth.token({
				grant_type: "refresh_token",
				client_id,
				refresh_token: tokens.refresh_token,
			}),
		).resolves.toMatchObject({ token_type: "Bearer" });
	});

	it("tells the agent when the member denies it or the request is bad", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const { client_id } = await register(t);
		const denied = new URL(
			await t.services.oauth.deny(authorization(client_id), RESOURCE),
		);
		expect(denied.searchParams.get("error")).toBe("access_denied");
		expect(denied.searchParams.get("state")).toBe("state-123");
		for (const decide of [
			() =>
				t.services.oauth.deny(
					authorization(client_id, { response_type: "token" }),
					RESOURCE,
				),
			() =>
				t.services.oauth.approve(
					actor,
					authorization(client_id, { response_type: "token" }),
					RESOURCE,
				),
		]) {
			const url = new URL(await decide());
			expect(url.searchParams.get("error")).toBe("unsupported_response_type");
			expect(url.searchParams.has("code")).toBe(false);
		}
		await expectOAuthError(
			t.services.oauth.deny(authorization("ocl_unknown"), RESOURCE),
			"invalid_request",
		);
		await expectOAuthError(
			t.services.oauth.approve(actor, authorization("ocl_unknown"), RESOURCE),
			"invalid_request",
		);
	});

	it("rejects a code exchange that does not match the authorization", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const { client_id } = await register(t);
		const other = await register(t);
		const attempt = async (
			overrides: Record<string, string | undefined>,
			error = "invalid_grant",
		) => {
			const code = await approve(t, actor, client_id);
			await expectOAuthError(exchange(t, client_id, code, overrides), error);
		};
		await attempt({ client_id: other.client_id });
		await attempt({ redirect_uri: "http://localhost:1/callback" });
		await attempt({ code_verifier: `${VERIFIER.slice(0, -1)}x` });
		await attempt({ code_verifier: "too-short" });
		await attempt({ code_verifier: undefined });
		await attempt({ code: undefined });
		await attempt({ code: "unknown" });
		await attempt({ resource: "https://status.acme.dev" }, "invalid_target");
		await attempt({ client_id: "ocl_unknown" }, "invalid_client");

		const expired = await approve(t, actor, client_id);
		t.clock.advance(CODE_TTL_MS);
		await expectOAuthError(exchange(t, client_id, expired), "invalid_grant");

		await expectOAuthError(
			token(t, { grant_type: "authorization_code" }),
			"invalid_client",
		);
		await expectOAuthError(
			token(t, { grant_type: "password" }),
			"unsupported_grant_type",
		);
	});

	it("lets only one of two concurrent exchanges use a code", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const { client_id } = await register(t);
		const code = await approve(t, actor, client_id);
		const results = await Promise.allSettled([
			exchange(t, client_id, code),
			exchange(t, client_id, code),
		]);
		expect(results.map((result) => result.status).sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
	});

	it("replaces both tokens at each refresh", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const { client, tokens } = await connect(t, actor);
		const refresh = (overrides: Record<string, string | undefined> = {}) =>
			token(t, {
				grant_type: "refresh_token",
				client_id: client.client_id,
				refresh_token: tokens.refresh_token,
				resource: RESOURCE,
				...overrides,
			});
		const other = await register(t);
		await expectOAuthError(
			refresh({ client_id: other.client_id }),
			"invalid_grant",
		);
		await expectOAuthError(
			refresh({ resource: "https://status.acme.dev" }),
			"invalid_target",
		);
		await expectOAuthError(
			refresh({ refresh_token: undefined }),
			"invalid_grant",
		);

		const next = await refresh();
		expect(next.access_token).not.toBe(tokens.access_token);
		expect(next.refresh_token).not.toBe(tokens.refresh_token);
		await expect(
			t.services.oauth.authenticate(tokens.access_token),
		).resolves.toBeUndefined();
		await expect(
			t.services.oauth.authenticate(next.access_token),
		).resolves.toMatchObject({
			permissions: [...DEFAULT_AGENT_PERMISSIONS],
		});
		await expectOAuthError(refresh(), "invalid_grant");

		const concurrent = await Promise.allSettled([
			refresh({ refresh_token: next.refresh_token }),
			refresh({ refresh_token: next.refresh_token }),
		]);
		expect(concurrent.map((result) => result.status).sort()).toEqual([
			"fulfilled",
			"rejected",
		]);
	});

	it("keeps a refresh that occurs while a request authenticates", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const { client, tokens } = await connect(t, actor);
		const refresh = (refreshToken: string) =>
			token(t, {
				grant_type: "refresh_token",
				client_id: client.client_id,
				refresh_token: refreshToken,
			});
		// The refresh completes after authenticate() reads the grant and
		// before it records the use of the grant.
		let refreshed: Awaited<ReturnType<typeof refresh>> | undefined;
		const get = t.store.get.bind(t.store);
		vi.spyOn(t.store, "get").mockImplementationOnce((async (
			...args: Parameters<typeof get>
		) => {
			refreshed = await refresh(tokens.refresh_token);
			return get(...args);
		}) as typeof get);
		await expect(
			t.services.oauth.authenticate(tokens.access_token),
		).resolves.toMatchObject({
			permissions: [...DEFAULT_AGENT_PERMISSIONS],
		});
		await expect(
			t.services.oauth.authenticate(refreshed?.access_token),
		).resolves.toMatchObject({
			permissions: [...DEFAULT_AGENT_PERMISSIONS],
		});
		await expectOAuthError(refresh(tokens.refresh_token), "invalid_grant");
	});

	it("ends a connection that the agent does not refresh in 30 days", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const { client, tokens } = await connect(t, actor);
		t.clock.advance(REFRESH_TOKEN_TTL_MS);
		await expectOAuthError(
			t.services.oauth.token({
				grant_type: "refresh_token",
				client_id: client.client_id,
				refresh_token: tokens.refresh_token,
			}),
			"invalid_grant",
		);
		await expect(t.services.oauth.list(actor)).resolves.toEqual([]);
		// The next connection removes the expired one from the store.
		await connect(t, actor);
		await expect(t.store.count("oauth_grants")).resolves.toBe(1);
	});

	it("expires access tokens and records use at most once a minute", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const { tokens } = await connect(t, actor);
		const lastUsed = async () =>
			(await t.services.oauth.list(actor))[0]?.lastUsedAt;
		await t.services.oauth.authenticate(tokens.access_token);
		expect(await lastUsed()).toBe("2026-11-02T12:00:00.000Z");
		t.clock.advance(30_000);
		await t.services.oauth.authenticate(tokens.access_token);
		expect(await lastUsed()).toBe("2026-11-02T12:00:00.000Z");
		t.clock.advance(31_000);
		await t.services.oauth.authenticate(tokens.access_token);
		expect(await lastUsed()).toBe("2026-11-02T12:01:01.000Z");

		t.clock.advance(3_600_000);
		await expect(
			t.services.oauth.authenticate(tokens.access_token),
		).resolves.toBeUndefined();
		for (const token of [
			undefined,
			"icmd_api_token",
			`${ACCESS_TOKEN_PREFIX}x`,
		]) {
			await expect(
				t.services.oauth.authenticate(token),
			).resolves.toBeUndefined();
		}
	});

	it("limits an OAuth agent to the current role of the member", async () => {
		const { member, actor } = await addMember(t, "editor", "Ed Editor");
		const { tokens } = await connect(t, actor);
		const connected = await t.services.oauth.authenticate(tokens.access_token);
		if (connected?.type !== "agent") {
			throw new Error("Expected an agent");
		}
		const agent = await t.services.agents.get(SYSTEM_ACTOR, connected.id);
		await t.services.agents.update(SYSTEM_ACTOR, agent.id, {
			permissions: permissionsForRole("editor"),
			revision: agent.revision,
		});
		await t.services.members.update(SYSTEM_ACTOR, member.id, {
			role: "viewer",
		});
		const limited = await t.services.oauth.authenticate(tokens.access_token);
		expect(limited && limited.type === "agent" && limited.permissions).toEqual(
			permissionsForRole("viewer"),
		);
	});

	it("lists every connection for an admin and their own for a member", async () => {
		const admin = await addMember(t, "admin", "Ada Admin");
		const editor = await addMember(t, "editor", "Ed Editor");
		await connect(t, admin.actor);
		t.clock.advance(1000);
		await connect(t, editor.actor);
		expect(
			(await t.services.oauth.list(admin.actor)).map((c) => c.memberName),
		).toEqual(["Ed Editor", "Ada Admin"]);
		expect(
			(await t.services.oauth.list(editor.actor)).map((c) => c.memberName),
		).toEqual(["Ed Editor"]);
	});

	it("disconnects an agent for its member or an admin", async () => {
		const admin = await addMember(t, "admin", "Ada Admin");
		const editor = await addMember(t, "editor", "Ed Editor");
		const viewer = await addMember(t, "viewer", "Vi Viewer");
		const first = await connect(t, editor.actor);
		t.clock.advance(1000);
		const second = await connect(t, editor.actor);
		const [secondConnection, firstConnection] = await t.services.oauth.list(
			editor.actor,
		);

		await expect(
			t.services.oauth.disconnect(viewer.actor, secondConnection?.id ?? ""),
		).rejects.toBeInstanceOf(NotFoundError);
		await t.services.oauth.disconnect(editor.actor, firstConnection?.id ?? "");
		await t.services.oauth.disconnect(admin.actor, secondConnection?.id ?? "");
		for (const { tokens } of [first, second]) {
			await expect(
				t.services.oauth.authenticate(tokens.access_token),
			).resolves.toBeUndefined();
		}
		await expect(
			t.services.oauth.disconnect(admin.actor, "ogr_unknown"),
		).rejects.toBeInstanceOf(NotFoundError);

		await t.store.insert("oauth_grants", {
			id: "ogr_loose",
			clientId: "ocl_x",
			clientName: "Loose",
			memberId: editor.member.id,
			accessTokenHash: "loose-access",
			accessTokenExpiresAt: "2026-12-02T12:00:00.000Z",
			refreshTokenHash: "loose-refresh",
			refreshTokenExpiresAt: "2026-12-02T12:00:00.000Z",
			createdAt: "2026-11-02T12:00:00.000Z",
		});
		await t.services.oauth.disconnect(editor.actor, "ogr_loose");
		expect(await t.store.get("oauth_grants", "ogr_loose")).toBeUndefined();
		expect(
			(await t.store.find("agent_activity")).some(
				(row) => row.credential?.id === "ogr_loose",
			),
		).toBe(false);
	});

	it("disconnects the agents of a member after a password reset or removal", async () => {
		const reset = await addMember(t, "editor", "Ed Editor");
		const removed = await addMember(t, "viewer", "Vi Viewer");
		const resetConnection = await connect(t, reset.actor);
		const pending = await register(t);
		const pendingCode = await approve(t, reset.actor, pending.client_id);
		const removedConnection = await connect(t, removed.actor);

		await t.services.members.update(SYSTEM_ACTOR, reset.member.id, {
			password: "a new password",
		});
		await t.services.members.delete(SYSTEM_ACTOR, removed.member.id);

		for (const { tokens } of [resetConnection, removedConnection]) {
			await expect(
				t.services.oauth.authenticate(tokens.access_token),
			).resolves.toBeUndefined();
		}
		await expectOAuthError(
			exchange(t, pending.client_id, pendingCode),
			"invalid_grant",
		);
	});

	it("does not accept a connection whose member is gone", async () => {
		const admin = await addMember(t, "admin", "Ada Admin");
		const removed = await addMember(t, "editor", "Ed Editor");
		const { tokens } = await connect(t, removed.actor);
		// The removal stops after the member is deleted, before the agents are.
		const deleteMany = t.store.deleteMany.bind(t.store);
		vi.spyOn(t.store, "deleteMany").mockImplementation((collection, query) =>
			collection === "oauth_grants"
				? Promise.reject(new Error("database offline"))
				: deleteMany(collection, query),
		);
		await expect(
			t.services.members.delete(SYSTEM_ACTOR, removed.member.id),
		).rejects.toThrow("database offline");
		await expect(
			t.services.oauth.authenticate(tokens.access_token),
		).resolves.toBeUndefined();
		await expect(t.services.oauth.list(admin.actor)).resolves.toEqual([]);
		const [grant] = await t.store.find("oauth_grants");
		const visible = await t.services.agents.get(
			admin.actor,
			grant?.agentId ?? "",
		);
		expect(visible.credentials[0]).toMatchObject({
			label: "Claude Code",
			type: "oauth",
		});
		expect(visible.credentials[0]?.memberName).toBeUndefined();
	});

	it("rejects a code when the member or the chosen agent is gone", async () => {
		const { actor } = await addMember(t, "editor", "Ed Editor");
		const { client_id } = await register(t);
		const code = await approve(t, actor, client_id);
		await t.store.delete("members", actor.id);
		await expectOAuthError(exchange(t, client_id, code), "invalid_grant");

		const admin = await addMember(t, "admin", "Ada Admin");
		const agent = await t.services.agents.create(admin.actor, { name: "Bot" });
		const chosenClient = await register(t);
		const chosenUrl = await t.services.oauth.approve(
			admin.actor,
			authorization(chosenClient.client_id),
			RESOURCE,
			{ agentId: agent.id },
		);
		const chosen = new URL(chosenUrl).searchParams.get("code") ?? "";
		await t.store.delete("agents", agent.id);
		await expectOAuthError(
			exchange(t, chosenClient.client_id, chosen),
			"invalid_grant",
		);

		const { tokens } = await connect(t, admin.actor);
		const connected = await t.services.oauth.authenticate(tokens.access_token);
		await t.store.delete("agents", connected?.id ?? "");
		await expect(
			t.services.oauth.authenticate(tokens.access_token),
		).resolves.toBeUndefined();
	});
});
