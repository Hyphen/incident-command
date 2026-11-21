import { getApp } from "@/lib/app";
import { markdownResponse, statusMarkdown } from "@/lib/llms";
import { originFrom } from "@/lib/manage/origin";

export const dynamic = "force-dynamic";

/** The status page in Markdown, for agents (https://llmstxt.org). */
export async function GET(request: Request): Promise<Response> {
	const { services } = await getApp();
	const regionId = new URL(request.url).searchParams.get("region") || undefined;
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
	const summary = await services.status.summary(
		region ? { regionId: region.id } : {},
	);
	const origin = originFrom(
		request.headers,
		summary.settings.siteUrl,
		new URL(request.url).origin,
	);
	return markdownResponse(statusMarkdown(summary, origin), "text/plain");
}
