import { render, screen } from "@testing-library/react";
import AccountPage from "@/app/manage/(portal)/account/page";
import DashboardPage from "@/app/manage/(portal)/page";
import {
	acknowledgeRecoveryCodesAction,
	beginTwoFactorAction,
	confirmTwoFactorAction,
	disableTwoFactorAction,
	loginAction,
	logoutAction,
	regenerateRecoveryCodesAction,
	submitTwoFactorAction,
} from "@/app/manage/actions";
import TwoFactorLoginPage from "@/app/manage/login/two-factor/page";
import { createApp, setApp } from "@/lib/app";
import { SESSION_COOKIE } from "@/lib/auth";
import { loadConfig } from "@/lib/config";
import { totpAt } from "@/lib/domain/totp";
import { otpQrSvg } from "@/lib/otp-qr";
import { SYSTEM_ACTOR } from "@/lib/services/context";
import {
	expectFlashRedirect,
	expectSameFlash,
	form,
	redirectOf,
	setupApp,
	signIn,
} from "./app";
import { cookieJar } from "./next-state";

const flash = (value: Record<string, string> = {}) => ({
	searchParams: Promise.resolve(value),
});

const CREDENTIALS = {
	name: "Ada",
	email: "ada@acme.dev",
	password: "password123",
};

