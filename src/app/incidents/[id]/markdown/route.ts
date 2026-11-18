import { getApp } from "@/lib/app";
import {
	incidentMarkdown,
	incidentNotFoundMarkdown,
	markdownResponse,
} from "@/lib/llms";
import { originFrom } from "@/lib/manage/origin";

export const dynamic = "force-dynamic";

/**
 * An incident page in Markdown. `next.config.ts` rewrites
 * `/incidents/{id}.md` to this route.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const { services } = await getApp();
	const [incident, settings, catalog] = await Promise.all([
		services.incidents.find(id),
		services.settings.get(),
		services.catalog.list({ includeHidden: false }),
	]);
	const origin = originFrom(
		request.headers,
		settings.siteUrl,
		new URL(request.url).origin,
	);
	if (!incident) {
		return markdownResponse(
			incidentNotFoundMarkdown(origin),
			"text/markdown",
			404,
		);
	}
	return markdownResponse(
		incidentMarkdown(settings, incident, catalog, origin),
		"text/markdown",
	);
}
