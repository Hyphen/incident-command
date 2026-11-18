import { getApp } from "@/lib/app";
import { historyMarkdown, markdownResponse } from "@/lib/llms";
import { originFrom } from "@/lib/manage/origin";

export const dynamic = "force-dynamic";

/** The incident history in Markdown. `?month=YYYY-MM` selects the newest month. */
export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const { services } = await getApp();
	const [history, settings] = await Promise.all([
		services.status.history(url.searchParams.get("month") ?? undefined),
		services.settings.get(),
	]);
	const origin = originFrom(request.headers, settings.siteUrl, url.origin);
	return markdownResponse(
		historyMarkdown(settings, history, origin),
		"text/markdown",
	);
}
