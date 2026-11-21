// The Cloudflare Worker entry (`main` in wrangler.jsonc). The Worker sends each
// request to a Durable Object. The Durable Object runs the app image (the
// Dockerfile) in a container and sends the request to it. See
// src/lib/cloudflare-worker.ts and https://incident-command.org/docs/deploy/cloudflare.
import { DurableObject } from "cloudflare:workers";
import {
	ContainerProxy,
	routeRequest,
	type WorkerEnv,
} from "./src/lib/cloudflare-worker";

/** One instance of the app. Each Durable Object controls one container. */
export class AppContainer extends DurableObject<WorkerEnv> {
	private readonly proxy = new ContainerProxy(this.ctx, this.env);

	fetch(request: Request): Promise<Response> {
		return this.proxy.fetch(request);
	}
}

export default {
	fetch(request: Request, env: WorkerEnv): Promise<Response> {
		return routeRequest(request, env);
	},
};
