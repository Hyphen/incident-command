import { createId, createSecret, sha256 } from "../crypto";
import {
	can,
	DEFAULT_AGENT_PERMISSIONS,
	grantablePermissions,
	legacyRolePermissions,
	normalizePermissions,
	type Permission,
} from "../domain/permissions";
import {
	type CreateAgentInput,
	type CreateAgentTokenInput,
	createAgentSchema,
	createAgentTokenSchema,
	type UpdateAgentInput,
	updateAgentSchema,
} from "../domain/schemas";
import type {
	Actor,
	Agent,
	AgentActivity,
	AgentActor,
	AgentToken,
	AuthorRef,
	OAuthGrant,
} from "../domain/types";
import { ConflictError, NotFoundError } from "../errors";
import type { ActivityService } from "./activity";
import {
	authorRef,
	iso,
	parse,
	requirePermission,
	type ServiceContext,
} from "./context";

export const TOKEN_PREFIX = "icmd_";
const LAST_USED_RESOLUTION_MS = 60_000;

export function isAgentActive(
	agent: { revokedAt?: string; expiresAt?: string },
	now: Date,
) {
	return (
		!agent.revokedAt &&
		(!agent.expiresAt || new Date(agent.expiresAt).getTime() > now.getTime())
	);
}

/** A credential without its secret. */
export interface PublicCredential {
	id: string;
	type: "token" | "oauth";
	label: string;
	memberId?: string;
	memberName?: string;
	lastUsedAt?: string;
	expiresAt?: string;
	revokedAt?: string;
	active: boolean;
}

/** An agent and its credentials, safe to render and return from MCP. */
export interface PublicAgent {
	id: string;
	name: string;
	description?: string;
	permissions: Permission[];
	ownerId?: string;
	ownerName?: string;
	migratedFrom?: "token" | "oauth";
	revision: number;
	createdBy: AuthorRef;
	createdAt: string;
	updatedAt: string;
	credentials: PublicCredential[];
	lastUsedAt?: string;
}

/** Manages agents and the API tokens that call the MCP server. */
export class AgentService {
	private readonly ctx: ServiceContext;
	private readonly activityLog: ActivityService;

	constructor(ctx: ServiceContext, activity: ActivityService) {
		this.ctx = ctx;
		this.activityLog = activity;
	}

	async list(actor: Actor): Promise<PublicAgent[]> {
		const [agents, tokens, grants, members] = await Promise.all([
			this.ctx.store.find("agents", {
				sort: [{ field: "createdAt", direction: "desc" }],
			}),
			this.ctx.store.find("agent_tokens"),
			this.ctx.store.find("oauth_grants"),
			this.ctx.store.find("members"),
		]);
		const names = new Map(members.map((member) => [member.id, member.name]));
		return this.visible(actor, agents, grants).map((agent) =>
			this.toPublic(agent, tokens, grants, names),
		);
	}

	async get(actor: Actor, id: string): Promise<PublicAgent> {
		const agent = await this.load(id);
		const grants = await this.ctx.store.find("oauth_grants", {
			where: [{ field: "agentId", op: "eq", value: id }],
		});
		if (!this.canSee(actor, agent, grants)) {
			throw new NotFoundError("Agent", id);
		}
		const [tokens, members] = await Promise.all([
			this.ctx.store.find("agent_tokens", {
				where: [{ field: "agentId", op: "eq", value: id }],
			}),
			this.ctx.store.find("members"),
		]);
		const names = new Map(members.map((member) => [member.id, member.name]));
		return this.toPublic(agent, tokens, grants, names);
	}

	/** Agents the member may attach on the consent page. */
	async choices(actor: Actor): Promise<PublicAgent[]> {
		const agents = await this.list(actor);
		if (can(actor, "agents.manage") || actor.type !== "member") {
			return can(actor, "agents.manage") ? agents : [];
		}
		return agents.filter((agent) => agent.ownerId === actor.id);
	}

	/** The agent a member selected on the consent page. */
	async requireChoice(actor: Actor, id: string): Promise<Agent> {
		const agent = await this.load(id);
		if (
			can(actor, "agents.manage") ||
			(actor.type === "member" && agent.ownerId === actor.id)
		) {
			return agent;
		}
		throw new NotFoundError("Agent", id);
	}

