import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type App, getApp } from "./app";
import { hasRole } from "./domain/status";
import type { Actor, PublicMember, Role } from "./domain/types";
import { flash, roleFlashCode } from "./flash";
import { memberActor } from "./services/members";
import type { ReadOptions } from "./store/types";

export { flash } from "./flash";

export const SESSION_COOKIE = "ic_session";

export interface MemberContext {
	member: PublicMember;
	actor: Actor;
	services: App["services"];
	app: App;
}

/** Whether session cookies should be marked `Secure`. */
export function secureCookies(siteUrl: string | undefined): boolean {
	return siteUrl
		? siteUrl.startsWith("https://")
		: process.env.NODE_ENV === "production";
}

/**
 * The signed-in member for this request, if any. A page uses the session
 * cache. A caller that changes data sets `consistent` to read the database.
 */
export async function getMemberContext(
	options?: ReadOptions,
): Promise<MemberContext | undefined> {
	const app = await getApp();
	const token = (await cookies()).get(SESSION_COOKIE)?.value;
	const result = await app.services.sessions.resolve(token, options);
	if (!result) {
		return undefined;
	}
	const { member } = result;
	return { member, actor: memberActor(member), services: app.services, app };
}

/**
 * The path to go to after sign-in. Only portal paths of printable ASCII are
 * permitted, so a link cannot send a person to a different site.
 */
export function returnPath(value: string | undefined): string {
	return value && /^\/manage(?:[/?][\x21-\x7e]*)?$/.test(value)
		? value
		: "/manage";
}

/** The sign-in path. After sign-in, the member goes to `next`. */
export function loginPath(next?: string): string {
	const path = returnPath(next);
	return path === "/manage"
		? "/manage/login"
		: `/manage/login?next=${encodeURIComponent(path)}`;
}

function authorize(
	context: MemberContext | undefined,
	role: Role,
	next?: string,
): MemberContext {
	if (!context) {
		redirect(loginPath(next));
	}
	if (!hasRole(context.member.role, role)) {
		redirect(flash("/manage", roleFlashCode(role)));
	}
	return context;
}

/**
 * Requires a signed-in member with at least `role`, redirecting otherwise.
 * A visitor who is not signed in comes back to `next` after sign-in. Use this
 * function in a page. It can use a cached session.
 */
export async function requireMember(
	role: Role = "viewer",
	next?: string,
): Promise<MemberContext> {
	return authorize(await getMemberContext(), role, next);
}

/**
 * Requires a signed-in member with at least `role`, redirecting otherwise.
 * Use this function in a server action. It reads the session and the member
 * from the database, so a change to a session or a role applies immediately.
 */
export async function requireMemberForAction(
	role: Role = "viewer",
): Promise<MemberContext> {
	return authorize(await getMemberContext({ consistent: true }), role);
}

/** Starts a session for a member (server actions only). */
export async function startSession(app: App, memberId: string): Promise<void> {
	const { token, session } = await app.services.sessions.create(memberId);
	(await cookies()).set(SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: secureCookies(app.config.siteUrl),
		path: "/",
		expires: new Date(session.expiresAt),
	});
}

/** Ends the current session (server actions only). */
export async function endSession(app: App): Promise<void> {
	const jar = await cookies();
	await app.services.sessions.destroy(jar.get(SESSION_COOKIE)?.value);
	jar.delete(SESSION_COOKIE);
}
