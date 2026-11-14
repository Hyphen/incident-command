/**
 * The Cloudflare deployment: a Worker in front of a container. The container
 * runs the image from the Dockerfile (the Next.js standalone server). A
 * Durable Object controls each container. The root `cloudflare-worker.ts`
 * connects these parts to the Workers runtime.
 *
 * This module runs in the Worker, not in the app. Do not import app code here,
 * because wrangler bundles each import into the Worker.
 */

/** The port of the Next.js server in the image (`PORT` in the Dockerfile). */
const CONTAINER_PORT = 3000;

/** A named instance type, or a custom size, as `ctx.container.start()` takes it. */
export type InstanceType =
	| string
	| { vcpu: number; memoryMib: number; diskMb: number };

/** The options of `ctx.container.start()` that the proxy sets. */
export interface ContainerStartOptions {
	image: string;
	instance: InstanceType;
	enableInternet: boolean;
	env: Record<string, string>;
}

/** The part of `ctx.container` that the proxy uses. */
export interface WorkerContainer {
	readonly running: boolean;
	/** The images from `containers[].images` in wrangler.jsonc. */
	readonly images: { readonly base: string };
	start(options: ContainerStartOptions): void;
	destroy(reason?: unknown): Promise<void>;
	monitor(): Promise<void>;
	setInactivityTimeout(durationMs: number): Promise<void>;
	getTcpPort(port: number): {
		fetch(input: Request | string, init?: RequestInit): Promise<Response>;
	};
}

/** The part of the Durable Object state that the proxy uses. */
export interface ContainerState {
	readonly container: WorkerContainer;
	/** The storage of the Durable Object. It keeps its data after a restart. */
	readonly storage: {
		get(key: string): Promise<unknown>;
		put(key: string, value: unknown): Promise<void>;
	};
	blockConcurrencyWhile(callback: () => Promise<void>): Promise<void>;
	waitUntil(promise: Promise<unknown>): void;
}

/** The part of a Durable Object namespace that the Worker uses. */
export interface ContainerNamespace {
	getByName(name: string): { fetch(request: Request): Promise<Response> };
}

/**
 * The bindings of the Worker. The `CONTAINER_*` vars configure the Worker.
 * Each other string binding (a var or a secret) goes to the container as an
 * environment variable.
 */
export interface WorkerEnv {
	APP_CONTAINER: ContainerNamespace;
	/** The number of container instances (default 1). */
	CONTAINER_INSTANCES?: string;
	/** `lite`, `basic` (default), `standard-1`, `standard-2`, `standard-3` or `standard-4`. Other values use `basic`. */
	CONTAINER_INSTANCE_TYPE?: string;
	/** An idle container stops after this time: `30s`, `30m` or `2h` (default `30m`, at most `6h`). */
	CONTAINER_SLEEP_AFTER?: string;
	[name: string]: unknown;
}

interface ContainerSettings {
	instances: number;
	instance: InstanceType;
	sleepAfterMs: number;
}

/**
 * The size of the `basic` instance type. With the `durable_object`
 * scheduling policy, the runtime does not accept the name `basic`.
 */
const BASIC_INSTANCE = { vcpu: 0.25, memoryMib: 1024, diskMb: 4000 };
const DEFAULT_SLEEP_AFTER_MS = 30 * 60_000;
/** The maximum of `setInactivityTimeout()`. */
const MAX_SLEEP_AFTER_MS = 6 * 60 * 60_000;
/** How long a request waits for a new container before it gets a 503. */
const READY_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 5_000;
const PROBE_INTERVAL_MS = 250;
/** How many times a request starts a container that stops before its server answers. */
const MAX_STARTS = 3;
const UNITS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 } as const;
/** The storage key of the fingerprint of the container that runs. */
const CONFIG_KEY = "container-config";

/**
 * The instance types that `CONTAINER_INSTANCE_TYPE` accepts. `dev` and
 * `standard` are the old names of `lite` and `standard-1`.
 */
const INSTANCE_TYPES = new Map<string, InstanceType>([
	["lite", "lite"],
	["dev", "lite"],
	["basic", BASIC_INSTANCE],
	["standard", "standard-1"],
	["standard-1", "standard-1"],
	["standard-2", "standard-2"],
	["standard-3", "standard-3"],
	["standard-4", "standard-4"],
]);

/** Parses `500ms`, `30s`, `30m`, `2h` or plain milliseconds. */
function parseDuration(value: string | undefined): number | undefined {
	const match = /^(\d+)(ms|s|m|h)?$/.exec(value?.trim() ?? "");
	if (!match) {
		return undefined;
	}
	const unit = (match[2] ?? "ms") as keyof typeof UNITS;
	const ms = Number(match[1]) * UNITS[unit];
	return ms > 0 ? ms : undefined;
}

