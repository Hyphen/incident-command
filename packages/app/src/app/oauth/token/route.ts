import { getApp } from "@/lib/app";
import { handleToken } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
	const { services } = await getApp();
	return handleToken(request, services);
}
