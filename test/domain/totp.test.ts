import {
	generateRecoveryCodes,
	generateTotpSecret,
	hashRecoveryCode,
	normalizeRecoveryCode,
	otpauthUri,
	RECOVERY_CODE_COUNT,
	totpAt,
	verifyTotp,
} from "@/lib/domain/totp";

/** RFC 6238 SHA1 secret `12345678901234567890`. */
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP", () => {
	it("matches the RFC 6238 SHA1 vectors", () => {
		expect(totpAt(SECRET, 0)).toBe("755224");
		expect(totpAt(SECRET, 59_000)).toBe("287082");
		expect(totpAt(SECRET, 1_111_111_109_000)).toBe("081804");
		expect(verifyTotp(SECRET, "287082", 59_000)).toEqual({ ok: true, step: 1 });
		expect(verifyTotp(SECRET.toLowerCase(), " 287082 ", 59_000)).toEqual({
			ok: true,
			step: 1,
		});
		expect(verifyTotp(`${SECRET}=`, "287082", 59_000)).toEqual({
			ok: true,
			step: 1,
		});
	});

	it("accepts the neighboring step and rejects a used step", () => {
		expect(verifyTotp(SECRET, "755224", 0)).toEqual({ ok: true, step: 0 });
		expect(verifyTotp(SECRET, "287082", 59_000, 1)).toEqual({ ok: false });
		expect(verifyTotp(SECRET, totpAt(SECRET, 59_000, 1), 59_000, 1)).toEqual({
			ok: true,
			step: 2,
		});
		expect(verifyTotp(SECRET, "000000", 59_000)).toEqual({ ok: false });
		expect(verifyTotp(SECRET, "nope", 59_000)).toEqual({ ok: false });
		expect(verifyTotp("!!!!", "123456", 59_000)).toEqual({ ok: false });
		expect(verifyTotp("", "000000", 0)).toEqual({ ok: false });
	});

	it("builds an otpauth link and recovery codes", () => {
		const secret = generateTotpSecret();
		expect(secret).toMatch(/^[A-Z2-7]{32}$/);
		expect(generateTotpSecret()).not.toBe(secret);
		const time = 1_700_000_000_000;
		expect(verifyTotp(secret, totpAt(secret, time), time).ok).toBe(true);
		const uri = otpauthUri({
			issuer: "Acme Status",
			account: "ada@acme.dev",
			secret,
		});
		expect(uri.startsWith("otpauth://totp/")).toBe(true);
		expect(uri).toContain(encodeURIComponent("Acme Status:ada@acme.dev"));
		expect(uri).toContain(`secret=${secret}`);
		expect(uri).toContain("algorithm=SHA1");
		expect(uri).toContain(`issuer=${encodeURIComponent("Acme Status")}`);

		const codes = generateRecoveryCodes();
		expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
		expect(new Set(codes).size).toBe(codes.length);
		for (const code of codes) {
			expect(code).toMatch(
				/^[abcdefghijkmnpqrstuvwxyz23456789]{4}-[abcdefghijkmnpqrstuvwxyz23456789]{4}$/,
			);
		}
		expect(hashRecoveryCode("ABCD-EFGH")).toBe(hashRecoveryCode("abcd efgh"));
		expect(normalizeRecoveryCode("AB-CD")).toBe("abcd");
	});
});
