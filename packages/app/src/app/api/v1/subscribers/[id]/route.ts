import {
	agentFromRequest,
	apiFailure,
	apiJson,
	readJson,
	unauthorized,
} from "@/lib/api";
import { getApp } from "@/lib/app";

export const dynamic = "force-dynamic";

interface Context {
	params: Promise<{ id: string }>;
}

/** Sets the services that notify this subscriber. An empty list clears the choice. */
export async function PATCH(
	request: Request,
	context: Context,
): Promise<Response> {
	try {
		const { services } = await getApp();
		const actor = await agentFromRequest(request, services);
		if (!actor) {
			return unauthorized();
		}
		const { id } = await context.params;
		const subscriber = await services.subscribers.setServices(
			actor,
			id,
			await readJson(request),
		);
		return apiJson({ subscriber });
	} catch (error) {
		return apiFailure(error);
	}
}
