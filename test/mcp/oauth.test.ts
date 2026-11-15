import {
	type OAuthClientProvider,
	UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
	OAuthClientInformationMixed,
	OAuthClientMetadata,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { handleMcpRequest } from "@/lib/mcp/handler";
import {
	authorizationParams,
	handleRegister,
	handleResourceMetadata,
	handleServerMetadata,
	handleToken,
} from "@/lib/mcp/oauth";
import type { Services } from "@/lib/services";
import { SYSTEM_ACTOR } from "@/lib/services/context";
import { memberActor } from "@/lib/services/members";
import { createTestContext, type TestContext } from "../helpers";

const ORIGIN = "https://status.acme.dev";
const MCP_URL = `${ORIGIN}/api/mcp`;
const REDIRECT = "http://localhost:33418/callback";

type Handler = (request: Request, services: Services) => Promise<Response>;

/** Routes requests to the handlers, as the Next.js route files do. */
function server(t: TestContext) {
	const routes: Record<string, Handler> = {
		"/api/mcp": handleMcpRequest,
		"/.well-known/oauth-protected-resource/api/mcp": handleResourceMetadata,
		"/.well-known/oauth-authorization-server": handleServerMetadata,
		"/oauth/register": handleRegister,
		"/oauth/token": handleToken,
	};
	return async (input: string | URL | Request, init?: RequestInit) => {
		const request = new Request(input, init);
		const route = routes[new URL(request.url).pathname];
		return route
			? route(request, t.services)
			: new Response("Not found", { status: 404 });
	};
}

/** An MCP client that keeps its OAuth state in memory, as an agent does. */
class MemoryProvider implements OAuthClientProvider {
	client?: OAuthClientInformationMixed;
	saved?: OAuthTokens;
	verifier = "";
	authorizationUrl?: URL;

	get redirectUrl() {
		return REDIRECT;
	}

	get clientMetadata(): OAuthClientMetadata {
		return {
			client_name: "Test agent",
			redirect_uris: [REDIRECT],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		};
	}

	clientInformation() {
		return this.client;
	}

	saveClientInformation(client: OAuthClientInformationMixed) {
		this.client = client;
	}

	tokens() {
		return this.saved;
	}

	saveTokens(tokens: OAuthTokens) {
		this.saved = tokens;
	}

	redirectToAuthorization(url: URL) {
		this.authorizationUrl = url;
	}

	saveCodeVerifier(verifier: string) {
		this.verifier = verifier;
	}

	codeVerifier() {
		return this.verifier;
	}
}

function transportFor(t: TestContext, provider: MemoryProvider) {
	return new StreamableHTTPClientTransport(new URL(MCP_URL), {
		authProvider: provider,
		fetch: server(t),
	});
}

async function whoami(client: Client) {
	const result = (await client.callTool({ name: "whoami", arguments: {} })) as {
		content: { text: string }[];
	};
	return JSON.parse(result.content[0]?.text ?? "");
}

describe("MCP OAuth", () => {
	let t: TestContext;
	beforeEach(() => {
		t = createTestContext();
	});

	it("lets an MCP client sign in, act as the member and refresh", async () => {
		const { token } = await t.services.members.invite(SYSTEM_ACTOR, {
			email: "ed@acme.dev",
			role: "editor",
		});
		const member = await t.services.members.acceptInvite(token, {
			name: "Ed Editor",
			password: "password123",
		});
		const provider = new MemoryProvider();

		// The first connection finds the authorization server, registers and
		// sends the member to the consent page.
		const first = transportFor(t, provider);
		await expect(
			new Client({ name: "agent", version: "1.0.0" }).connect(first),
		).rejects.toBeInstanceOf(UnauthorizedError);
		const authorizationUrl = provider.authorizationUrl as URL;
		expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
			`${ORIGIN}/manage/authorize`,
		);
		expect(provider.client?.client_id).toMatch(/^ocl_/);

		// The member approves on the consent page. The browser takes the code
		// to the agent.
		const params = authorizationParams((key) =>
			authorizationUrl.searchParams.get(key),
		);
		expect(params).toMatchObject({
			resource: MCP_URL,
			code_challenge_method: "S256",
		});
		const redirect = new URL(
			await t.services.oauth.approve(memberActor(member), params, MCP_URL),
		);
		await first.finishAuth(redirect.searchParams.get("code") ?? "");

		const client = new Client({ name: "agent", version: "1.0.0" });
		await client.connect(transportFor(t, provider));
		expect(await whoami(client)).toMatchObject({
			type: "agent",
			name: "Ed Editor via Test agent",
			role: "editor",
		});

		// After the access token expires, the client refreshes it and retries.
		const expired = provider.saved?.access_token;
		t.clock.advance(3_600_000);
		expect(await whoami(client)).toMatchObject({ role: "editor" });
		expect(provider.saved?.access_token).not.toBe(expired);
		await client.close();
	});

	it("points a request without a valid token to the metadata", async () => {
		const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
		const send = (headers: Record<string, string> = {}) =>
			handleMcpRequest(
				new Request(MCP_URL, { method: "POST", body, headers }),
				t.services,
			);
		const metadata = `${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`;
		expect((await send()).headers.get("www-authenticate")).toBe(
			`Bearer resource_metadata="${metadata}"`,
		);
		expect(
			(await send({ authorization: "Bearer icat_expired" })).headers.get(
				"www-authenticate",
			),
		).toBe(`Bearer resource_metadata="${metadata}", error="invalid_token"`);
	});

	it("describes the protected resource and the authorization server", async () => {
		await t.services.settings.update(SYSTEM_ACTOR, {
			siteUrl: "https://status.example.com/",
		});
		const get = async (handler: Handler) =>
			(
				await handler(
					new Request("http://internal:3000/x", {
						headers: { host: "internal:3000" },
					}),
					t.services,
				)
			).json();
		expect(await get(handleResourceMetadata)).toEqual({
			resource: "https://status.example.com/api/mcp",
			authorization_servers: ["https://status.example.com"],
			bearer_methods_supported: ["header"],
		});
		expect(await get(handleServerMetadata)).toEqual({
			issuer: "https://status.example.com",
			authorization_endpoint: "https://status.example.com/manage/authorize",
			token_endpoint: "https://status.example.com/oauth/token",
			registration_endpoint: "https://status.example.com/oauth/register",
			response_types_supported: ["code"],
			grant_types_supported: ["authorization_code", "refresh_token"],
			code_challenge_methods_supported: ["S256"],
			token_endpoint_auth_methods_supported: ["none"],
		});
	});

	it("returns OAuth errors as JSON that is not cached", async () => {
		const register = await handleRegister(
			new Request(`${ORIGIN}/oauth/register`, {
				method: "POST",
				body: "not json",
			}),
			t.services,
		);
		expect(register.status).toBe(400);
		expect(register.headers.get("cache-control")).toBe("no-store");
		expect(await register.json()).toMatchObject({
			error: "invalid_client_metadata",
		});

		const tokenRequest = (body: string) =>
			handleToken(
				new Request(`${ORIGIN}/oauth/token`, {
					method: "POST",
					body,
					headers: { "content-type": "application/x-www-form-urlencoded" },
				}),
				t.services,
			);
		const unknownClient = await tokenRequest(
			"grant_type=refresh_token&client_id=ocl_unknown&refresh_token=x",
		);
		expect(unknownClient.status).toBe(401);
		expect(await unknownClient.json()).toEqual({
			error: "invalid_client",
			error_description: "The client is not registered",
		});

		// Next.js can load a different copy of the errors module for the app.
		vi.resetModules();
		const copy = await import("@/lib/errors");
		vi.spyOn(t.services.oauth, "token").mockRejectedValueOnce(
			new copy.OAuthError("invalid_grant", "The refresh token is not valid"),
		);
		const fromCopy = await tokenRequest("grant_type=refresh_token");
		expect(fromCopy.status).toBe(400);
		expect(await fromCopy.json()).toMatchObject({ error: "invalid_grant" });

		vi.spyOn(t.services.oauth, "token").mockRejectedValueOnce(
			new Error("database offline"),
		);
		await expect(tokenRequest("grant_type=refresh_token")).rejects.toThrow(
			"database offline",
		);
	});
});
