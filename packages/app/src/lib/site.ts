import type { Metadata } from "next";
import { getApp } from "./app";
import type { Settings } from "./domain/types";
import { FEED_PATH } from "./feed";

/** Settings used when the app cannot start (e.g. the database is unreachable at boot). */
export function fallbackSettings(): Settings {
	return {
		id: "settings",
		siteName: process.env.SITE_NAME || "Status",
		description: "",
		theme: "default",
		showPoweredBy: true,
		requireTwoFactor: true,
		uptimeDays: 90,
		updatedAt: new Date(0).toISOString(),
	};
}

/** Loads settings for layout chrome, never throwing so error pages can still render. */
export async function loadSiteSettings(): Promise<Settings> {
	try {
		const { services } = await getApp();
		return await services.settings.get();
	} catch {
		return fallbackSettings();
	}
}

/**
 * The alternate versions of a public page: the RSS feed and, if the page has
 * one, its Markdown version. A page that sets `alternates` replaces the
 * value of the layout, thus each value includes the feed.
 */
export function publicAlternates(
	markdownPath?: string,
): NonNullable<Metadata["alternates"]> {
	const types: Record<string, string> = { "application/rss+xml": FEED_PATH };
	if (markdownPath) {
		types["text/markdown"] = markdownPath;
	}
	return { types };
}
