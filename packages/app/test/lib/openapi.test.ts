import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GET as openapi } from "@/app/api/v1/openapi.json/route";
import { createApp, setApp } from "@/lib/app";
import { loadConfig } from "@/lib/config";
import { buildOpenApi } from "@/lib/openapi";
import { Clock, FakeNotifier } from "../helpers";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, "../../src/app/api/v1");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Each route file under src/app/api/v1, except the document itself. */
function routeFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const file = path.join(dir, name);
		if (statSync(file).isDirectory()) {
			return name === "openapi.json" ? [] : routeFiles(file);
		}
		return name === "route.ts" ? [file] : [];
	});
}

afterEach(() => setApp(undefined));

describe("OpenAPI document", () => {
	// The documentation site renders packages/website/site/api/swagger.json.
	// After an API change, run `pnpm openapi` to write the new copy.
	it("matches the copy in the documentation site", async () => {
		await expect(
			`${JSON.stringify(buildOpenApi(), null, "\t")}\n`,
		).toMatchFileSnapshot("../../../website/site/api/swagger.json");
	});

	it("describes each route and method of the REST API", async () => {
		const routes: Record<string, string[]> = {};
		for (const file of routeFiles(apiDir)) {
			const route = path
				.relative(apiDir, path.dirname(file))
				.replace(/\[(\w+)\]/g, "{$1}");
			const module = await import(file);
			routes[`/api/v1/${route}`] = HTTP_METHODS.filter(
				(method) => typeof module[method] === "function",
			)
				.map((method) => method.toLowerCase())
				.sort();
		}
		const documented = Object.fromEntries(
			Object.entries(buildOpenApi().paths).map(([route, operations]) => [
				route,
				Object.keys(operations).sort(),
			]),
		);
		expect(documented).toEqual(routes);
	});

	it("serves the document with the public URL as the server", async () => {
		setApp(
			await createApp({
				config: loadConfig({ SITE_URL: "https://status.acme.test/" }),
				notifier: new FakeNotifier(),
				now: new Clock().now,
			}),
		);
		const response = await openapi(
			new Request("http://localhost/api/v1/openapi.json"),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		const body = await response.json();
		expect(body.servers).toEqual([{ url: "https://status.acme.test" }]);
		expect(body.paths["/api/v1/status"].get.operationId).toBe("getStatus");
	});
});
