import { getApp } from "@/lib/app";
import { handleRegister } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
	const { services } = await getApp();
	return handleRegister(request, services);
}
