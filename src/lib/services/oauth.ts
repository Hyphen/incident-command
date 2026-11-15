import {
	createId,
	createSecret,
	pkceChallenge,
	safeEqual,
	sha256,
} from "../crypto";
import { createAgentSchema, registerClientSchema } from "../domain/schemas";
import { hasRole } from "../domain/status";
import type {
	Actor,
	AgentConnection,
	OAuthClient,
	OAuthCode,
	OAuthGrant,
} from "../domain/types";
import {
	errorMessage,
	ForbiddenError,
	NotFoundError,
	OAuthError,
} from "../errors";
import type { Condition } from "../store/types";
import { iso, parse, type ServiceContext } from "./context";

export const ACCESS_TOKEN_PREFIX = "icat_";
export const REFRESH_TOKEN_PREFIX = "icrt_";
export const ACCESS_TOKEN_TTL_SECONDS = 3600;
/** An agent that does not refresh its token in this time must connect again. */
export const REFRESH_TOKEN_TTL_MS = 30 * 86_400_000;
export const CODE_TTL_MS = 10 * 60_000;
/** The service removes a client that no member approved in this time. */
export const UNUSED_CLIENT_TTL_MS = 30 * 86_400_000;
const LAST_USED_RESOLUTION_MS = 60_000;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** Schemes that a browser handles itself. A private-use scheme is any other scheme. */
const BROWSER_SCHEMES = new Set([
	"http:",
	"https:",
	"ftp:",
	"file:",
	"ws:",
	"wss:",
	"javascript:",
	"data:",
	"blob:",
	"about:",
	"vbscript:",
	"mailto:",
	"tel:",
	"sms:",
]);
/** A base64url SHA-256 digest (RFC 7636 section 4.2). */
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636 section 4.1. */
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

/** The authorization request parameters that the consent page keeps. */
export const AUTHORIZATION_PARAMS = [
	"response_type",
	"client_id",
	"redirect_uri",
	"code_challenge",
	"code_challenge_method",
	"state",
	"resource",
] as const;

/** The parameters of an authorization request (RFC 6749, RFC 7636, RFC 8707). */
export type AuthorizationParams = Partial<
	Record<(typeof AUTHORIZATION_PARAMS)[number], string>
>;

interface AuthorizationRequest {
	redirectUri: string;
	codeChallenge: string;
	state?: string;
	resource?: string;
}

/**
 * The result of a check of an authorization request:
 * - `consent`: the request is valid. Ask the member to approve it.
 * - `redirect`: the request is not valid. `url` sends the error to the agent.
 *   Anybody can register a client, so use `url` only after the member makes
 *   a decision (RFC 9700 section 4.11.2). Before that, show `message`.
 * - `invalid`: the request has no valid client or redirect URI. Show `message`
 *   to the person, and do not redirect (RFC 6749 section 4.1.2.1).
 */
export type AuthorizationCheck =
	| { kind: "consent"; client: OAuthClient; request: AuthorizationRequest }
	| { kind: "redirect"; url: string; message: string }
	| { kind: "invalid"; message: string };

/** A successful token response (RFC 6749 section 5.1). */
export interface TokenResponse {
	access_token: string;
	token_type: "Bearer";
	expires_in: number;
	refresh_token: string;
}

/** The metadata that the registration endpoint returns (RFC 7591 section 3.2.1). */
export interface ClientRegistration {
	client_id: string;
	client_id_issued_at: number;
	client_name: string;
	redirect_uris: string[];
	grant_types: string[];
	response_types: string[];
	token_endpoint_auth_method: "none";
}

/**
 * Whether an agent can register this redirect URI. The service accepts https,
 * http on a loopback host (RFC 8252 section 7.3) and private-use schemes
 * (RFC 8252 section 7.1). A redirect URI cannot have a fragment.
 */
function isValidRedirectUri(value: string): boolean {
	const url = URL.parse(value);
	if (!url || value.includes("#")) {
		return false;
	}
	if (url.protocol === "https:") {
		return true;
	}
	if (url.protocol === "http:") {
		return LOOPBACK_HOSTS.has(url.hostname);
	}
	return !BROWSER_SCHEMES.has(url.protocol);
}

/** A loopback redirect URI without its port, else `undefined`. */
function loopbackKey(value: string): string | undefined {
	const url = URL.parse(value);
	if (url?.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
		return undefined;
	}
	url.port = "";
	return url.href;
}

/**
 * Whether a redirect URI is one that the client registered. A loopback
 * redirect URI can use any port, because a native app gets a free port
 * from the operating system (RFC 8252 section 7.3).
 */
