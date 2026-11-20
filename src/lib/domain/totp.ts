import { createHmac, randomBytes } from "node:crypto";
import { safeEqual, sha256 } from "../crypto";

/** The authenticator code is wrong, or the recovery code is wrong. */
export const INVALID_TWO_FACTOR_CODE = "That code is not valid.";

/** The member already confirmed an authenticator. */
export const TWO_FACTOR_ALREADY_ON = "Two-factor authentication is already on.";

/** The member has no confirmed authenticator. */
export const TWO_FACTOR_ALREADY_OFF =
	"Two-factor authentication is already off.";

/** The organization setting does not let a member turn the authenticator off. */
export const TWO_FACTOR_REQUIRED_BY_ADMIN =
	"An admin requires two-factor authentication.";

/** The stored authenticator secret does not decrypt with the current key. */
export const TWO_FACTOR_SECRET_UNREADABLE =
	"The server cannot read the authenticator secret. Check ENCRYPTION_KEY.";

/** A code arrived before the member started authenticator setup. */
export const TWO_FACTOR_NOT_READY = "Set up an authenticator first.";

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** The number of recovery codes a member receives. */
export const RECOVERY_CODE_COUNT = 10;

function base32Encode(data: Buffer): string {
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of data) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			out += BASE32[(value >>> bits) & 31];
		}
	}
	return out;
}

function base32Decode(input: string): Buffer {
	const cleaned = input.toUpperCase().replace(/=+$/, "");
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const char of cleaned) {
		const index = BASE32.indexOf(char);
		if (index === -1) {
			throw new Error("Invalid base32");
		}
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			out.push((value >>> bits) & 0xff);
		}
	}
	if (out.length === 0) {
		throw new Error("Invalid base32");
	}
	return Buffer.from(out);
}

/** A new random TOTP secret, as base32 text. */
export function generateTotpSecret(): string {
	return base32Encode(randomBytes(20));
}

/** The 6-digit code for one time step (RFC 6238, HMAC-SHA1). */
export function totpCode(secret: string, step: number): string {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(step));
	const hmac = createHmac("sha1", base32Decode(secret))
		.update(counter)
		.digest();
	const offset = hmac.readUInt8(hmac.length - 1) & 0x0f;
	const binary =
		((hmac.readUInt8(offset) & 0x7f) << 24) |
		(hmac.readUInt8(offset + 1) << 16) |
		(hmac.readUInt8(offset + 2) << 8) |
		hmac.readUInt8(offset + 3);
	return (binary % 1_000_000).toString().padStart(DIGITS, "0");
}

/** The code for a clock time. `offset` moves the step by 30 seconds. */
export function totpAt(secret: string, timeMs: number, offset = 0): string {
	return totpCode(secret, Math.floor(timeMs / 1000 / PERIOD_SECONDS) + offset);
}

/**
 * Checks a code against the current step and the steps beside it.
 * A step at or before `lastStep` cannot match again.
 */
export function verifyTotp(
	secret: string,
	code: string,
	timeMs: number,
	lastStep?: number,
): { ok: true; step: number } | { ok: false } {
	const trimmed = code.trim();
	if (!/^\d{6}$/.test(trimmed)) {
		return { ok: false };
	}
	const base = Math.floor(timeMs / 1000 / PERIOD_SECONDS);
	for (const delta of [-1, 0, 1]) {
		const step = base + delta;
		if (step < 0 || (lastStep !== undefined && step <= lastStep)) {
			continue;
		}
		let expected: string;
		try {
			expected = totpCode(secret, step);
		} catch {
			return { ok: false };
		}
		if (safeEqual(expected, trimmed)) {
			return { ok: true, step };
		}
	}
	return { ok: false };
}

/** The `otpauth://` link a password manager imports. */
export function otpauthUri(input: {
	issuer: string;
	account: string;
	secret: string;
}): string {
	const label = encodeURIComponent(`${input.issuer}:${input.account}`);
	const pairs: ReadonlyArray<readonly [string, string]> = [
		["secret", input.secret],
		["issuer", input.issuer],
		["algorithm", "SHA1"],
		["digits", String(DIGITS)],
		["period", String(PERIOD_SECONDS)],
	];
	const query = pairs
		.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
		.join("&");
	return `otpauth://totp/${label}?${query}`;
}

/** Ten single-use codes, each shaped as `abcd-efgh`. */
export function generateRecoveryCodes(): string[] {
	return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
		const bytes = randomBytes(8);
		let body = "";
		for (const byte of bytes) {
			body += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
		}
		return `${body.slice(0, 4)}-${body.slice(4)}`;
	});
}

/** Removes spaces and dashes so `ABCD-EFGH` matches `abcdefgh`. */
export function normalizeRecoveryCode(code: string): string {
	return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The stored hash of one recovery code. */
export function hashRecoveryCode(code: string): string {
	return sha256(normalizeRecoveryCode(code));
}
