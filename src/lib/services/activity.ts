import { createId } from "../crypto";
import type {
	AgentActivity,
	AgentActivityOutcome,
	AgentActivityType,
	AgentCredential,
	AuthorRef,
} from "../domain/types";
import { iso, type ServiceContext } from "./context";

/** Keep activity for 90 days. */
const RETENTION_MS = 90 * 86_400_000;
const PRUNE_INTERVAL_MS = 3_600_000;

export interface ActivityInput {
	agentId: string;
	type: AgentActivityType;
	actor: AuthorRef;
	credential?: AgentCredential;
	tool?: string;
	target?: { type: string; id: string; label?: string };
	outcome: AgentActivityOutcome;
	code?: string;
	permission?: string;
	added?: string[];
	removed?: string[];
}

/** Append-only activity for agents. A failed write does not fail the action. */
export class ActivityService {
	private readonly ctx: ServiceContext;
	private lastPrune = 0;

	constructor(ctx: ServiceContext) {
		this.ctx = ctx;
	}

	async record(input: ActivityInput): Promise<void> {
		const entry: AgentActivity = {
			id: createId("act"),
			agentId: input.agentId,
			type: input.type,
			actor: input.actor,
			outcome: input.outcome,
			createdAt: iso(this.ctx.now()),
		};
		if (input.credential) entry.credential = input.credential;
		if (input.tool) entry.tool = input.tool;
		if (input.target) entry.target = input.target;
		if (input.code) entry.code = input.code;
		if (input.permission) entry.permission = input.permission;
		if (input.added) entry.added = input.added;
		if (input.removed) entry.removed = input.removed;
		try {
			await this.ctx.store.insert("agent_activity", entry);
		} catch (error) {
			console.error("[activity] failed to record", error);
			return;
		}
		try {
			await this.prune();
		} catch (error) {
			console.error("[activity] failed to prune", error);
		}
	}

	async entries(
		agentId: string,
		options: { limit?: number; offset?: number } = {},
	): Promise<AgentActivity[]> {
		return this.ctx.store.find("agent_activity", {
			where: [{ field: "agentId", op: "eq", value: agentId }],
			sort: [{ field: "createdAt", direction: "desc" }],
			limit: options.limit,
			offset: options.offset,
		});
	}

	async recent(
		agentIds: readonly string[],
		limit: number,
	): Promise<AgentActivity[]> {
		if (agentIds.length === 0) {
			return [];
		}
		return this.ctx.store.find("agent_activity", {
			where: [{ field: "agentId", op: "in", value: [...agentIds] }],
			sort: [{ field: "createdAt", direction: "desc" }],
			limit,
		});
	}

	private async prune(): Promise<void> {
		const now = this.ctx.now().getTime();
		if (now - this.lastPrune < PRUNE_INTERVAL_MS) {
			return;
		}
		await this.ctx.store.deleteMany("agent_activity", {
			where: [
				{
					field: "createdAt",
					op: "lt",
					value: new Date(now - RETENTION_MS).toISOString(),
				},
			],
		});
		this.lastPrune = now;
	}
}
