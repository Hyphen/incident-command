import type { BrandAssetKind, Settings } from "./domain/types";

/** The URL of an uploaded file. A new file has a new version, thus a new URL. */
function brandAssetSrc(
	kind: BrandAssetKind,
	version: string | undefined,
): string | undefined {
	return version
		? `/brand/${kind}?v=${encodeURIComponent(version)}`
		: undefined;
}

/** The logo src for a page, or undefined when no logo is stored. */
export function publicLogoSrc(
	settings: Pick<Settings, "logoUpdatedAt">,
): string | undefined {
	return brandAssetSrc("logo", settings.logoUpdatedAt);
}

/** The favicon src for a page, or undefined when no favicon is stored. */
export function publicFaviconSrc(
	settings: Pick<Settings, "faviconUpdatedAt">,
): string | undefined {
	return brandAssetSrc("favicon", settings.faviconUpdatedAt);
}