describe("two-factor sign-in", () => {
	it("sets up an authenticator after the password and then accepts a recovery code", async () => {
		const { app, services, clock } = await setupApp();
		const member = await services.members.setup(CREDENTIALS);
		expect(
			await redirectOf(
				loginAction(
					form({
						email: "ADA@acme.dev",
						password: CREDENTIALS.password,
						next: "https://evil.example",
					}),
				),
			),
		).toBe("/manage/login/two-factor");
		const settings = await services.settings.get();
		const first = await services.twoFactor.status(member.id, settings.siteName);
		expect(first.setup?.secret).toBeTruthy();
		await redirectOf(logoutAction());
		const next = "/manage/drafts/drf_1";
		expect(
			await redirectOf(
				loginAction(
					form({
						email: CREDENTIALS.email,
						password: CREDENTIALS.password,
						next,
					}),
				),
			),
		).toBe(`/manage/login/two-factor?next=${next}`);
		const second = await services.twoFactor.status(
			member.id,
			settings.siteName,
		);
		expect(second.setup?.secret).toBe(first.setup?.secret);

		const pending = render(
			await TwoFactorLoginPage(
				flash({ notice: "welcome_admin", error: "invalid_two_factor", next }),
			),
		);
		expect(
			screen.getByText("Welcome! Your admin account is ready."),
		).toBeInTheDocument();
		expect(screen.getByRole("alert")).toHaveTextContent(
			"That code is not valid.",
		);
		expect(screen.getByText(second.setup?.secret ?? "")).toBeInTheDocument();
		const qr = screen.getByRole("img", {
			name: "QR code for your authenticator app",
		});
		const src = qr.getAttribute("src") ?? "";
		expect(
			decodeURIComponent(
				src.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""),
			),
		).toBe(await otpQrSvg(second.setup?.uri ?? ""));
		expect(
			screen.getByRole("button", { name: "Turn on and continue" }),
		).toBeInTheDocument();
		pending.unmount();

		expectSameFlash(
			await redirectOf(submitTwoFactorAction(form({ code: "000000", next }))),
			`/manage/login/two-factor?next=${encodeURIComponent(next)}&error=That code is not valid.`,
		);
		const code = totpAt(second.setup?.secret ?? "", clock.now().getTime());
		expectSameFlash(
			await redirectOf(submitTwoFactorAction(form({ code, next }))),
			`/manage/account?next=${encodeURIComponent(next)}&notice=Two-factor authentication is on. Save your recovery codes.`,
		);
		const enrolled = render(await AccountPage(flash({ next })));
		expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
			"href",
			next,
		);
		const codes =
			(await services.twoFactor.status(member.id, settings.siteName))
				.recoveryCodes ?? [];
		expect(screen.getByText(codes[0] ?? "")).toBeInTheDocument();
		enrolled.unmount();
		expectSameFlash(
			await redirectOf(acknowledgeRecoveryCodesAction(form({ next }))),
			`/manage/account?next=${next}&notice=The recovery codes are hidden.`,
		);
		expectSameFlash(
			await redirectOf(
				acknowledgeRecoveryCodesAction(form({ next: "https://evil.example" })),
			),
			"/manage/account?notice=The recovery codes are hidden.",
		);

		await redirectOf(logoutAction());
		expect(
			await redirectOf(
				loginAction(
					form({
						email: CREDENTIALS.email,
						password: CREDENTIALS.password,
						next,
					}),
				),
			),
		).toBe(`/manage/login/two-factor?next=${next}`);
		const check = render(await TwoFactorLoginPage(flash({ next })));
		expect(
			screen.getByRole("heading", { name: "Check your authenticator" }),
		).toBeInTheDocument();
		expect(screen.getByText(/recovery code/)).toBeInTheDocument();
		check.unmount();
		expect(
			await redirectOf(
				submitTwoFactorAction(form({ code: codes[0] ?? "", next })),
			),
		).toBe(next);
		await expect(
			app.services.sessions.resolve(cookieJar.get(SESSION_COOKIE)?.value),
		).resolves.toBeDefined();
	});

	it("locks the challenge after repeated wrong codes", async () => {
		const { services } = await setupApp();
		await services.members.setup(CREDENTIALS);
		const next = "/manage/services";
		await redirectOf(
			loginAction(
				form({
					email: CREDENTIALS.email,
					password: CREDENTIALS.password,
					next,
				}),
			),
		);
		const challenge = `/manage/login/two-factor?next=${encodeURIComponent(next)}`;
		for (let attempt = 0; attempt < 4; attempt += 1) {
			expectSameFlash(
				await redirectOf(submitTwoFactorAction(form({ code: "000000", next }))),
				`${challenge}&error=That code is not valid.`,
			);
		}
		expectSameFlash(
			await redirectOf(submitTwoFactorAction(form({ code: "000000", next }))),
			`/manage/login?next=${encodeURIComponent(next)}&error=Too many attempts. Sign in again.`,
		);
		expect(cookieJar.get(SESSION_COOKIE)).toBeUndefined();
	});

	it("promotes a challenge that was already confirmed", async () => {
		const { services, clock } = await setupApp();
		const member = await services.members.setup(CREDENTIALS);
		const settings = await services.settings.get();
		const started = await services.twoFactor.begin(
			member.id,
			settings.siteName,
		);
		const codes = await services.twoFactor.confirm(
			member.id,
			totpAt(started.secret, clock.now().getTime()),
		);
		const { token } = await services.sessions.create(member.id, {
			purpose: "enroll",
		});
		cookieJar.set(SESSION_COOKIE, token);
		expectSameFlash(
			await redirectOf(submitTwoFactorAction(form({ code: "000000" }))),
			"/manage/login/two-factor?error=That code is not valid.",
		);
		expectSameFlash(
			await redirectOf(submitTwoFactorAction(form({ code: codes[0] ?? "" }))),
			"/manage/account?notice=Two-factor authentication is on. Save your recovery codes.",
		);
		await expect(services.sessions.resolve(token)).resolves.toBeDefined();
	});

	it("rejects a code when authenticator setup has not started", async () => {
		const { services } = await setupApp();
		const member = await services.members.setup(CREDENTIALS);
		const { token } = await services.sessions.create(member.id, {
			purpose: "enroll",
		});
		cookieJar.set(SESSION_COOKIE, token);
		render(await TwoFactorLoginPage(flash()));
		expect(
			screen.getByText("Start again from the sign-in page."),
		).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Authentication code"),
		).not.toBeInTheDocument();
		expectSameFlash(
			await redirectOf(submitTwoFactorAction(form({ code: "123456" }))),
			"/manage/login/two-factor?error=That code is not valid.",
		);
		vi.spyOn(services.twoFactor, "confirm").mockRejectedValueOnce(
			new Error("boom"),
		);
		await expect(
			submitTwoFactorAction(form({ code: "123456" })),
		).rejects.toThrow("boom");
	});

	it("tells the member when the encryption key cannot read the secret", async () => {
		const { app, services } = await setupApp({
			ENCRYPTION_KEY: "a".repeat(32),
		});
		await services.members.setup(CREDENTIALS);
		await redirectOf(
			loginAction(
				form({ email: CREDENTIALS.email, password: CREDENTIALS.password }),
			),
		);
		const replacement = await createApp({
			config: loadConfig({ ENCRYPTION_KEY: "b".repeat(32) }),
			store: app.store,
			now: app.now,
		});
		setApp(replacement);
		render(await TwoFactorLoginPage(flash()));
		expect(screen.getByRole("alert")).toHaveTextContent("ENCRYPTION_KEY");
		expect(
			screen.queryByLabelText("Authentication code"),
		).not.toBeInTheDocument();
		expectFlashRedirect(
			await redirectOf(submitTwoFactorAction(form({ code: "123456" }))),
			"/manage/login/two-factor",
			"error",
			"The server cannot read the authenticator secret. Check ENCRYPTION_KEY.",
		);
	});
});

