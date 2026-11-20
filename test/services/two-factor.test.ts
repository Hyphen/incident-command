import { totpAt } from "@/lib/domain/totp";
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "@/lib/errors";
import { memberActor } from "@/lib/services/members";
import {
	TWO_FACTOR_ATTEMPTS,
	TWO_FACTOR_CHALLENGE_TTL_MS,
} from "@/lib/services/sessions";
import { agentActor, createTestContext, type TestContext } from "../helpers";

const PASSWORD = "password123";

async function owner(t: TestContext) {
	const member = await t.services.members.setup({
		email: "ada@acme.dev",
		name: "Ada",
		password: PASSWORD,
	});
	return { member, actor: memberActor(member) };
}

describe("two-factor authentication", () => {
	it("turns an authenticator on, then accepts codes and recovery codes", async () => {
		const t = createTestContext();
		const { member, actor } = await owner(t);
		const { twoFactor, members } = t.services;
		await expect(twoFactor.status(member.id, "Acme")).resolves.toEqual({
			enabled: false,
			recoveryCodesRemaining: 0,
		});
		await expect(twoFactor.confirm(member.id, "123456")).rejects.toBeInstanceOf(
			ValidationError,
		);
		await expect(twoFactor.begin("mem_missing", "Acme")).rejects.toBeInstanceOf(
			NotFoundError,
		);

		const started = await twoFactor.begin(member.id, "Acme");
		expect(started.uri).toContain(encodeURIComponent(`Acme:${member.email}`));
		const again = await twoFactor.begin(member.id, "Acme");
		expect(again.secret).toBe(started.secret);
		const stored = await t.store.get("members", member.id);
		expect(stored?.twoFactor?.secret).toBe(`plain:${started.secret}`);
		expect((await members.get(member.id))?.twoFactorEnabled).toBe(false);

		const time = t.clock.now().getTime();
		const codes = await twoFactor.confirm(
			member.id,
			totpAt(started.secret, time, -1),
		);
		expect(codes).toHaveLength(10);
		expect((await twoFactor.status(member.id, "Acme")).recoveryCodes).toEqual(
			codes,
		);
		expect((await members.get(member.id))?.twoFactorEnabled).toBe(true);
		const [listed] = await members.list(actor);
		expect(listed).not.toHaveProperty("twoFactor");
		expect(listed?.twoFactorEnabled).toBe(true);
		expect(JSON.stringify(listed)).not.toContain(started.secret);

		await expect(
			twoFactor.verify(member.id, totpAt(started.secret, time, -1)),
		).rejects.toBeInstanceOf(ValidationError);
		await twoFactor.verify(member.id, totpAt(started.secret, time));
		await expect(
			twoFactor.verify(member.id, totpAt(started.secret, time)),
		).rejects.toThrow("That code is not valid.");
		await expect(twoFactor.verify(member.id, "12345")).rejects.toThrow(
			"That code is not valid.",
		);

		await twoFactor.verify(member.id, codes[0]?.toUpperCase() ?? "");
		await expect(twoFactor.verify(member.id, codes[0] ?? "")).rejects.toThrow(
			"That code is not valid.",
		);
		await twoFactor.verify(member.id, (codes[1] ?? "").replace("-", ""));
		expect(
			(await twoFactor.status(member.id, "Acme")).recoveryCodesRemaining,
		).toBe(8);

		const replaced = await twoFactor.regenerate(actor, PASSWORD);
		await expect(twoFactor.verify(member.id, codes[2] ?? "")).rejects.toThrow(
			"That code is not valid.",
		);
		await twoFactor.verify(member.id, replaced[0] ?? "");
		await expect(twoFactor.regenerate(actor, "wrong-password")).rejects.toThrow(
			"Current password is incorrect",
		);

		await twoFactor.acknowledge(actor);
		expect(
			(await twoFactor.status(member.id, "Acme")).recoveryCodes,
		).toBeUndefined();
		await twoFactor.acknowledge(actor);

		await expect(
			twoFactor.disable(actor, "wrong-password", "000000", false),
		).rejects.toThrow("Current password is incorrect");
		await expect(
			twoFactor.disable(actor, PASSWORD, totpAt(started.secret, time), true),
		).rejects.toBeInstanceOf(ConflictError);
		expect((await members.get(member.id))?.twoFactorEnabled).toBe(true);
		await expect(
			twoFactor.disable(agentActor(), PASSWORD, "000000", false),
		).rejects.toBeInstanceOf(ForbiddenError);
		await twoFactor.disable(actor, PASSWORD, replaced[1] ?? "", false);
		expect((await members.get(member.id))?.twoFactorEnabled).toBe(false);
		expect(
			(await t.store.get("members", member.id))?.twoFactor,
		).toBeUndefined();
		await expect(
			twoFactor.verify(member.id, replaced[2] ?? ""),
		).rejects.toThrow("Two-factor authentication is already off.");
		await expect(twoFactor.regenerate(actor, PASSWORD)).rejects.toThrow(
			"Two-factor authentication is already off.",
		);
		const restarted = await twoFactor.begin(member.id, "Acme");
		await twoFactor.confirm(member.id, totpAt(restarted.secret, time));
		await expect(twoFactor.begin(member.id, "Acme")).rejects.toThrow(
			"Two-factor authentication is already on.",
		);
		await expect(twoFactor.confirm(member.id, "000000")).rejects.toThrow(
			"Two-factor authentication is already on.",
		);
	});

	it("keeps a plain secret readable after an encryption key is set", async () => {
		const plain = createTestContext();
		const { member } = await owner(plain);
		const started = await plain.services.twoFactor.begin(member.id, "Status");
		const keyed = createTestContext({
			env: { ENCRYPTION_KEY: "c".repeat(32) },
			store: plain.store,
		});
		await expect(
			keyed.services.twoFactor.status(member.id, "Status"),
		).resolves.toMatchObject({ setup: { secret: started.secret } });
		await keyed.services.twoFactor.confirm(
			member.id,
			totpAt(started.secret, keyed.clock.now().getTime()),
		);
		const stored = await keyed.store.get("members", member.id);
		expect(stored?.twoFactor?.secret.startsWith("v1.")).toBe(true);
		expect(stored?.twoFactor?.secret).not.toContain(started.secret);
	});

	it("replaces a secret that the current key cannot read", async () => {
		const first = createTestContext({
			env: { ENCRYPTION_KEY: "a".repeat(32) },
		});
		const { member } = await owner(first);
		const started = await first.services.twoFactor.begin(member.id, "Acme");
		expect(
			(await first.store.get("members", member.id))?.twoFactor?.secret,
		).toMatch(/^v1\./);
		const second = createTestContext({
			env: { ENCRYPTION_KEY: "b".repeat(32) },
			store: first.store,
		});
		await expect(
			second.services.twoFactor.status(member.id, "Acme"),
		).resolves.toMatchObject({ unreadable: true, enabled: false });
		const replaced = await second.services.twoFactor.begin(member.id, "Acme");
		expect(replaced.secret).not.toBe(started.secret);
		await second.services.twoFactor.confirm(
			member.id,
			totpAt(replaced.secret, second.clock.now().getTime()),
		);
		second.clock.advance(30_000);
		await expect(
			second.services.twoFactor.verify(
				member.id,
				totpAt(replaced.secret, second.clock.now().getTime()),
			),
		).resolves.toBeUndefined();
	});

	it("does not treat a challenge as a portal session", async () => {
		const t = createTestContext();
		const { member } = await owner(t);
		const { token } = await t.services.sessions.create(member.id, {
			purpose: "enroll",
		});
		await expect(t.services.sessions.resolve(token)).resolves.toBeUndefined();
		await expect(
			t.services.sessions.resolvePending(undefined),
		).resolves.toBeUndefined();
		await expect(
			t.services.sessions.resolvePending("bogus"),
		).resolves.toBeUndefined();
		const full = await t.services.sessions.create(member.id);
		await expect(
			t.services.sessions.resolvePending(full.token),
		).resolves.toBeUndefined();
		await expect(
			t.services.sessions.resolvePending(token),
		).resolves.toMatchObject({ member: { id: member.id } });

		await t.services.sessions.resolve(token);
		const promoted = await t.services.sessions.promote(token);
		expect(promoted?.purpose).toBeUndefined();
		expect(promoted?.expiresAt).toBe("2026-11-09T12:00:00.000Z");
		await expect(t.services.sessions.resolve(token)).resolves.toMatchObject({
			member: { id: member.id },
		});
		await expect(t.services.sessions.promote(token)).resolves.toBeUndefined();
		await expect(
			t.services.sessions.promote(undefined),
		).resolves.toBeUndefined();

		const challenge = await t.services.sessions.create(member.id, {
			purpose: "totp",
		});
		for (let attempt = 1; attempt < TWO_FACTOR_ATTEMPTS; attempt += 1) {
			expect(await t.services.sessions.failPending(challenge.token)).toBe(
				"retry",
			);
		}
		expect(await t.services.sessions.failPending(challenge.token)).toBe(
			"locked",
		);
		expect(await t.services.sessions.failPending(undefined)).toBe("missing");
		await expect(
			t.services.sessions.resolvePending(challenge.token),
		).resolves.toBeUndefined();

		const expired = await t.services.sessions.create(member.id, {
			purpose: "totp",
		});
		const expiredPending = await t.services.sessions.create(member.id, {
			purpose: "enroll",
		});
		const before = await t.store.count("sessions");
		t.clock.advance(TWO_FACTOR_CHALLENGE_TTL_MS);
		await expect(
			t.services.sessions.resolve(expired.token),
		).resolves.toBeUndefined();
		await expect(
			t.services.sessions.resolvePending(expiredPending.token),
		).resolves.toBeUndefined();
		expect(await t.store.count("sessions")).toBe(before - 2);

		const pendingGone = await t.services.sessions.create("mem_gone", {
			purpose: "totp",
		});
		await expect(
			t.services.sessions.resolvePending(pendingGone.token),
		).resolves.toBeUndefined();
	});
});
