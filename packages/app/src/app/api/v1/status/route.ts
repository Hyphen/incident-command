import { getApp } from "@/lib/app";
import { buildPublicStatus } from "@/lib/public-api";

export const dynamic = "force-dynamic";

const headers = {
	"access-control-allow-origin": "*",
	"cache-control": "public, max-age=15, stale-while-revalidate=60",
};

/** Public, CORS-enabled JSON summary for widgets and integrations. */
export async function GET(request: Request): Promise<Response> {
	const { services } = await getApp();
	const regionId = new URL(request.url).searchParams.get("region") || undefined;
	const regions = await services.regions.list();
	const region = regionId
		? regions.find((item) => item.id === regionId)
		: undefined;
	if (regionId && !region) {
		return Response.json(
			{ error: "That region was not found." },
			{ status: 404, headers },
		);
	}
	const summary = await services.status.summary(
		region ? { regionId: region.id } : {},
	);
	return Response.json(buildPublicStatus(summary), { headers });
}