describe("account authenticator", () => {
	it("sends a signed-in member to account until an authenticator is on", async () => {
		const { app } = await setupApp();
		await signIn(app, "viewer", { twoFactor: false });
		expectFlashRedirect(
			await redirectOf(DashboardPage(flash())),
			"/manage/account",
			"error",
			"Set up two-factor authentication to continue.",
		);
		render(await AccountPage(flash({ error: "two_factor_required" })));
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Set up two-factor authentication to continue.",
		);
		expect(
			screen.getByRole("button", { name: "Set up authenticator" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(/An admin requires two-factor authentication/),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "Continue" }),
		).not.toBeInTheDocument();
	});

	it("lets a member turn an authenticator on and off when it is optional", async () => {
		const { app, services, clock } = await setupApp();
		await services.settings.update(SYSTEM_ACTOR, { requireTwoFactor: false });
		const { member } = await signIn(app, "viewer", { twoFactor: false });
		const settings = await services.settings.get();
		const first = render(
			await AccountPage(flash({ next: "/manage/services" })),
		);
		expect(
			screen.getByRole("button", { name: "Set up authenticator" }),
		).toBeInTheDocument();
		expect(
			screen.queryByText("An admin requires two-factor authentication."),
		).not.toBeInTheDocument();
		first.unmount();

		await redirectOf(beginTwoFactorAction(form({})));
		const pending = render(await AccountPage(flash()));
		const started = await services.twoFactor.status(
			member.id,
			settings.siteName,
		);
		expect(screen.getByText(started.setup?.secret ?? "")).toBeInTheDocument();
		pending.unmount();
		expectSameFlash(
			await redirectOf(confirmTwoFactorAction(form({ code: "000000" }))),
			"/manage/account?error=That code is not valid.",
		);
		expectSameFlash(
			await redirectOf(
				confirmTwoFactorAction(
					form({
						code: totpAt(started.setup?.secret ?? "", clock.now().getTime()),
					}),
				),
			),
			"/manage/account?notice=Two-factor authentication is on. Save your recovery codes.",
		);
		const codes = render(
			await AccountPage(flash({ next: "/manage/services" })),
		);
		expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
			"href",
			"/manage/services",
		);
		expect(screen.getByText(/Recovery codes left: 10/)).toBeInTheDocument();
		codes.unmount();
		expectSameFlash(
			await redirectOf(acknowledgeRecoveryCodesAction(form({}))),
			"/manage/account?notice=The recovery codes are hidden.",
		);
		const hidden = render(await AccountPage(flash()));
		expect(
			screen.queryByText(/Save these recovery codes/),
		).not.toBeInTheDocument();
		hidden.unmount();

		expectSameFlash(
			await redirectOf(
				regenerateRecoveryCodesAction(form({ password: "wrong-password" })),
			),
			"/manage/account?error=Current password is incorrect",
		);
		expectSameFlash(
			await redirectOf(
				regenerateRecoveryCodesAction(form({ password: "password123" })),
			),
			"/manage/account?notice=New recovery codes are ready. Save them now.",
		);
		const fresh = await services.twoFactor.status(member.id, settings.siteName);
		const shown = render(await AccountPage(flash()));
		expect(
			screen.getByText(fresh.recoveryCodes?.[0] ?? ""),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "Turn off two-factor authentication",
			}),
		).toBeInTheDocument();
		shown.unmount();
		clock.advance(30_000);
		expectSameFlash(
			await redirectOf(
				disableTwoFactorAction(
					form({
						password: "password123",
						code: totpAt(started.setup?.secret ?? "", clock.now().getTime()),
					}),
				),
			),
			"/manage/account?notice=Two-factor authentication is off.",
		);
		render(await AccountPage(flash()));
		expect(
			screen.getByRole("button", { name: "Set up authenticator" }),
		).toBeInTheDocument();
	});

	it("blocks turning the authenticator off while the setting requires it", async () => {
		const { app } = await setupApp();
		await signIn(app, "admin");
		render(await AccountPage(flash()));
		expect(screen.getByText(/Recovery codes left: 10/)).toBeInTheDocument();
		expect(
			screen.getByText("An admin requires two-factor authentication."),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", {
				name: "Turn off two-factor authentication",
			}),
		).not.toBeInTheDocument();
		expectFlashRedirect(
			await redirectOf(
				disableTwoFactorAction(
					form({ password: "password123", code: "000000" }),
				),
			),
			"/manage/account",
			"error",
			"An admin requires two-factor authentication.",
		);
		expectFlashRedirect(
			await redirectOf(beginTwoFactorAction(form({}))),
			"/manage/account",
			"error",
			"Two-factor authentication is already on.",
		);
	});

	it("shows the account error when a stored secret cannot be read", async () => {
		const { app } = await setupApp({ ENCRYPTION_KEY: "a".repeat(32) });
		const { member } = await signIn(app, "viewer", { twoFactor: false });
		const settings = await app.services.settings.get();
		await app.services.twoFactor.begin(member.id, settings.siteName);
		setApp(
			await createApp({
				config: loadConfig({ ENCRYPTION_KEY: "b".repeat(32) }),
				store: app.store,
				now: app.now,
			}),
		);
		render(await AccountPage(flash()));
		expect(screen.getByRole("alert")).toHaveTextContent("ENCRYPTION_KEY");
		expect(
			screen.queryByRole("button", { name: "Set up authenticator" }),
		).not.toBeInTheDocument();
	});
});

describe("two-factor page access", () => {
	it("sends a visitor without a challenge back to sign-in", async () => {
		const { app } = await setupApp();
		expect(await redirectOf(TwoFactorLoginPage(flash()))).toBe("/manage/login");
		await signIn(app, "viewer");
		expect(await redirectOf(TwoFactorLoginPage(flash()))).toBe("/manage");
		expect(
			await redirectOf(
				TwoFactorLoginPage(flash({ next: "https://evil.example" })),
			),
		).toBe("/manage");
		expect(
			await redirectOf(submitTwoFactorAction(form({ code: "123456" }))),
		).toBe("/manage/login");
	});
});
