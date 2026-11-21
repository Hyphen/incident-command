import { getApp } from "@/lib/app";
import { handleResourceMetadata } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/** The path form of the metadata address (RFC 9728 section 3.1). */
export async function GET(request: Request): Promise<Response> {
	const { services } = await getApp();
	return handleResourceMetadata(request, services);
}
