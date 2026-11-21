import { Cacheable, createKeyv } from "cacheable";
import { createSecret, sha256 } from "../crypto";
import type { PublicMember, Session, SessionPurpose } from "../domain/types";
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

/** How long a sign-in challenge stays valid. */
export const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Wrong codes before the challenge ends and the member must sign in again. */
export const TWO_FACTOR_ATTEMPTS = 5;

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

	async create(
		memberId: string,
		options?: { purpose?: SessionPurpose },
	): Promise<{ token: string; session: Session }> {
		const now = this.ctx.now();
		await this.ctx.store.deleteMany("sessions", {
			where: [{ field: "expiresAt", op: "lte", value: iso(now) }],
		});
		const token = createSecret(32);
		const purpose = options?.purpose;
		const ttl = purpose
			? TWO_FACTOR_CHALLENGE_TTL_MS
			: this.ctx.config.sessionTtl;
		const session: Session = {
			id: sha256(token),
			memberId,
			createdAt: iso(now),
			expiresAt: iso(new Date(now.getTime() + ttl)),
			...(purpose ? { purpose } : {}),
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
		// A challenge is not a portal session. The sign-in page reads it.
		if (result.session.purpose) {
			return undefined;
		}
		return result;
	}

	/** The open sign-in challenge for a cookie token, if it has not expired. */
	async resolvePending(
		token: string | undefined,
	): Promise<SessionResult | undefined> {
		if (!token) {
			return undefined;
		}
		const id = sha256(token);
		const session = await this.ctx.store.get("sessions", id, {
			consistent: true,
		});
		if (!session?.purpose) {
			return undefined;
		}
		if (session.expiresAt <= iso(this.ctx.now())) {
			await this.ctx.store.delete("sessions", id);
			await this.cache.delete(id);
			return undefined;
		}
		const member = await this.ctx.store.get("members", session.memberId, {
			consistent: true,
		});
		if (!member) {
			return undefined;
		}
		return { session, member: toPublicMember(member) };
	}

	/** Turns a challenge into a full session and keeps the same cookie token. */
	async promote(token: string | undefined): Promise<Session | undefined> {
		const pending = await this.resolvePending(token);
		if (!pending) {
			return undefined;
		}
		const { purpose: _purpose, attempts: _attempts, ...rest } = pending.session;
		const session: Session = {
			...rest,
			expiresAt: iso(
				new Date(this.ctx.now().getTime() + this.ctx.config.sessionTtl),
			),
		};
		const updated = await this.ctx.store.update("sessions", session);
		await this.cache.delete(session.id);
		return updated;
	}

	/**
	 * Counts a wrong code. After the limit, the challenge is deleted.
	 * `missing` means the challenge is already gone.
	 */
	async failPending(
		token: string | undefined,
	): Promise<"retry" | "locked" | "missing"> {
		const pending = await this.resolvePending(token);
		if (!pending) {
			return "missing";
		}
		const attempts = (pending.session.attempts ?? 0) + 1;
		if (attempts >= TWO_FACTOR_ATTEMPTS) {
			await this.destroy(token);
			return "locked";
		}
		await this.ctx.store.update("sessions", { ...pending.session, attempts });
		await this.cache.delete(pending.session.id);
		return "retry";
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
		if (!session || !member) {
			await this.cache.delete(id);
			return undefined;
		}
		const result: SessionResult = { session, member: toPublicMember(member) };
		// A challenge must not stay in the portal cache.
		if (ttl > 0 && !session.purpose) {
			await this.cache.set(id, {
				result: structuredClone(result),
				freshUntil: now + ttl,
			} satisfies CachedResult);
		}
		return result;
	}
}
