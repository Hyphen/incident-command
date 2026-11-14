import { Cacheable, createKeyv } from "cacheable";
import { createSecret, sha256 } from "../crypto";
import type { PublicMember, Session } from "../domain/types";
import type { ReadOptions } from "../store/types";
import { iso, type ServiceContext } from "./context";
import { toPublicMember } from "./members";

export interface SessionResult {
	session: Session;
	member: PublicMember;
}

interface CachedResult {
	result: SessionResult;
	freshUntil: number;
}

/**
 * Database-backed sessions. Only a hash of the cookie token is stored.
 *
 * Each portal page resolves the session. A memory cache keeps each result for
 * `config.cache.sessionTtl`, so most page views do not read the database. The
 * cache is for each instance. A different instance can use a session or a
 * member record that is out of date for that time, at most. A caller that
 * changes data sets `consistent`, which always reads the database.
 */
export class SessionService {
	private readonly ctx: ServiceContext;
	private readonly cache: Cacheable;

	constructor(ctx: ServiceContext) {
		this.ctx = ctx;
		this.cache = new Cacheable({
			primary: createKeyv({ lruSize: ctx.config.cache.maxEntries }),
		});
	}

	async create(memberId: string): Promise<{ token: string; session: Session }> {
		const now = this.ctx.now();
		await this.ctx.store.deleteMany("sessions", {
			where: [{ field: "expiresAt", op: "lte", value: iso(now) }],
		});
		const token = createSecret(32);
		const session: Session = {
			id: sha256(token),
			memberId,
			createdAt: iso(now),
			expiresAt: iso(new Date(now.getTime() + this.ctx.config.sessionTtl)),
		};
		await this.ctx.store.insert("sessions", session);
		return { token, session };
	}

	async resolve(
		token: string | undefined,
		options?: ReadOptions,
	): Promise<SessionResult | undefined> {
		if (!token) {
			return undefined;
		}
		const id = sha256(token);
		const result = await this.lookup(id, options);
		if (!result) {
			return undefined;
		}
		if (result.session.expiresAt <= iso(this.ctx.now())) {
			await this.ctx.store.delete("sessions", id);
			await this.cache.delete(id);
			return undefined;
		}
		return result;
	}

	async destroy(token: string | undefined): Promise<void> {
		if (token) {
			const id = sha256(token);
			await this.ctx.store.delete("sessions", id);
			await this.cache.delete(id);
		}
	}

	async destroyForMember(memberId: string): Promise<void> {
		await this.ctx.store.deleteMany("sessions", {
			where: [{ field: "memberId", op: "eq", value: memberId }],
		});
		await this.invalidate();
	}

	/** Removes each cached result. Call this after a change to a member. */
	async invalidate(): Promise<void> {
		await this.cache.clear();
	}

	private async lookup(
		id: string,
		options: ReadOptions | undefined,
	): Promise<SessionResult | undefined> {
		const ttl = this.ctx.config.cache.sessionTtl;
		const now = this.ctx.now().getTime();
		if (ttl > 0 && !options?.consistent) {
			const cached = await this.cache.get<CachedResult>(id);
			if (cached && cached.freshUntil > now) {
				return structuredClone(cached.result);
			}
		}
		const session = await this.ctx.store.get("sessions", id);
		const member =
			session && (await this.ctx.store.get("members", session.memberId));
		if (!member) {
			await this.cache.delete(id);
			return undefined;
		}
		const result: SessionResult = { session, member: toPublicMember(member) };
		if (ttl > 0) {
			await this.cache.set(id, {
				result: structuredClone(result),
				freshUntil: now + ttl,
			} satisfies CachedResult);
		}
		return result;
	}
}
