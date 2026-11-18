import { getApp } from "@/lib/app";
import { markdownResponse, statusMarkdown } from "@/lib/llms";
import { originFrom } from "@/lib/manage/origin";

export const dynamic = "force-dynamic";

/** The status page in Markdown, for agents (https://llmstxt.org). */
export async function GET(request: Request): Promise<Response> {
	const { services } = await getApp();
	const summary = await services.status.summary();
	const origin = originFrom(
		request.headers,
		summary.settings.siteUrl,
		new URL(request.url).origin,
	);
	return markdownResponse(statusMarkdown(summary, origin), "text/plain");
}
