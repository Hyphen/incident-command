// The Workers runtime gives the `cloudflare:workers` module. This file
// declares only the part that cloudflare-worker.ts uses. Full types for the
// runtime would replace the DOM types of the app.
declare module "cloudflare:workers" {
	import type { ContainerState } from "../lib/cloudflare-worker";

	/** The base class of a Durable Object. Its state has a container. */
	export abstract class DurableObject<Env = unknown> {
		protected readonly ctx: ContainerState;
		protected readonly env: Env;
		constructor(ctx: ContainerState, env: Env);
	}
}
