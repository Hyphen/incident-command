import { headers } from "next/headers";

/**
 * The public origin of this deployment: the configured URL, else the host in
 * the request headers. `fallback` applies when the request has no host.
 */
export function originFrom(
	list: Headers,
	configured: string | undefined,
	fallback: string,
): string {
	if (configured) {
		return configured.replace(/\/+$/, "");
	}
	const host = list.get("x-forwarded-host") ?? list.get("host");
	if (!host) {
		return fallback;
	}
	const proto =
		list.get("x-forwarded-proto") ??
		(host.startsWith("localhost") ? "http" : "https");
	return `${proto}://${host}`;
}

/** The public origin of this deployment: the configured URL, else the request host. */
export async function publicOrigin(
	configured: string | undefined,
): Promise<string> {
	return originFrom(await headers(), configured, "http://localhost:3000");
}
