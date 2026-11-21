import {
	agentFromRequest,
	apiFailure,
	apiJson,
	readJson,
	unauthorized,
} from "@/lib/api";
import { getApp } from "@/lib/app";

export const dynamic = "force-dynamic";

/** Lists subscribers. The response has no token. */
export async function GET(request: Request): Promise<Response> {
	try {
		const { services } = await getApp();
		const actor = await agentFromRequest(request, services);
		if (!actor) {
			return unauthorized();
		}
		return apiJson({
			subscribers: await services.subscribers.list(actor),
		});
	} catch (error) {
		return apiFailure(error);
	}
}

/** Adds a confirmed subscriber. Send `type`, `target`, and `serviceIds` to set a limit. */
export async function POST(request: Request): Promise<Response> {
	try {
		const { services } = await getApp();
		const actor = await agentFromRequest(request, services);
		if (!actor) {
			return unauthorized();
		}
		const subscriber = await services.subscribers.add(
			actor,
			await readJson(request),
		);
		return apiJson({ subscriber }, 201);
	} catch (error) {
		return apiFailure(error);
	}
}
