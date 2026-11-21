import { getApp } from "@/lib/app";
import { handleServerMetadata } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
	const { services } = await getApp();
	return handleServerMetadata(request, services);
}
