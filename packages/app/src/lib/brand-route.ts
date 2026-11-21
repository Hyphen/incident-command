import { getApp } from "./app";
import type { BrandAsset, BrandAssetKind } from "./domain/types";
import { StoreUnavailableError } from "./errors";

const ASSET_HEADERS = {
	"x-content-type-options": "nosniff",
	"content-security-policy":
		"default-src 'none'; style-src 'unsafe-inline'; sandbox",
	"referrer-policy": "no-referrer",
} as const;

/** A day. Safe only for the exact file version named in the URL. */
const CACHED_ASSET = "public, max-age=86400";

function assetResponse(asset: BrandAsset, cacheControl: string): Response {
	return new Response(new Uint8Array(Buffer.from(asset.data, "base64")), {
		headers: {
			...ASSET_HEADERS,
			"content-type": asset.contentType,
			"cache-control": cacheControl,
		},
	});
}

function missingAsset(): Response {
	return new Response(null, {
		status: 404,
		headers: { ...ASSET_HEADERS, "cache-control": "no-store" },
	});
}

/**
 * Serves the uploaded logo or favicon. A missing file is a 404.
 * The file comes from the memory cache, thus the route works when the store is offline.
 * Only a URL whose version matches the file is cached for a day.
 */
export async function serveBrandAsset(
	request: Request,
	kind: BrandAssetKind,
): Promise<Response> {
	const { services } = await getApp();
	const version = new URL(request.url).searchParams.get("v");
	const cached = await services.settings.getBrandAsset(kind);
	// Another instance can still hold the previous file.
	if (cached && version === cached.updatedAt) {
		return assetResponse(cached, CACHED_ASSET);
	}
	if (version) {
		try {
			const asset = await services.settings.getBrandAsset(kind, {
				consistent: true,
			});
			if (!asset) {
				return missingAsset();
			}
			const cacheControl =
				asset.updatedAt === version ? CACHED_ASSET : "no-store";
			return assetResponse(asset, cacheControl);
		} catch (error) {
			if (!(error instanceof StoreUnavailableError)) {
				throw error;
			}
			if (!cached) {
				return missingAsset();
			}
			return assetResponse(cached, "no-store");
		}
	}
	if (!cached) {
		return missingAsset();
	}
	return assetResponse(cached, "no-store");
}
