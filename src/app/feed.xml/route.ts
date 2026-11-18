import { getApp } from "@/lib/app";
import { buildRssFeed, FEED_ITEM_LIMIT } from "@/lib/feed";
import { originFrom } from "@/lib/manage/origin";

export const dynamic = "force-dynamic";

/** RSS feed with one item for each incident and maintenance update. */
export async function GET(request: Request): Promise<Response> {
	const { services } = await getApp();
	// The newest updates are on the incidents with the newest changes. An
	// older incident can get a new update or a resolution.
	const [settings, catalog, incidents] = await Promise.all([
		services.settings.get(),
		services.catalog.list({ includeHidden: false }),
		services.incidents.list({ orderBy: "updatedAt", limit: FEED_ITEM_LIMIT }),
	]);
	const origin = originFrom(
		request.headers,
		settings.siteUrl,
		new URL(request.url).origin,
	);
	return new Response(buildRssFeed(settings, incidents, catalog, origin), {
		headers: { "content-type": "application/rss+xml; charset=utf-8" },
	});
}
