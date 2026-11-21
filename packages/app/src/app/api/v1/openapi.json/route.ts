import { getApp } from "@/lib/app";
import { originFrom } from "@/lib/manage/origin";
import { buildOpenApi } from "@/lib/openapi";

export const dynamic = "force-dynamic";

const headers = {
	"access-control-allow-origin": "*",
	"cache-control": "public, max-age=300",
};

/** The OpenAPI document of the REST API, with this deployment as the server. */
export async function GET(request: Request): Promise<Response> {
	const { services } = await getApp();
	const settings = await services.settings.get();
	const origin = originFrom(
		request.headers,
		settings.siteUrl,
		new URL(request.url).origin,
	);
	return Response.json(buildOpenApi(origin), { headers });
}