/** Reads the `CONTAINER_*` vars. Invalid values use the defaults. */
function containerSettings(env: WorkerEnv): ContainerSettings {
	const instances = Number.parseInt(env.CONTAINER_INSTANCES ?? "", 10);
	const type = env.CONTAINER_INSTANCE_TYPE?.trim() ?? "";
	return {
		instances: Number.isNaN(instances) ? 1 : Math.max(instances, 1),
		instance: INSTANCE_TYPES.get(type) ?? BASIC_INSTANCE,
		sleepAfterMs: Math.min(
			parseDuration(env.CONTAINER_SLEEP_AFTER) ?? DEFAULT_SLEEP_AFTER_MS,
			MAX_SLEEP_AFTER_MS,
		),
	};
}

/** The environment of the container: each string binding, except the `CONTAINER_*` vars. */
function containerEnv(env: WorkerEnv): Record<string, string> {
	const result: Record<string, string> = {};
	for (const name of Object.keys(env).sort()) {
		const value = env[name];
		if (typeof value === "string" && !name.startsWith("CONTAINER_")) {
			result[name] = value;
		}
	}
	// The proxy connects to this port on all interfaces.
	result.PORT = String(CONTAINER_PORT);
	result.HOSTNAME = "0.0.0.0";
	return result;
}

/** A 32-bit FNV-1a hash. */
function hash(value: string): number {
	let result = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		result ^= value.charCodeAt(index);
		result = Math.imul(result, 0x01000193);
	}
	return result >>> 0;
}

/**
 * The name of the instance for a request. Each instance has its own cache.
 * The requests of one client address go to one instance, so a client reads
 * its own changes immediately.
 */
function instanceName(request: Request, instances: number): string {
	const client = request.headers.get("cf-connecting-ip") ?? "";
	return `app-${instances > 1 ? hash(client) % instances : 0}`;
}

/** The Worker: sends each request to the Durable Object of its instance. */
export async function routeRequest(
	request: Request,
	env: WorkerEnv,
): Promise<Response> {
	const { instances } = containerSettings(env);
	try {
		return await env.APP_CONTAINER.getByName(
			instanceName(request, instances),
		).fetch(request);
	} catch (error) {
		// For example, a deploy resets the Durable Object during the request.
		console.error("The Durable Object did not answer.", error);
		return unavailable();
	}
}

/** Proxy headers from the client. The proxy removes them. */
const CLIENT_PROXY_HEADERS = [
	"host",
	"forwarded",
	"x-forwarded-port",
	"x-real-ip",
];

/**
 * Makes the request for the server in the container. Next.js compares the
 * `Origin` of a server action with `x-forwarded-host`, so that header must
 * keep the public host. The proxy sets `x-forwarded-host`,
 * `x-forwarded-proto` and `x-forwarded-for`, and removes other proxy headers,
 * so a client cannot set them.
 */
function containerRequest(request: Request): Request {
	const url = new URL(request.url);
	const headers = new Headers(request.headers);
	for (const name of CLIENT_PROXY_HEADERS) {
		headers.delete(name);
	}
	headers.set("x-forwarded-host", url.host);
	headers.set("x-forwarded-proto", url.protocol.slice(0, -1));
	const client = request.headers.get("cf-connecting-ip");
	if (client) {
		headers.set("x-forwarded-for", client);
	} else {
		headers.delete("x-forwarded-for");
	}
	url.protocol = "http:";
	url.host = "container";
	const init: RequestInit & { duplex?: "half" } = {
		method: request.method,
		headers,
		body: request.body,
		// Send redirects to the browser. Do not follow them here.
		redirect: "manual",
		duplex: "half",
	};
	return new Request(url, init);
}