function matchesRedirect(registered: string[], requested: string): boolean {
	const key = loopbackKey(requested);
	return registered.some(
		(uri) =>
			uri === requested || (key !== undefined && loopbackKey(uri) === key),
	);
}

function withParams(
	base: string,
	params: Record<string, string | undefined>,
): string {
	const url = new URL(base);
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			url.searchParams.set(key, value);
		}
	}
	return url.href;
}

/** Whether a resource indicator names the MCP endpoint or its origin. */
function isAllowedResource(value: string | undefined, resource: string) {
	if (value === undefined) {
		return true;
	}
	const trimmed = value.replace(/\/+$/, "");
	return trimmed === resource || trimmed === new URL(resource).origin;
}

function checkResource(requested: string | undefined, granted?: string) {
	if (requested !== undefined && requested !== granted) {
		throw new OAuthError(
			"invalid_target",
			"The resource is not the resource of the authorization",
		);
	}
}

function invalidGrant(message: string): OAuthError {
	return new OAuthError("invalid_grant", message);
}

function verifiesChallenge(verifier: string, challenge: string) {
	return (
		CODE_VERIFIER.test(verifier) &&
		safeEqual(pkceChallenge(verifier), challenge)
	);
}

function issueTokens(now: Date) {
	const accessToken = `${ACCESS_TOKEN_PREFIX}${createSecret(32)}`;
	const refreshToken = `${REFRESH_TOKEN_PREFIX}${createSecret(32)}`;
	return {
		fields: {
			accessTokenHash: sha256(accessToken),
			accessTokenExpiresAt: iso(
				new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
			),
			refreshTokenHash: sha256(refreshToken),
			refreshTokenExpiresAt: iso(
				new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
			),
		},
		response: {
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: ACCESS_TOKEN_TTL_SECONDS,
			refresh_token: refreshToken,
		} satisfies TokenResponse,
	};
}

function parseRegistration(input: unknown) {
	try {
		return parse(registerClientSchema, input);
	} catch (error) {
		throw new OAuthError("invalid_client_metadata", errorMessage(error));
	}
}

function memberCondition(memberId: string): Condition[] {
	return [{ field: "memberId", op: "eq", value: memberId }];
}

/**
 * The OAuth 2.1 authorization server of the MCP endpoint. An agent registers
 * itself, a member signs in and approves it, and the agent then acts as that
 * member. Only hashes of codes and tokens are stored.
 */
export class OAuthService {
	private readonly ctx: ServiceContext;

	constructor(ctx: ServiceContext) {
		this.ctx = ctx;
	}

	/** Dynamic client registration (RFC 7591). Each client is a public client. */
	async register(input: unknown): Promise<ClientRegistration> {
		const data = parseRegistration(input);
		const invalid = data.redirect_uris.find((uri) => !isValidRedirectUri(uri));
		if (invalid !== undefined) {
			throw new OAuthError(
				"invalid_redirect_uri",
				`The redirect URI "${invalid}" is not allowed. Use https, http on a loopback host, or a private-use scheme.`,
			);
		}
		const now = this.ctx.now();
		await this.ctx.store.deleteMany("oauth_clients", {
			where: [
				{ field: "authorizedAt", op: "eq", value: null },
				{
					field: "createdAt",
					op: "lt",
					value: iso(new Date(now.getTime() - UNUSED_CLIENT_TTL_MS)),
				},
			],
		});
		const client: OAuthClient = {
			id: createId("ocl", 24),
			name: data.client_name || "Unnamed agent",
			redirectUris: data.redirect_uris,
			createdAt: iso(now),
		};
		await this.ctx.store.insert("oauth_clients", client);
		return {
			client_id: client.id,
			client_id_issued_at: Math.floor(now.getTime() / 1000),
			client_name: client.name,
			redirect_uris: client.redirectUris,
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		};
	}

	/** Checks an authorization request. `resource` is the URL of the MCP endpoint. */
	async check(
		params: AuthorizationParams,
		resource: string,
	): Promise<AuthorizationCheck> {
		const client = params.client_id
			? await this.ctx.store.get("oauth_clients", params.client_id)
			: undefined;
		if (!client) {
			return {
				kind: "invalid",
				message:
					"This agent is not registered. Remove the MCP server from the agent, then add it again.",
			};
		}
		const redirectUri = params.redirect_uri;
		if (!redirectUri || !matchesRedirect(client.redirectUris, redirectUri)) {
			return {
				kind: "invalid",
				message: "The agent sent a redirect address that it did not register.",
			};
		}
		const fail = (error: string, description: string): AuthorizationCheck => ({
			kind: "redirect",
			url: withParams(redirectUri, {
				error,
				error_description: description,
				state: params.state,
			}),
			message: `The agent sent a request that is not valid: ${description}.`,
		});
		const codeChallenge = params.code_challenge ?? "";
		if (params.response_type !== "code") {
			return fail("unsupported_response_type", "response_type must be code");
		}
		if (
			params.code_challenge_method !== "S256" ||
			!CODE_CHALLENGE.test(codeChallenge)
		) {
			return fail(
				"invalid_request",
				"PKCE with code_challenge_method S256 is required",
			);
		}
		if (!isAllowedResource(params.resource, resource)) {
			return fail("invalid_target", `The resource must be ${resource}`);
		}
		return {
			kind: "consent",
			client,
			request: {
				redirectUri,
				codeChallenge,
				state: params.state,
				resource: params.resource,
			},
		};
	}

