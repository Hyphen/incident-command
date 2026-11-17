import { getApp } from "@/lib/app";
import type { BrandAsset } from "@/lib/domain/types";
import { StoreUnavailableError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const LOGO_HEADERS = {
	"x-content-type-options": "nosniff",
	"content-security-policy":
		"default-src 'none'; style-src 'unsafe-inline'; sandbox",
	"referrer-policy": "no-referrer",
} as const;

/** A day. Safe only for the exact file version named in the URL. */
const CACHED_LOGO = "public, max-age=86400";

function logoResponse(logo: BrandAsset, cacheControl: string): Response {
	return new Response(new Uint8Array(Buffer.from(logo.data, "base64")), {
		headers: {
			...LOGO_HEADERS,
			"content-type": logo.contentType,
			"cache-control": cacheControl,
		},
	});
}

function missingLogo(): Response {
	return new Response(null, {
		status: 404,
		headers: { ...LOGO_HEADERS, "cache-control": "no-store" },
	});
}

/**
 * Serves the uploaded logo. A missing logo is a 404.
 * Only a URL whose version matches the file is cached for a day.
 */
export async function GET(request: Request): Promise<Response> {
	const { services } = await getApp();
	const version = new URL(request.url).searchParams.get("v");
	const cached = await services.settings.getLogo();
	// Another instance can still hold the previous file.
	if (cached && version === cached.updatedAt) {
		return logoResponse(cached, CACHED_LOGO);
	}
	if (version) {
		try {
			const logo = await services.settings.getLogo({ consistent: true });
			if (!logo) {
				return missingLogo();
			}
			const cacheControl =
				logo.updatedAt === version ? CACHED_LOGO : "no-store";
			return logoResponse(logo, cacheControl);
		} catch (error) {
			if (!(error instanceof StoreUnavailableError)) {
				throw error;
			}
			if (!cached) {
				return missingLogo();
			}
			return logoResponse(cached, "no-store");
		}
	}
	if (!cached) {
		return missingLogo();
	}
	return logoResponse(cached, "no-store");
}