	async create(actor: Actor, input: CreateAgentInput): Promise<PublicAgent> {
		requirePermission(actor, "agents.manage");
		const data = parse(createAgentSchema, input);
		const permissions = grantablePermissions(
			actor,
			data.permissions ?? [...DEFAULT_AGENT_PERMISSIONS],
		);
		const agent = await this.insertAgent({
			name: data.name,
			description: data.description,
			permissions,
			createdBy: authorRef(actor),
		});
		return this.get(actor, agent.id);
	}

	/** Creates an agent when a member finishes an OAuth consent for a new agent. */
	async createOwned(input: {
		name: string;
		ownerId: string;
		createdBy: AuthorRef;
	}): Promise<Agent> {
		return this.insertAgent({
			name: input.name,
			permissions: [...DEFAULT_AGENT_PERMISSIONS],
			ownerId: input.ownerId,
			createdBy: input.createdBy,
		});
	}

	async update(
		actor: Actor,
		id: string,
		input: UpdateAgentInput,
	): Promise<PublicAgent> {
		const current = await this.load(id);
		const data = parse(updateAgentSchema, input);
		const owner = actor.type === "member" && current.ownerId === actor.id;
		if (!can(actor, "agents.manage") && !owner) {
			throw new NotFoundError("Agent", id);
		}
		if (data.permissions && !can(actor, "agents.manage")) {
			requirePermission(actor, "agents.manage");
		}
		if (data.revision !== current.revision) {
			throw new ConflictError(
				"Somebody changed this agent. Examine the new values and save again.",
			);
		}
		const permissions = data.permissions
			? grantablePermissions(actor, data.permissions)
			: normalizePermissions(current.permissions);
		const next: Agent = {
			...current,
			name: data.name ?? current.name,
			permissions,
			revision: current.revision + 1,
			updatedAt: iso(this.ctx.now()),
		};
		if (data.description === null) {
			delete next.description;
		} else if (data.description !== undefined) {
			next.description = data.description;
		}
		if (data.permissions) {
			delete next.migratedFrom;
		}
		const saved = await this.ctx.store.update("agents", next, {
			where: [{ field: "revision", op: "eq", value: current.revision }],
		});
		if (!saved) {
			throw new ConflictError(
				"Somebody changed this agent. Examine the new values and save again.",
			);
		}
		if (saved.name !== current.name) {
			await this.activityLog.record({
				agentId: id,
				type: "agent_renamed",
				actor: authorRef(actor),
				outcome: "ok",
			});
		}
		if (data.permissions) {
			const previous = new Set<string>(current.permissions);
			const selected = new Set<string>(permissions);
			const added = permissions.filter(
				(permission) => !previous.has(permission),
			);
			const removed = current.permissions.filter(
				(permission) => !selected.has(permission),
			);
			if (added.length > 0 || removed.length > 0) {
				await this.activityLog.record({
					agentId: id,
					type: "permissions_changed",
					actor: authorRef(actor),
					outcome: "ok",
					added,
					removed,
				});
			}
		}
		return this.get(actor, id);
	}