	/**
	 * A member approves an authorization request. Returns the URL that sends
	 * the authorization code to the agent.
	 */
	async approve(
		actor: Actor,
		params: AuthorizationParams,
		resource: string,
		name?: string,
	): Promise<string> {
		if (actor.type !== "member") {
			throw new ForbiddenError("Only a member can connect an agent");
		}
		const check = await this.requireCheck(params, resource);
		if (check.kind === "redirect") {
			return check.url;
		}
		const { client, request } = check;
		const now = this.ctx.now();
		await this.ctx.store.deleteMany("oauth_codes", {
			where: [{ field: "expiresAt", op: "lte", value: iso(now) }],
		});
		const code = createSecret(32);
		const record: OAuthCode = {
			id: sha256(code),
			clientId: client.id,
			memberId: actor.id,
			redirectUri: request.redirectUri,
			codeChallenge: request.codeChallenge,
			expiresAt: iso(new Date(now.getTime() + CODE_TTL_MS)),
			createdAt: iso(now),
		};
		if (name !== undefined) {
			record.clientName = parse(createAgentSchema.shape.name, name);
		}
		if (request.resource) {
			record.resource = request.resource;
		}
		await this.ctx.store.insert("oauth_codes", record);
		if (!client.authorizedAt) {
			await this.ctx.store.update("oauth_clients", {
				...client,
				authorizedAt: iso(now),
			});
		}
		return withParams(request.redirectUri, { code, state: request.state });
	}

	/** A member denies an authorization request. Returns the URL that tells the agent. */
	async deny(params: AuthorizationParams, resource: string): Promise<string> {
		const check = await this.requireCheck(params, resource);
		return check.kind === "redirect"
			? check.url
			: withParams(check.request.redirectUri, {
					error: "access_denied",
					error_description: "The member denied the request",
					state: check.request.state,
				});
	}

	/** The token endpoint (RFC 6749 section 3.2). */
	async token(params: Record<string, string>): Promise<TokenResponse> {
		switch (params.grant_type) {
			case "authorization_code":
				return this.exchangeCode(params);
			case "refresh_token":
				return this.refresh(params);
			default:
				throw new OAuthError(
					"unsupported_grant_type",
					"grant_type must be authorization_code or refresh_token",
				);
		}
	}

	/** Resolves an access token to the actor of its agent, or `undefined`. */
	async authenticate(token: string | undefined): Promise<Actor | undefined> {
		if (!token?.startsWith(ACCESS_TOKEN_PREFIX)) {
			return undefined;
		}
		const [grant] = await this.ctx.store.find("oauth_grants", {
			where: [{ field: "accessTokenHash", op: "eq", value: sha256(token) }],
			limit: 1,
		});
		const now = this.ctx.now();
		const member =
			grant && grant.accessTokenExpiresAt > iso(now)
				? await this.ctx.store.get("members", grant.memberId)
				: undefined;
		if (!grant || !member) {
			return undefined;
		}
		const lastUsed = grant.lastUsedAt
			? new Date(grant.lastUsedAt).getTime()
			: 0;
		if (now.getTime() - lastUsed > LAST_USED_RESOLUTION_MS) {
			// A refresh can replace the tokens after the read. The condition stops
			// this write when that occurs, so it cannot restore the old tokens.
			await this.ctx.store.update(
				"oauth_grants",
				{ ...grant, lastUsedAt: iso(now) },
				{
					where: [
						{
							field: "accessTokenHash",
							op: "eq",
							value: grant.accessTokenHash,
						},
					],
				},
			);
		}
		return {
			type: "agent",
			id: grant.id,
			name: `${member.name} via ${grant.clientName}`,
			role: member.role,
		};
	}

