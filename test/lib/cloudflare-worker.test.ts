import {
	ContainerProxy,
	type ContainerStartOptions,
	routeRequest,
	type WorkerEnv,
} from "@/lib/cloudflare-worker";

const IMAGE = "registry.cloudflare.com/account/incident-command@sha256:new";
const BASIC = { vcpu: 0.25, memoryMib: 1024, diskMb: 4000 };

/**
 * A container as the Durable Object sees it. `server` answers each request
 * that reaches the port, also the readiness probes. `requests` keeps them.
 */
function fakeContainer(
	server: (request: Request) => Response | Promise<Response> = () =>
		new Response("page"),
) {
	let exit: { resolve: () => void; reject: (error: unknown) => void } = {
		resolve: () => {},
		reject: () => {},
	};
	const requests: Request[] = [];
	const container = {
		running: false,
		image: "",
		images: { base: IMAGE },
		requests,
		server,
		start: vi.fn((options: ContainerStartOptions) => {
			container.running = true;
			container.image = options.image;
		}),
		// As in wrangler dev, destroy() kills the process and monitor() rejects.
		destroy: vi.fn(async () =>
			container.stop(
				Object.assign(
					new Error("Container exited with unexpected exit code: 137"),
					{ exitCode: 137 },
				),
			),
		),
		monitor: vi.fn(
			() =>
				new Promise<void>((resolve, reject) => {
					exit = { resolve, reject };
				}),
		),
		setInactivityTimeout: vi.fn(async (_durationMs: number) => {}),
		getTcpPort: vi.fn((_port: number) => ({
			fetch: async (input: Request | string, init?: RequestInit) => {
				const request = new Request(input, init);
				requests.push(request);
				return container.server(request);
			},
		})),
		/** Stops the container, as an exit of its main process does. */
		stop(error?: unknown) {
			container.running = false;
			if (error) {
				exit.reject(error);
			} else {
				exit.resolve();
			}
		},
	};
	return container;
}

function fakeState(
	container: ReturnType<typeof fakeContainer>,
	stored = new Map<string, unknown>(),
) {
	const pending: Promise<unknown>[] = [];
	return {
		container,
		pending,
		stored,
		storage: {
			get: async (key: string) => stored.get(key),
			put: async (key: string, value: unknown) => {
				stored.set(key, value);
			},
		},
		blockConcurrencyWhile: vi.fn((callback: () => Promise<void>) => callback()),
		waitUntil: (promise: Promise<unknown>) => {
			pending.push(promise);
		},
	};
}

function workerEnv(vars: Record<string, string> = {}): WorkerEnv {
	return {
		APP_CONTAINER: { getByName: vi.fn() },
		SITE_URL: "https://status.test",
		DATABASE_URI: "postgres://db.test/incident_command",
		...vars,
	};
}

const page = (path = "/") => new Request(`https://status.test${path}`);
const probes = (requests: Request[]) =>
	requests.filter((request) => request.url === "http://container/healthz");

/** The storage of a Durable Object that started a container with `env` and `image`. */
async function startedStorage(
	env: WorkerEnv,
	image = IMAGE,
): Promise<Map<string, unknown>> {
	const container = fakeContainer();
	container.images.base = image;
	const state = fakeState(container);
	await new ContainerProxy(state, env).fetch(page());
	return state.stored;
}

