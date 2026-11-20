import { safeEqual, verifyPassword } from "../crypto";
import {
	generateRecoveryCodes,
	generateTotpSecret,
	hashRecoveryCode,
	INVALID_TWO_FACTOR_CODE,
	normalizeRecoveryCode,
	otpauthUri,
	TWO_FACTOR_ALREADY_OFF,
	TWO_FACTOR_ALREADY_ON,
	TWO_FACTOR_NOT_READY,
	TWO_FACTOR_REQUIRED_BY_ADMIN,
	TWO_FACTOR_SECRET_UNREADABLE,
	verifyTotp,
} from "../domain/totp";
import type { Actor, Member, MemberTwoFactor } from "../domain/types";
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../errors";
import { SecretBox } from "../secrets";
import { iso, type ServiceContext } from "./context";
import type { SessionService } from "./sessions";

/** What the account page and the sign-in page may show. */
export interface TwoFactorView {
	enabled: boolean;
	recoveryCodesRemaining: number;
	/** Present while setup waits for the first code. */
	setup?: { secret: string; uri: string };
	/** Present until the member hides the codes. */
	recoveryCodes?: string[];
	/** The stored secret does not decrypt with the current key. */
	unreadable?: boolean;
}

/**
 * Authenticator (TOTP) sign-in and recovery codes for a member.
 * The caller must pass the member who signed in, or the member of a
 * sign-in challenge. The methods do not trust an id from a form.
 */
export class TwoFactorService {
	private readonly ctx: ServiceContext;
	private readonly sessions: SessionService;
	private readonly box: SecretBox;

	constructor(ctx: ServiceContext, sessions: SessionService) {
		this.ctx = ctx;
		this.sessions = sessions;
		this.box = new SecretBox(ctx.config.encryption);
	}

	async status(memberId: string, issuer: string): Promise<TwoFactorView> {
		return this.view(await this.load(memberId), issuer);
	}

	/** Stores a new secret, or returns the secret that is already pending. */
	async begin(
		memberId: string,
		issuer: string,
	): Promise<{ secret: string; uri: string }> {
		const member = await this.load(memberId);
		if (member.twoFactor?.enabledAt) {
			throw new ConflictError(TWO_FACTOR_ALREADY_ON);
		}
		const pending = member.twoFactor?.secret;
		if (pending) {
			try {
				return this.link(member, this.open(member.id, pending), issuer);
			} catch {
				// A secret that does not decrypt is replaced below.
			}
		}
		const secret = generateTotpSecret();
		await this.write(member, {
			secret: this.seal(member.id, secret),
			recoveryCodeHashes: [],
		});
		return this.link(member, secret, issuer);
	}

	/** Confirms the first authenticator code and returns the recovery codes. */
	async confirm(memberId: string, code: string): Promise<string[]> {
		const member = await this.load(memberId);
		if (member.twoFactor?.enabledAt) {
			throw new ConflictError(TWO_FACTOR_ALREADY_ON);
		}
		if (!member.twoFactor?.secret) {
			throw new ValidationError(TWO_FACTOR_NOT_READY);
		}
		const secret = this.open(member.id, member.twoFactor.secret);
		const result = verifyTotp(secret, code, this.ctx.now().getTime());
		if (!result.ok) {
			throw new ValidationError(INVALID_TWO_FACTOR_CODE);
		}
		const recoveryCodes = generateRecoveryCodes();
		await this.write(member, {
			secret: this.seal(member.id, secret),
			enabledAt: iso(this.ctx.now()),
			lastStep: result.step,
			recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
			recoveryReveal: recoveryCodes,
		});
		return recoveryCodes;
	}

	/**
	 * Accepts a current authenticator code or one unused recovery code.
	 * The same authenticator step cannot succeed twice.
	 */
	async verify(memberId: string, code: string): Promise<void> {
		const member = await this.load(memberId);
		const record = member.twoFactor;
		if (!record?.enabledAt) {
			throw new ValidationError(TWO_FACTOR_ALREADY_OFF);
		}
		const secret = this.open(member.id, record.secret);
		const trimmed = code.trim();
		if (/^\d{6}$/.test(trimmed)) {
			const result = verifyTotp(
				secret,
				trimmed,
				this.ctx.now().getTime(),
				record.lastStep,
			);
			if (result.ok) {
				await this.write(member, { ...record, lastStep: result.step });
				return;
			}
		}
		const normalized = normalizeRecoveryCode(trimmed);
		if (normalized.length !== 8) {
			throw new ValidationError(INVALID_TWO_FACTOR_CODE);
		}
		const hash = hashRecoveryCode(trimmed);
		const index = record.recoveryCodeHashes.findIndex((item) =>
			safeEqual(item, hash),
		);
		if (index < 0) {
			throw new ValidationError(INVALID_TWO_FACTOR_CODE);
		}
		await this.write(member, {
			...record,
			recoveryCodeHashes: record.recoveryCodeHashes.filter(
				(_, item) => item !== index,
			),
		});
	}

