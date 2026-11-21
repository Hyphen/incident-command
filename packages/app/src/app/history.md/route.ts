import { getApp } from "@/lib/app";
import { historyMarkdown, markdownResponse } from "@/lib/llms";
import { originFrom } from "@/lib/manage/origin";

export const dynamic = "force-dynamic";

/** The incident history in Markdown. `?month=YYYY-MM` selects the newest month. */
export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const { services } = await getApp();
	const regionId = url.searchParams.get("region") || undefined;
	const regions = await services.regions.list();
	const region = regionId
		? regions.find((item) => item.id === regionId)
		: undefined;
	if (regionId && !region) {
		return new Response("That region was not found.\n", {
			status: 404,
			headers: { "content-type": "text/plain; charset=utf-8" },
		});
	}
	const [history, settings] = await Promise.all([
		services.status.history(
			url.searchParams.get("month") ?? undefined,
			3,
			region?.id,
		),
		services.settings.get(),
	]);
	const origin = originFrom(request.headers, settings.siteUrl, url.origin);
	return markdownResponse(
		historyMarkdown(settings, history, origin, region, regions),
		"text/markdown",
	);
}