	async createToken(
		actor: Actor,
		agentId: string,
		input: CreateAgentTokenInput,
	): Promise<{ token: string; credentialId: string; agent: PublicAgent }> {
		requirePermission(actor, "agents.manage");
		const data = parse(createAgentTokenSchema, input);
		await this.load(agentId);
		const now = this.ctx.now();
		const token = `${TOKEN_PREFIX}${createSecret(32)}`;
		const credential: AgentToken = {
			id: createId("tok"),
			agentId,
			tokenHash: sha256(token),
			tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 6),
			createdBy: authorRef(actor),
			createdAt: iso(now),
		};
		if (data.expiresInDays) {
			credential.expiresAt = iso(
				new Date(now.getTime() + data.expiresInDays * 86_400_000),
			);
		}
		await this.ctx.store.insert("agent_tokens", credential);
		await this.activityLog.record({
			agentId,
			type: "token_created",
			actor: authorRef(actor),
			credential: { type: "token", id: credential.id },
			target: { type: "token", id: credential.id },
			outcome: "ok",
		});
		return {
			token,
			credentialId: credential.id,
			agent: await this.get(actor, agentId),
		};
	}

	async revokeToken(actor: Actor, id: string): Promise<PublicCredential> {
		requirePermission(actor, "agents.manage");
		const credential = await this.ctx.store.get("agent_tokens", id);
		if (!credential) {
			throw new NotFoundError("Token", id);
		}
		const revokedAt = credential.revokedAt ?? iso(this.ctx.now());
		const next = { ...credential, revokedAt };
		await this.ctx.store.update("agent_tokens", next);
		if (!credential.revokedAt && credential.agentId) {
			await this.activityLog.record({
				agentId: credential.agentId,
				type: "token_revoked",
				actor: authorRef(actor),
				credential: { type: "token", id },
				target: { type: "token", id },
				outcome: "ok",
			});
		}
		const [members, grants] = await Promise.all([
			this.ctx.store.find("members"),
			credential.agentId
				? this.ctx.store.find("oauth_grants", {
						where: [{ field: "agentId", op: "eq", value: credential.agentId }],
					})
				: Promise.resolve([]),
		]);
		const names = new Map(members.map((member) => [member.id, member.name]));
		const agent = credential.agentId
			? await this.ctx.store.get("agents", credential.agentId)
			: undefined;
		const view = agent
			? this.toPublic(agent, [next], grants, names)
			: undefined;
		const summary = view?.credentials.find((item) => item.id === id);
		if (!summary) {
			throw new NotFoundError("Token", id);
		}
		return summary;
	}

	async delete(actor: Actor, id: string): Promise<void> {
		requirePermission(actor, "agents.manage");
		await this.load(id);
		const where = [{ field: "agentId" as const, op: "eq" as const, value: id }];
		await this.ctx.store.deleteMany("oauth_grants", { where });
		await this.ctx.store.deleteMany("agent_tokens", { where });
		await this.ctx.store.deleteMany("agent_activity", { where });
		if (!(await this.ctx.store.delete("agents", id))) {
			throw new NotFoundError("Agent", id);
		}
	}

	async activity(
		actor: Actor,
		id: string,
		options: { limit?: number; offset?: number } = {},
	): Promise<AgentActivity[]> {
		await this.get(actor, id);
		return this.activityLog.entries(id, options);
	}

	async recentActivity(actor: Actor, limit = 20): Promise<AgentActivity[]> {
		const agents = await this.list(actor);
		return this.activityLog.recent(
			agents.map((agent) => agent.id),
			limit,
		);
	}

	/** Resolves a bearer token to an agent actor, or `undefined` when it is not valid. */
	async authenticate(
		token: string | undefined,
	): Promise<AgentActor | undefined> {
		if (!token?.startsWith(TOKEN_PREFIX)) {
			return undefined;
		}
		const [credential] = await this.ctx.store.find("agent_tokens", {
			where: [{ field: "tokenHash", op: "eq", value: sha256(token) }],
			limit: 1,
		});
		const now = this.ctx.now();
		if (!credential || !isAgentActive(credential, now)) {
			return undefined;
		}
		const agent = await this.adoptLegacyToken(credential);
		if (!agent || !(await this.touchToken(credential, now))) {
			return undefined;
		}
		return this.actorFor(agent, { type: "token", id: credential.id });
	}

	/** Attaches an OAuth grant to an agent. Migrates a grant that has no agent yet. */
	async ensureGrant(grant: OAuthGrant): Promise<Agent | undefined> {
		return this.adoptLegacyGrant(grant);
	}

	/** Clears ownership when the member is removed. The agents remain. */
	async releaseOwner(memberId: string): Promise<void> {
		const owned = await this.ctx.store.find("agents", {
			where: [{ field: "ownerId", op: "eq", value: memberId }],
		});
		for (const agent of owned) {
			await this.clearOwner(agent.id, memberId);
		}
	}

	/** Builds agents for tokens and grants that were stored before permissions. */
	async migrate(): Promise<void> {
		const tokens = await this.ctx.store.find("agent_tokens", {
			where: [{ field: "agentId", op: "eq", value: null }],
		});
		for (const token of tokens) {
			await this.adoptLegacyToken(token);
		}
		const grants = await this.ctx.store.find("oauth_grants", {
			where: [{ field: "agentId", op: "eq", value: null }],
		});
		for (const grant of grants) {
			await this.adoptLegacyGrant(grant);
		}
	}

	private actorFor(
		agent: Agent,
		credential: { type: "token" | "oauth"; id: string },
		permissions: readonly string[] = normalizePermissions(agent.permissions),
	): AgentActor {
		return {
			type: "agent",
			id: agent.id,
			name: agent.name,
			permissions,
			credential,
		};
	}

	private async insertAgent(input: {
		name: string;
		description?: string;
		permissions: Permission[];
		ownerId?: string;
		createdBy: AuthorRef;
		migratedFrom?: "token" | "oauth";
		id?: string;
		createdAt?: string;
	}): Promise<Agent> {
		const now = input.createdAt ?? iso(this.ctx.now());
		const agent: Agent = {
			id: input.id ?? createId("agt"),
			name: input.name,
			permissions: input.permissions,
			createdBy: input.createdBy,
			revision: 1,
			createdAt: now,
			updatedAt: now,
		};
		if (input.description) agent.description = input.description;
		if (input.ownerId) agent.ownerId = input.ownerId;
		if (input.migratedFrom) agent.migratedFrom = input.migratedFrom;
		await this.ctx.store.insert("agents", agent);
		if (!input.migratedFrom) {
			await this.activityLog.record({
				agentId: agent.id,
				type: "agent_created",
				actor: input.createdBy,
				outcome: "ok",
			});
		}
		return agent;
	}

	private async touchToken(
		credential: AgentToken,
		now: Date,
	): Promise<boolean> {
		const lastUsed = credential.lastUsedAt
			? new Date(credential.lastUsedAt).getTime()
			: 0;
		if (now.getTime() - lastUsed <= LAST_USED_RESOLUTION_MS) {
			return true;
		}
		const updated = await this.ctx.store.update(
			"agent_tokens",
			{ ...credential, lastUsedAt: iso(now) },
			{
				where: [
					{ field: "tokenHash", op: "eq", value: credential.tokenHash },
					{ field: "revokedAt", op: "eq", value: null },
				],
			},
		);
		// A failed write means the token was revoked, replaced, or deleted.
		return updated !== undefined;
	}

	private async adoptLegacyToken(
		token: AgentToken,
	): Promise<Agent | undefined> {
		if (token.agentId) {
			return this.ctx.store.get("agents", token.agentId);
		}
		const agent = await this.insertMigrated({
			id: token.id,
			name: token.name || "Agent",
			description: token.description,
			permissions: legacyRolePermissions(token.role ?? "editor"),
			createdBy: token.createdBy,
			migratedFrom: "token",
			createdAt: token.createdAt,
		});
		await this.ctx.store.update(
			"agent_tokens",
			{ ...token, agentId: token.id },
			{ where: [{ field: "agentId", op: "eq", value: null }] },
		);
		return agent;
	}

	private async adoptLegacyGrant(
		grant: OAuthGrant,
	): Promise<Agent | undefined> {
		if (grant.agentId) {
			return this.ctx.store.get("agents", grant.agentId);
		}
		const member = await this.ctx.store.get("members", grant.memberId);
		if (!member) {
			await this.ctx.store.delete("oauth_grants", grant.id);
			return undefined;
		}
		const id = grant.id.startsWith("ogr_")
			? `agt_${grant.id.slice(4)}`
			: `agt_${grant.id}`;
		const agent = await this.insertMigrated({
			id,
			name: grant.clientName || "Agent",
			permissions: legacyRolePermissions(member.role),
			ownerId: member.id,
			createdBy: { type: "member", id: member.id, name: member.name },
			migratedFrom: "oauth",
			createdAt: grant.createdAt,
		});
		await this.ctx.store.update(
			"oauth_grants",
			{ ...grant, agentId: id },
			{ where: [{ field: "agentId", op: "eq", value: null }] },
		);
		return agent;
	}

	private async insertMigrated(input: {
		id: string;
		name: string;
		description?: string;
		permissions: Permission[];
		ownerId?: string;
		createdBy: AuthorRef;
		migratedFrom: "token" | "oauth";
		createdAt: string;
	}): Promise<Agent> {
		try {
			return await this.insertAgent(input);
		} catch (error) {
			if (!(error instanceof ConflictError)) {
				throw error;
			}
			const existing = await this.ctx.store.get("agents", input.id);
			if (!existing) {
				throw error;
			}
			return existing;
		}
	}

	private async clearOwner(id: string, memberId: string): Promise<void> {
		for (let attempt = 0; attempt < 3; attempt++) {
			const current = await this.ctx.store.get("agents", id, {
				consistent: true,
			});
			if (!current || current.ownerId !== memberId) {
				return;
			}
			const next: Agent = {
				...current,
				revision: current.revision + 1,
				updatedAt: iso(this.ctx.now()),
			};
			delete next.ownerId;
			const saved = await this.ctx.store.update("agents", next, {
				where: [{ field: "revision", op: "eq", value: current.revision }],
			});
			if (saved) {
				await this.activityLog.record({
					agentId: id,
					type: "owner_removed",
					actor: { type: "system", id: "system", name: "System" },
					outcome: "ok",
				});
				return;
			}
		}
	}

	private visible(
		actor: Actor,
		agents: Agent[],
		grants: OAuthGrant[],
	): Agent[] {
		if (can(actor, "agents.read") || can(actor, "agents.manage")) {
			return agents;
		}
		if (actor.type !== "member") {
			return [];
		}
		const connected = new Set(
			grants
				.filter((grant) => grant.memberId === actor.id && grant.agentId)
				.map((grant) => grant.agentId as string),
		);
		return agents.filter(
			(agent) => agent.ownerId === actor.id || connected.has(agent.id),
		);
	}

	private canSee(actor: Actor, agent: Agent, grants: OAuthGrant[]): boolean {
		return this.visible(actor, [agent], grants).length === 1;
	}

	private toPublic(
		agent: Agent,
		tokens: AgentToken[],
		grants: OAuthGrant[],
		names: Map<string, string>,
	): PublicAgent {
		const now = this.ctx.now();
		const credentials: PublicCredential[] = [
			...tokens
				.filter((token) => token.agentId === agent.id)
				.map((token) => ({
					id: token.id,
					type: "token" as const,
					label: `${token.tokenPrefix}…`,
					lastUsedAt: token.lastUsedAt,
					expiresAt: token.expiresAt,
					revokedAt: token.revokedAt,
					active: isAgentActive(token, now),
				})),
			...grants
				.filter((grant) => grant.agentId === agent.id)
				.map((grant) => ({
					id: grant.id,
					type: "oauth" as const,
					label: names.get(grant.memberId) ?? grant.clientName,
					memberId: grant.memberId,
					memberName: names.get(grant.memberId),
					lastUsedAt: grant.lastUsedAt,
					expiresAt: grant.refreshTokenExpiresAt,
					active: grant.refreshTokenExpiresAt > iso(now),
				})),
		];
		const lastUsedAt = credentials
			.map((credential) => credential.lastUsedAt)
			.filter((value): value is string => Boolean(value))
			.sort()
			.at(-1);
		const view: PublicAgent = {
			id: agent.id,
			name: agent.name,
			permissions: normalizePermissions(agent.permissions),
			ownerId: agent.ownerId,
			ownerName: agent.ownerId ? names.get(agent.ownerId) : undefined,
			migratedFrom: agent.migratedFrom,
			revision: agent.revision,
			createdBy: agent.createdBy,
			createdAt: agent.createdAt,
			updatedAt: agent.updatedAt,
			credentials,
		};
		if (agent.description) view.description = agent.description;
		if (!view.ownerId) delete view.ownerId;
		if (!view.ownerName) delete view.ownerName;
		if (!view.migratedFrom) delete view.migratedFrom;
		if (lastUsedAt) view.lastUsedAt = lastUsedAt;
		return view;
	}

	private async load(id: string): Promise<Agent> {
		const agent = await this.ctx.store.get("agents", id);
		if (!agent) {
			throw new NotFoundError("Agent", id);
		}
		return agent;
	}
}