describe("ContainerProxy", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("starts the container once and sends each request to the app", async () => {
		const container = fakeContainer(async (request) =>
			request.method === "POST"
				? new Response(`saved ${await request.text()}`, {
						status: 303,
						headers: { location: "/manage/incidents/inc_1" },
					})
				: new Response("page"),
		);
		const state = fakeState(container);
		const proxy = new ContainerProxy(
			state,
			workerEnv({ CONTAINER_SLEEP_AFTER: "10m" }),
		);
		expect(state.blockConcurrencyWhile).not.toHaveBeenCalled();

		const action = new Request("https://status.test/manage/incidents", {
			method: "POST",
			body: "title=Outage",
			headers: {
				origin: "https://status.test",
				"cf-connecting-ip": "203.0.113.7",
				"x-forwarded-host": "attacker.test",
			},
		});
		const [saved, home] = await Promise.all([
			proxy.fetch(action),
			proxy.fetch(page()),
		]);

		expect(saved.status).toBe(303);
		expect(saved.headers.get("location")).toBe("/manage/incidents/inc_1");
		await expect(saved.text()).resolves.toBe("saved title=Outage");
		await expect(home.text()).resolves.toBe("page");
		// Requests at the same time share one start and one readiness check.
		expect(container.start).toHaveBeenCalledTimes(1);
		expect(container.start).toHaveBeenCalledWith({
			image: IMAGE,
			instance: BASIC,
			enableInternet: true,
			// Each string binding except the CONTAINER_* vars, and the port of the proxy.
			env: {
				DATABASE_URI: "postgres://db.test/incident_command",
				HOSTNAME: "0.0.0.0",
				PORT: "3000",
				SITE_URL: "https://status.test",
			},
		});
		expect(container.getTcpPort).toHaveBeenCalledWith(3000);
		expect(container.setInactivityTimeout).toHaveBeenCalledWith(600_000);
		expect(probes(container.requests)).toHaveLength(1);

		const forwarded = container.requests.find(
			(request) => request.method === "POST",
		);
		expect(forwarded?.url).toBe("http://container/manage/incidents");
		expect(forwarded?.redirect).toBe("manual");
		expect(Object.fromEntries(forwarded?.headers ?? [])).toMatchObject({
			origin: "https://status.test",
			"x-forwarded-host": "status.test",
			"x-forwarded-proto": "https",
			"x-forwarded-for": "203.0.113.7",
		});

		// A ready container gets the next request without a new check.
		await proxy.fetch(page("/history"));
		expect(container.start).toHaveBeenCalledTimes(1);
		expect(probes(container.requests)).toHaveLength(1);
		const last = container.requests.at(-1);
		expect(last?.url).toBe("http://container/history");
		expect(last?.headers.has("x-forwarded-for")).toBe(false);
	});

	it.each<{
		vars: Record<string, string>;
		instance: string | typeof BASIC;
		sleepAfterMs: number;
	}>([
		{ vars: {}, instance: BASIC, sleepAfterMs: 1_800_000 },
		{
			vars: {
				CONTAINER_INSTANCE_TYPE: "standard-1",
				CONTAINER_SLEEP_AFTER: "2h",
			},
			instance: "standard-1",
			sleepAfterMs: 7_200_000,
		},
		{
			vars: {
				CONTAINER_INSTANCE_TYPE: " basic ",
				CONTAINER_SLEEP_AFTER: "90s",
			},
			instance: BASIC,
			sleepAfterMs: 90_000,
		},
		{
			vars: { CONTAINER_SLEEP_AFTER: "1500" },
			instance: BASIC,
			sleepAfterMs: 1_500,
		},
		{
			vars: { CONTAINER_SLEEP_AFTER: "500ms" },
			instance: BASIC,
			sleepAfterMs: 500,
		},
		// At most 6 hours, the limit of setInactivityTimeout().
		{
			vars: { CONTAINER_SLEEP_AFTER: "12h" },
			instance: BASIC,
			sleepAfterMs: 21_600_000,
		},
		{
			vars: { CONTAINER_SLEEP_AFTER: "0" },
			instance: BASIC,
			sleepAfterMs: 1_800_000,
		},
		{
			vars: { CONTAINER_SLEEP_AFTER: "soon" },
			instance: BASIC,
			sleepAfterMs: 1_800_000,
		},
	])(
		"starts the container with the settings of $vars",
		async ({ vars, instance, sleepAfterMs }) => {
			const container = fakeContainer();
			await new ContainerProxy(fakeState(container), workerEnv(vars)).fetch(
				page(),
			);
			expect(container.start).toHaveBeenCalledWith(
				expect.objectContaining({ instance }),
			);
			expect(container.setInactivityTimeout).toHaveBeenCalledWith(sleepAfterMs);
		},
	);

	it.each([
		{ change: "an earlier image", from: { image: "old" }, replaced: true },
		{
			change: "other settings or secrets",
			from: { vars: { SETUP_TOKEN: "old" } },
			replaced: true,
		},
		{
			change: "a container without a stored fingerprint",
			from: undefined,
			replaced: true,
		},
		{ change: "no change", from: {}, replaced: false },
	])(
		"after a restart of the Durable Object, replaces a running container for $change",
		async ({ from, replaced }) => {
			const log = vi.spyOn(console, "log").mockImplementation(() => {});
			const error = vi.spyOn(console, "error").mockImplementation(() => {});
			const env = workerEnv();
			const container = fakeContainer();
			container.running = true;
			const stored = from
				? await startedStorage(workerEnv(from.vars), from.image)
				: new Map<string, unknown>();
			const state = fakeState(container, stored);

			const proxy = new ContainerProxy(state, env);
			// The restart keeps the inactivity timeout before the first request.
			expect(state.blockConcurrencyWhile).toHaveBeenCalledTimes(1);
			expect(container.setInactivityTimeout).toHaveBeenCalledWith(1_800_000);
			expect(container.monitor).toHaveBeenCalledTimes(1);

			const response = await proxy.fetch(page());
			await expect(response.text()).resolves.toBe("page");
			expect(container.destroy).toHaveBeenCalledTimes(replaced ? 1 : 0);
			expect(container.start).toHaveBeenCalledTimes(replaced ? 1 : 0);
			if (replaced) {
				expect(container.image).toBe(IMAGE);
				// The next restart keeps the new container.
				expect(state.stored).toEqual(await startedStorage(env));
				expect(log).toHaveBeenCalledWith(
					"A deploy changed the image or the settings. The container starts again.",
				);
				await state.pending[0];
				expect(log).toHaveBeenCalledWith("The container stopped.");
				expect(error).not.toHaveBeenCalled();
				// A later crash of the new container is an error again.
				container.stop(new Error("exit"));
				await state.pending[1];
				expect(error).toHaveBeenCalledWith(
					"The container stopped with an error.",
					expect.any(Error),
				);
			}
		},
	);

	it("answers 503 when the server does not answer in time, and tries again", async () => {
		vi.useFakeTimers();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const container = fakeContainer(() => {
			throw new Error("Container is not listening to port 3000");
		});
		const proxy = new ContainerProxy(fakeState(container), workerEnv());

		const pending = proxy.fetch(page());
		// The start hashes the settings first. Then the readiness check waits.
		await vi.waitFor(() => expect(container.getTcpPort).toHaveBeenCalled());
		await vi.advanceTimersByTimeAsync(61_000);
		const response = await pending;
		expect(response.status).toBe(503);
		expect(response.headers.get("retry-after")).toBe("10");
		expect(error).toHaveBeenCalledWith(
			"The container is not ready.",
			expect.objectContaining({
				message: "The server did not answer on port 3000.",
			}),
		);

		// The app answers 503 itself when it cannot start. That answer goes to the client.
		container.server = (request) =>
			request.url === "http://container/healthz"
				? new Response("unavailable", { status: 503 })
				: new Response("error page", { status: 500 });
		const retry = await proxy.fetch(page());
		expect(retry.status).toBe(500);
		expect(container.start).toHaveBeenCalledTimes(1);
	});

	const crash = Object.assign(new Error("exit"), { exitCode: 1 });
	it.each([
		{
			exit: "a clean exit",
			error: undefined,
			level: "log" as const,
			logged: ["The container stopped."],
		},
		{
			exit: "a crash",
			error: crash,
			level: "error" as const,
			logged: ["The container stopped with an error.", crash],
		},
	])(
		"logs $exit of the container and starts it again on the next request",
		async ({ error, level, logged }) => {
			const spy = vi.spyOn(console, level).mockImplementation(() => {});
			const container = fakeContainer();
			const state = fakeState(container);
			const proxy = new ContainerProxy(state, workerEnv());
			await proxy.fetch(page());

			container.stop(error);
			await state.pending[0];
			expect(spy).toHaveBeenCalledWith(...logged);

			const response = await proxy.fetch(page());
			await expect(response.text()).resolves.toBe("page");
			expect(container.start).toHaveBeenCalledTimes(2);
			expect(probes(container.requests)).toHaveLength(2);
		},
	);

	it("answers 503 when a request to the container fails, and checks the server again", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const container = fakeContainer();
		const proxy = new ContainerProxy(fakeState(container), workerEnv());
		await proxy.fetch(page());

		container.server = (request) => {
			if (request.url === "http://container/healthz") {
				return new Response("ok");
			}
			throw new Error("Network connection lost.");
		};
		const failed = await proxy.fetch(page());
		expect(failed.status).toBe(503);
		expect(error).toHaveBeenCalledWith(
			"The request to the container failed.",
			expect.any(Error),
		);

		container.server = () => new Response("page");
		await proxy.fetch(page());
		expect(probes(container.requests)).toHaveLength(2);
		expect(container.start).toHaveBeenCalledTimes(1);
	});
});

