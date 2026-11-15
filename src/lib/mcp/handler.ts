import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Services } from "../services";
import { RESOURCE_METADATA_PATH, requestOrigin } from "./oauth";
import { createMcpServer } from "./server";

function jsonRpcError(
	status: number,
	message: string,
	headers: Record<string, string> = {},
) {
	return Response.json(
		{ jsonrpc: "2.0", error: { code: -32000, message }, id: null },
		{ status, headers },
	);
}

export function bearerToken(header: string | null): string | undefined {
	const match = header?.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim();
}

/**
 * Handles a Streamable HTTP MCP request in stateless mode: every POST is
 * authenticated and served by a fresh server. The bearer token is an OAuth
 * access token or an API token. A request without a valid token gets the
 * address of the protected resource metadata, so the agent can sign in.
 */
export async function handleMcpRequest(
	request: Request,
	services: Services,
): Promise<Response> {
	if (request.method !== "POST") {
		return jsonRpcError(
			405,
			"Method not allowed. This server is stateless; use POST.",
			{
				allow: "POST",
			},
		);
	}
	const token = bearerToken(request.headers.get("authorization"));
	const origin = await requestOrigin(request, services);
	const actor =
		(await services.oauth.authenticate(token)) ??
		(await services.agents.authenticate(token));
	if (!actor) {
		const challenge = `Bearer resource_metadata="${origin}${RESOURCE_METADATA_PATH}"`;
		return jsonRpcError(401, "Missing or invalid agent token", {
			"www-authenticate": token
				? `${challenge}, error="invalid_token"`
				: challenge,
		});
	}
	const server = createMcpServer(services, actor, origin);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		await server.close();
	}
}