/** A SHA-256 hash of the value as hexadecimal text (64 characters). */
async function fingerprint(value: unknown): Promise<string> {
	const data = new TextEncoder().encode(JSON.stringify(value));
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function unavailable(): Response {
	return new Response("The service starts. Try again in a few seconds.\n", {
		status: 503,
		headers: {
			"cache-control": "no-store",
			"content-type": "text/plain; charset=utf-8",
			"retry-after": "10",
		},
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until the server answers on `/healthz`. Each answer, also a 503,
 * shows that the server listens. A 503 from the app goes to the client.
 * Returns false when the container stops first.
 */
async function waitForServer(
	container: WorkerContainer,
	deadline: number,
): Promise<boolean> {
	const port = container.getTcpPort(CONTAINER_PORT);
	let lastError: unknown;
	while (Date.now() < deadline) {
		if (!container.running) {
			return false;
		}
		try {
			const response = await port.fetch("http://container/healthz", {
				signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
			});
			await response.body?.cancel();
			return true;
		} catch (error) {
			lastError = error;
		}
		await sleep(PROBE_INTERVAL_MS);
	}
	throw new Error(`The server did not answer on port ${CONTAINER_PORT}.`, {
		cause: lastError,
	});
}

/**
 * The logic of the Durable Object. It starts the container on the first
 * request and sends each request to it. When a deploy changes the image, the
 * settings or the secrets, it replaces the container that runs.
 */
export class ContainerProxy {
	private readonly state: ContainerState;
	private readonly env: WorkerEnv;
	private readonly settings: ContainerSettings;
	/** True when the server in the container answered. */
	private ready = false;
	private starting: Promise<void> | undefined;
	/** The stop of the watched container. A replacement plans it. */
	private watched = { planned: false };

	constructor(state: ContainerState, env: WorkerEnv) {
		this.state = state;
		this.env = env;
		this.settings = containerSettings(env);
		const container = state.container;
		if (container.running) {
			// A Durable Object that restarts, for example after a deploy, has no
			// inactivity timeout. The container can still run.
			void state.blockConcurrencyWhile(() =>
				container.setInactivityTimeout(this.settings.sleepAfterMs),
			);
			this.watch();
		}
	}

	async fetch(request: Request): Promise<Response> {
		// A GET or a HEAD has no body, so the proxy can send it again.
		const attempts =
			request.method === "GET" || request.method === "HEAD" ? 2 : 1;
		for (let attempt = 1; ; attempt++) {
			try {
				await this.ensureReady();
			} catch (error) {
				console.error("The container is not ready.", error);
				return unavailable();
			}
			try {
				return await this.state.container
					.getTcpPort(CONTAINER_PORT)
					.fetch(containerRequest(request));
			} catch (error) {
				// The container can be stopped. Check it again before the next request.
				this.ready = false;
				console.error("The request to the container failed.", error);
				if (attempt === attempts) {
					return unavailable();
				}
			}
		}
	}

	/** Starts the container if necessary. Requests at the same time share one start. */
	private async ensureReady(): Promise<void> {
		if (this.ready && this.state.container.running) {
			return;
		}
		this.starting ??= this.start().finally(() => {
			this.starting = undefined;
		});
		await this.starting;
	}

	private async start(): Promise<void> {
		this.ready = false;
		const { container, storage } = this.state;
		const image = container.images.base;
		const env = containerEnv(this.env);
		const instance = this.settings.instance;
		const config = await fingerprint({ image, env, instance });
		// Replace a container from an earlier deploy, or one with other settings
		// or secrets. The storage keeps the fingerprint after a restart of the
		// Durable Object, for example after a deploy.
		if (container.running && (await storage.get(CONFIG_KEY)) !== config) {
			console.log(
				"A deploy changed the image or the settings. The container starts again.",
			);
			// The docs say that monitor() resolves after destroy() without a
			// reason. In wrangler dev, destroy() kills the process and monitor()
			// rejects. Both are a planned stop, not an error.
			this.watched.planned = true;
			await container.destroy();
		}
		const deadline = Date.now() + READY_TIMEOUT_MS;
		// A container can be unavailable for a short time after destroy(), and
		// the app can stop while it starts. Then start the container again.
		for (let attempt = 1; ; attempt++) {
			if (!container.running) {
				container.start({
					image,
					instance,
					// The app connects to the database, email providers and webhooks.
					enableInternet: true,
					env,
				});
				this.watch();
				await storage.put(CONFIG_KEY, config);
			}
			await container.setInactivityTimeout(this.settings.sleepAfterMs);
			if (await waitForServer(container, deadline)) {
				break;
			}
			if (attempt === MAX_STARTS) {
				throw new Error(
					`The container stopped ${MAX_STARTS} times before the server answered.`,
				);
			}
		}
		this.ready = true;
	}

	/** Logs when the container stops. An unplanned stop is an error. */
	private watch(): void {
		const stop = { planned: false };
		this.watched = stop;
		this.state.waitUntil(
			this.state.container.monitor().then(
				() => console.log("The container stopped."),
				(error: unknown) => {
					if (stop.planned) {
						console.log("The container stopped.");
					} else {
						console.error("The container stopped with an error.", error);
					}
				},
			),
		);
	}
}
