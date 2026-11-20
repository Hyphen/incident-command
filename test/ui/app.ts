import { type App, createApp, setApp } from "@/lib/app";
import { SESSION_COOKIE } from "@/lib/auth";
import { loadConfig } from "@/lib/config";
import { pkceChallenge } from "@/lib/crypto";
import { totpAt } from "@/lib/domain/totp";
import type { Actor, Role } from "@/lib/domain/types";
import { type FlashKind, readFlash } from "@/lib/flash";
import { SYSTEM_ACTOR } from "@/lib/services/context";
import { memberActor } from "@/lib/services/members";
import { Clock, EMAIL_ENV, FakeNotifier } from "../helpers";
import { cookieJar, NotFound, Redirect } from "./next-state";

export async function setupApp(env: Record<string, string> = {}) {
	const clock = new Clock();
	const notifier = new FakeNotifier();
	const app = await createApp({
		config: loadConfig({ ...EMAIL_ENV, ...env }),
		notifier,
		now: clock.now,
	});
	setApp(app);
	return { app, clock, notifier, services: app.services };
}

export async function signIn(
	app: App,
	role: Role = "admin",
	options?: { twoFactor?: boolean },
) {
	const invite = await app.services.members.invite(SYSTEM_ACTOR, {
		email: `${role}-${Math.random().toString(36).slice(2)}@test.dev`,
		role,
	});
	const member = await app.services.members.acceptInvite(invite.token, {
		name: `${role[0]?.toUpperCase()}${role.slice(1)} User`,
		password: "password123",
	});
	if (options?.twoFactor !== false) {
		const settings = await app.services.settings.get();
		const started = await app.services.twoFactor.begin(
			member.id,
			settings.siteName,
		);
		await app.services.twoFactor.confirm(
			member.id,
			totpAt(started.secret, app.now().getTime()),
		);
		await app.services.twoFactor.acknowledge(memberActor(member));
	}
	const { token } = await app.services.sessions.create(member.id);
	cookieJar.set(SESSION_COOKIE, token);
	const current = await app.services.members.get(member.id);
	if (!current) {
		throw new Error("Member missing after sign-in");
	}
	return { member: current, actor: memberActor(current) };
}

export const AGENT_REDIRECT = "http://localhost:4567/callback";
const AGENT_VERIFIER = "v".repeat(43);

/** The query of an authorization request that an agent sends to the consent page. */
export function authorizationQuery(clientId: string) {
	return {
		response_type: "code",
		client_id: clientId,
		redirect_uri: AGENT_REDIRECT,
		code_challenge: pkceChallenge(AGENT_VERIFIER),
		code_challenge_method: "S256",
		state: "state-1",
	};
}

/** Registers an agent and connects it with OAuth as the member. */
export async function connectAgent(app: App, actor: Actor, name: string) {
	const { client_id } = await app.services.oauth.register({
		client_name: name,
		redirect_uris: [AGENT_REDIRECT],
	});
	const url = await app.services.oauth.approve(
		actor,
		authorizationQuery(client_id),
		"http://localhost/api/mcp",
	);
	return app.services.oauth.token({
		grant_type: "authorization_code",
		client_id,
		code: new URL(url).searchParams.get("code") ?? "",
		redirect_uri: AGENT_REDIRECT,
		code_verifier: AGENT_VERIFIER,
	});
}

export function form(entries: Record<string, string | string[]>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		for (const item of Array.isArray(value) ? value : [value]) {
			data.append(key, item);
		}
	}
	return data;
}

/** Awaits a server action/page and returns the URL it redirected to. */
export async function redirectOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Redirect) {
			return decodeURIComponent(error.url);
		}
		throw error;
	}
	throw new Error("Expected a redirect");
}

export async function expectNotFound(promise: Promise<unknown>) {
	await expect(promise).rejects.toBeInstanceOf(NotFound);
}

export const params = <T>(value: T) => Promise.resolve(value);

/** Passes flash query values through for page tests (codes, not free text). */
export function flashQueryParams(
	value: Record<string, string> = {},
): Record<string, string> {
	return { ...value };
}

/** Reads the display text for a flash code on a redirect URL. */
export function flashMessage(url: string, kind: FlashKind): string | undefined {
	return readFlash(
		kind,
		new URL(url, "http://localhost").searchParams.get(kind) ?? undefined,
	);
}

/** Asserts a redirect path and flash display text. */
export function expectFlashRedirect(
	url: string,
	path: string,
	kind: FlashKind,
	message: string,
): void {
	const actual = new URL(url, "http://localhost");
	const expected = new URL(path, "http://localhost");
	expect(actual.pathname).toBe(expected.pathname);
	for (const [key, value] of expected.searchParams) {
		expect(actual.searchParams.get(key)).toBe(value);
	}
	expect(flashMessage(url, kind)).toBe(message);
}

/**
 * Asserts a redirect matches a `?notice=` / `?error=` URL that uses catalog
 * codes (or compares resolved text when the expected value is display text).
 */
export function expectSameFlash(actual: string, plainExpected: string): void {
	const got = new URL(actual, "http://localhost");
	const want = new URL(plainExpected, "http://localhost");
	expect(got.pathname).toBe(want.pathname);
	for (const kind of ["notice", "error"] as const) {
		const expected = want.searchParams.get(kind);
		if (expected === null) {
			expect(got.searchParams.get(kind)).toBeNull();
			continue;
		}
		const code = got.searchParams.get(kind);
		expect(code).toBeTruthy();
		const text = readFlash(kind, code ?? undefined);
		// Accept either the catalog code or the display text in expectations.
		expect(code === expected || text === expected).toBe(true);
		want.searchParams.delete(kind);
		got.searchParams.delete(kind);
	}
	expect([...got.searchParams.entries()].sort()).toEqual(
		[...want.searchParams.entries()].sort(),
	);
}
