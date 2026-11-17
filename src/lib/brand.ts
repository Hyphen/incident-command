import type { Settings } from "./domain/types";

/** The logo src for a page. An uploaded logo replaces the logo URL. */
export function publicLogoSrc(
	settings: Pick<Settings, "logoUpdatedAt" | "logoUrl">,
): string | undefined {
	if (settings.logoUpdatedAt) {
		return `/brand/logo?v=${encodeURIComponent(settings.logoUpdatedAt)}`;
	}
	return settings.logoUrl;
}
