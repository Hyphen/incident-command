import { isOAuthError } from "../errors";
import { originFrom, publicOrigin } from "../manage/origin";
import type { Services } from "../services";
import {
	AUTHORIZATION_PARAMS,
	type AuthorizationParams,
} from "../services/oauth";

export const MCP_PATH = "/api/mcp";
export const AUTHORIZE_PATH = "/manage/authorize";
export const TOKEN_PATH = "/oauth/token";
export const REGISTER_PATH = "/oauth/register";
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

/** The public URL of the MCP endpoint, for a page or a server action. */
export async function publicMcpEndpoint(
	siteUrl: string | undefined,
): Promise<string> {
	return `${await publicOrigin(siteUrl)}${MCP_PATH}`;
}

/** Picks the authorization parameters. `get` returns the value of a parameter. */
export function authorizationParams(
	get: (key: string) => unknown,
): AuthorizationParams {
	const params: AuthorizationParams = {};
	for (const key of AUTHORIZATION_PARAMS) {
		const value = get(key);
		if (typeof value === "string" && value !== "") {
			params[key] = value;
		}
	}
	return params;
}

/** The path of the consent page for an authorization request. */
export function authorizePath(params: AuthorizationParams): string {
	return `${AUTHORIZE_PATH}?${new URLSearchParams(params as Record<string, string>)}`;
}

/** The public origin for a request: the site URL, else the request host. */
export async function requestOrigin(
	request: Request,
	services: Services,
): Promise<string> {
	const { siteUrl } = await services.settings.get();
	return originFrom(request.headers, siteUrl, new URL(request.url).origin);
}

/** The protected resource metadata of the MCP endpoint (RFC 9728). */
export async function handleResourceMetadata(
	request: Request,
	services: Services,
): Promise<Response> {
	const origin = await requestOrigin(request, services);
	return Response.json({
		resource: `${origin}${MCP_PATH}`,
		authorization_servers: [origin],
		bearer_methods_supported: ["header"],
	});
}

/** The authorization server metadata (RFC 8414). */
export async function handleServerMetadata(
	request: Request,
	services: Services,
): Promise<Response> {
	const origin = await requestOrigin(request, services);
	return Response.json({
		issuer: origin,
		authorization_endpoint: `${origin}${AUTHORIZE_PATH}`,
		token_endpoint: `${origin}${TOKEN_PATH}`,
		registration_endpoint: `${origin}${REGISTER_PATH}`,
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		code_challenge_methods_supported: ["S256"],
		token_endpoint_auth_methods_supported: ["none"],
	});
}

async function oauthResponse(
	operation: () => Promise<unknown>,
	status = 200,
): Promise<Response> {
	try {
		return Response.json(await operation(), { status, headers: NO_STORE });
	} catch (error) {
		if (!isOAuthError(error)) {
			throw error;
		}
		return Response.json(
			{ error: error.error, error_description: error.message },
			{ status: error.status, headers: NO_STORE },
		);
	}
}

/** The dynamic client registration endpoint (RFC 7591). */
export async function handleRegister(
	request: Request,
	services: Services,
): Promise<Response> {
	const body: unknown = await request.json().catch(() => undefined);
	return oauthResponse(() => services.oauth.register(body), 201);
}

/** The token endpoint. The body is `application/x-www-form-urlencoded`. */
export async function handleToken(
	request: Request,
	services: Services,
): Promise<Response> {
	const params = Object.fromEntries(new URLSearchParams(await request.text()));
	return oauthResponse(() => services.oauth.token(params));
}
