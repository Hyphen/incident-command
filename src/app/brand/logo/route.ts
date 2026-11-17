import { getApp } from "@/lib/app";

export const dynamic = "force-dynamic";

const LOGO_HEADERS = {
	"x-content-type-options": "nosniff",
	"content-security-policy":
		"default-src 'none'; style-src 'unsafe-inline'; sandbox",
	"referrer-policy": "no-referrer",
} as const;

/** Serves the uploaded logo. A missing logo is a 404. */
export async function GET(): Promise<Response> {
	const { services } = await getApp();
	const logo = await services.settings.getLogo();
	if (!logo) {
		return new Response(null, {
			status: 404,
			headers: { ...LOGO_HEADERS, "cache-control": "no-store" },
		});
	}
	return new Response(new Uint8Array(Buffer.from(logo.data, "base64")), {
		headers: {
			...LOGO_HEADERS,
			"content-type": logo.contentType,
			"cache-control": "public, max-age=86400",
		},
	});
}
