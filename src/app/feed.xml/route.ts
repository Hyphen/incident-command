import { getApp } from "@/lib/app";
import { buildRssFeed, FEED_ITEM_LIMIT } from "@/lib/feed";
import { originFrom } from "@/lib/manage/origin";

export const dynamic = "force-dynamic";

/** RSS feed with one item for each incident and maintenance update. */
export async function GET(request: Request): Promise<Response> {
	const { services } = await getApp();
	const [settings, catalog, open, recent] = await Promise.all([
		services.settings.get(),
		services.catalog.list({ includeHidden: false }),
		services.incidents.list({ open: true }),
		services.incidents.list({ limit: FEED_ITEM_LIMIT }),
	]);
	const origin = originFrom(
		request.headers,
		settings.siteUrl,
		new URL(request.url).origin,
	);
	// An open incident can be older than the newest incidents. Its new
	// updates must also be in the feed.
	return new Response(
		buildRssFeed(settings, [...open, ...recent], catalog, origin),
		{ headers: { "content-type": "application/rss+xml; charset=utf-8" } },
	);
}