	/** Replaces every recovery code. The member must confirm the password. */
	async regenerate(actor: Actor, password: string): Promise<string[]> {
		const member = await this.member(actor);
		await this.checkPassword(member, password);
		if (!member.twoFactor?.enabledAt) {
			throw new ValidationError(TWO_FACTOR_ALREADY_OFF);
		}
		const recoveryCodes = generateRecoveryCodes();
		await this.write(member, {
			...member.twoFactor,
			recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
			recoveryReveal: recoveryCodes,
		});
		return recoveryCodes;
	}

	/** Removes the plaintext recovery codes after the member saves them. */
	async acknowledge(actor: Actor): Promise<void> {
		const member = await this.member(actor);
		if (!member.twoFactor?.recoveryReveal) {
			return;
		}
		const { recoveryReveal: _reveal, ...rest } = member.twoFactor;
		await this.write(member, rest);
	}

	/** Turns authenticator sign-in off when the organization allows it. */
	async disable(
		actor: Actor,
		password: string,
		code: string,
		required: boolean,
	): Promise<void> {
		const member = await this.member(actor);
		if (required) {
			throw new ConflictError(TWO_FACTOR_REQUIRED_BY_ADMIN);
		}
		await this.checkPassword(member, password);
		await this.verify(member.id, code);
		await this.write(await this.load(member.id), null);
	}

	private view(member: Member, issuer: string): TwoFactorView {
		const record = member.twoFactor;
		const view: TwoFactorView = {
			enabled: record?.enabledAt !== undefined,
			recoveryCodesRemaining: record?.recoveryCodeHashes.length ?? 0,
			...(record?.recoveryReveal
				? { recoveryCodes: record.recoveryReveal }
				: {}),
		};
		if (!record?.secret || record.enabledAt) {
			return view;
		}
		try {
			const { secret, uri } = this.link(
				member,
				this.open(member.id, record.secret),
				issuer,
			);
			return { ...view, setup: { secret, uri } };
		} catch {
			return { ...view, unreadable: true };
		}
	}

	private link(
		member: Member,
		secret: string,
		issuer: string,
	): { secret: string; uri: string } {
		return {
			secret,
			uri: otpauthUri({ issuer, account: member.email, secret }),
		};
	}

	private seal(memberId: string, secret: string): string {
		if (!this.box.canEncrypt) {
			return `plain:${secret}`;
		}
		return this.box.encrypt(secret, this.context(memberId));
	}

	private open(memberId: string, stored: string): string {
		if (stored.startsWith("plain:")) {
			return stored.slice("plain:".length);
		}
		try {
			return this.box.decrypt(stored, this.context(memberId));
		} catch {
			throw new ValidationError(TWO_FACTOR_SECRET_UNREADABLE);
		}
	}

	private context(memberId: string): string {
		return `member-totp:${memberId}`;
	}

	private async checkPassword(member: Member, password: string): Promise<void> {
		if (!(await verifyPassword(password, member.passwordHash))) {
			throw new ValidationError("Current password is incorrect");
		}
	}

	private async member(actor: Actor): Promise<Member> {
		if (actor.type !== "member") {
			throw new ForbiddenError();
		}
		return this.load(actor.id);
	}

	private async load(id: string): Promise<Member> {
		const member = await this.ctx.store.get("members", id, {
			consistent: true,
		});
		if (!member) {
			throw new NotFoundError("Member", id);
		}
		return member;
	}

	private async write(
		member: Member,
		twoFactor: MemberTwoFactor | null,
	): Promise<void> {
		const next: Member = { ...member, updatedAt: iso(this.ctx.now()) };
		if (twoFactor) {
			next.twoFactor = twoFactor;
		} else {
			delete next.twoFactor;
		}
		await this.ctx.store.update("members", next);
		await this.sessions.invalidate();
	}
}