describe("routeRequest", () => {
	function routedEnv(vars: Record<string, string> = {}) {
		const getByName = vi.fn((name: string) => ({
			fetch: async (_request: Request) => new Response(name),
		}));
		return { env: { ...workerEnv(vars), APP_CONTAINER: { getByName } } };
	}

	const from = (address?: string) =>
		new Request("https://status.test/", {
			headers: address ? { "cf-connecting-ip": address } : {},
		});

	async function route(env: WorkerEnv, request: Request) {
		return (await routeRequest(request, env)).text();
	}

	it("sends each request to the one instance by default", async () => {
		const { env } = routedEnv();
		await expect(route(env, from("203.0.113.7"))).resolves.toBe("app-0");
		await expect(route(env, from("198.51.100.1"))).resolves.toBe("app-0");
		await expect(route(env, from())).resolves.toBe("app-0");
	});

	it("keeps each client address on one instance of the pool", async () => {
		const { env } = routedEnv({ CONTAINER_INSTANCES: "4" });
		const first = await route(env, from("203.0.113.7"));
		await expect(route(env, from("203.0.113.7"))).resolves.toBe(first);

		const names = new Set<string>();
		for (let host = 1; host <= 50; host++) {
			names.add(await route(env, from(`198.51.100.${host}`)));
		}
		expect([...names].every((name) => /^app-[0-3]$/.test(name))).toBe(true);
		expect(names.size).toBeGreaterThan(1);
	});

	it("uses one instance when CONTAINER_INSTANCES is not a positive number", async () => {
		for (const value of ["0", "-2", "many"]) {
			const { env } = routedEnv({ CONTAINER_INSTANCES: value });
			await expect(route(env, from("203.0.113.7"))).resolves.toBe("app-0");
		}
	});
});
