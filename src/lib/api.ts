import { isAppError, ValidationError } from "./errors";
import { bearerToken } from "./mcp/handler";
import type { Services } from "./services";

/** The agent for a bearer token, or `undefined` when the token is missing or invalid. */
export async function agentFromRequest(request: Request, services: Services) {
	const token = bearerToken(request.headers.get("authorization"));
	return (
		(await services.oauth.authenticate(token)) ??
		(await services.agents.authenticate(token))
	);
}

/** Reads a JSON body. An empty or invalid body is a validation error. */
export async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new ValidationError("Send a JSON body");
	}
}

export function apiJson(data: unknown, status = 200): Response {
	return Response.json(data, { status });
}

/** A 401 response for a request that has no valid agent token. */
export function unauthorized(): Response {
	return Response.json(
		{ error: { code: "unauthorized", message: "Authentication required" } },
		{ status: 401 },
	);
}

/** Turns an expected failure into JSON. Hides the text of any other error. */
export function apiFailure(error: unknown): Response {
	if (isAppError(error)) {
		return Response.json(
			{ error: { code: error.code, message: error.message } },
			{ status: error.status },
		);
	}
	console.error("[api] request failed", error);
	return Response.json(
		{ error: { code: "internal_error", message: "Something went wrong" } },
		{ status: 500 },
	);
}
