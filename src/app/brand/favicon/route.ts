import { serveBrandAsset } from "@/lib/brand-route";

export const dynamic = "force-dynamic";

/** Serves the uploaded favicon. A missing favicon is a 404. */
export function GET(request: Request): Promise<Response> {
	return serveBrandAsset(request, "favicon");
}