	/** The connected agents. An admin sees each connection, a member sees their own. */
	async list(actor: Actor): Promise<AgentConnection[]> {
		const where: Condition[] = [
			{
				field: "refreshTokenExpiresAt",
				op: "gt",
				value: iso(this.ctx.now()),
			},
		];
		if (!hasRole(actor.role, "admin")) {
			where.push(...memberCondition(actor.id));
		}
		const [grants, members] = await Promise.all([
			this.ctx.store.find("oauth_grants", {
				where,
				sort: [{ field: "createdAt", direction: "desc" }],
			}),
			this.ctx.store.find("members"),
		]);
		const names = new Map(members.map((member) => [member.id, member.name]));
		// A connection without its member does not work, so it is not listed.
		return grants.flatMap((grant) => {
			const memberName = names.get(grant.memberId);
			return memberName === undefined
				? []
				: [
						{
							id: grant.id,
							clientName: grant.clientName,
							memberId: grant.memberId,
							memberName,
							lastUsedAt: grant.lastUsedAt,
							expiresAt: grant.refreshTokenExpiresAt,
							createdAt: grant.createdAt,
						},
					];
		});
	}

	/** Disconnects an agent. Its tokens stop working immediately. */
	async disconnect(actor: Actor, id: string): Promise<void> {
		const grant = await this.ctx.store.get("oauth_grants", id);
		if (
			!grant ||
			(grant.memberId !== actor.id && !hasRole(actor.role, "admin"))
		) {
			throw new NotFoundError("Connection", id);
		}
		await this.ctx.store.delete("oauth_grants", id);
	}

	/** Disconnects each agent of a member, for example when the member is removed. */
	async disconnectMember(memberId: string): Promise<void> {
		const where = memberCondition(memberId);
		await this.ctx.store.deleteMany("oauth_codes", { where });
		await this.ctx.store.deleteMany("oauth_grants", { where });
	}

	private async requireCheck(params: AuthorizationParams, resource: string) {
		const check = await this.check(params, resource);
		if (check.kind === "invalid") {
			throw new OAuthError("invalid_request", check.message);
		}
		return check;
	}

	private async client(id: string | undefined): Promise<OAuthClient> {
		const client = id
			? await this.ctx.store.get("oauth_clients", id)
			: undefined;
		if (!client) {
			throw new OAuthError("invalid_client", "The client is not registered");
		}
		return client;
	}

	private async exchangeCode(
		params: Record<string, string>,
	): Promise<TokenResponse> {
		const client = await this.client(params.client_id);
		const id = sha256(params.code ?? "");
		const code = await this.ctx.store.get("oauth_codes", id);
		// A code works one time. Only one of two concurrent exchanges can delete it.
		if (!code || !(await this.ctx.store.delete("oauth_codes", id))) {
			throw invalidGrant("The authorization code is not valid");
		}
		const now = this.ctx.now();
		if (
			code.expiresAt <= iso(now) ||
			code.clientId !== client.id ||
			code.redirectUri !== params.redirect_uri ||
			!verifiesChallenge(params.code_verifier ?? "", code.codeChallenge)
		) {
			throw invalidGrant("The authorization code is not valid");
		}
		checkResource(params.resource, code.resource);
		await this.ctx.store.deleteMany("oauth_grants", {
			where: [{ field: "refreshTokenExpiresAt", op: "lte", value: iso(now) }],
		});
		const tokens = issueTokens(now);
		const grant: OAuthGrant = {
			id: createId("ogr"),
			clientId: client.id,
			clientName: code.clientName ?? client.name,
			memberId: code.memberId,
			...tokens.fields,
			createdAt: iso(now),
		};
		if (code.resource) {
			grant.resource = code.resource;
		}
		await this.ctx.store.insert("oauth_grants", grant);
		return tokens.response;
	}

	private async refresh(params: Record<string, string>) {
		const client = await this.client(params.client_id);
		const hash = sha256(params.refresh_token ?? "");
		const [grant] = await this.ctx.store.find("oauth_grants", {
			where: [{ field: "refreshTokenHash", op: "eq", value: hash }],
			limit: 1,
		});
		const now = this.ctx.now();
		if (
			!grant ||
			grant.clientId !== client.id ||
			grant.refreshTokenExpiresAt <= iso(now)
		) {
			throw invalidGrant("The refresh token is not valid");
		}
		checkResource(params.resource, grant.resource);
		const tokens = issueTokens(now);
		// Each refresh replaces the refresh token. Only one of two concurrent
		// refreshes can match the old hash.
		const updated = await this.ctx.store.update(
			"oauth_grants",
			{ ...grant, ...tokens.fields },
			{ where: [{ field: "refreshTokenHash", op: "eq", value: hash }] },
		);
		if (!updated) {
			throw invalidGrant("The refresh token is not valid");
		}
		return tokens.response;
	}
}
