import { ForbiddenError, PermissionDeniedError } from "@/lib/errors";
import { DEVELOPMENT_MODE_REQUIRED } from "@/lib/services/development";
import {
	ADMIN,
	agentActor,
	createTestContext,
	EDITOR,
	type TestContext,
} from "../helpers";

/** Adds services, a region, a subscriber and incident data with each linked record. */
async function seed(t: TestContext) {
	const api = await t.services.catalog.create(ADMIN, { name: "API" });
	const web = await t.services.catalog.create(ADMIN, { name: "Website" });
	await t.services.catalog.setStatus(ADMIN, web.id, "degraded_performance");
	const europe = await t.services.regions.create(ADMIN, { name: "Europe" });
	await t.services.subscribers.addWebhook(ADMIN, {
		url: "https://hooks.example.com/a",
	});
	const outage = await t.services.incidents.create(ADMIN, {
		title: "API down",
		message: "Requests fail.",
		impact: "critical",
		serviceIds: [api.id],
		serviceRegions: [{ serviceId: api.id, regionIds: [europe.id] }],
		notify: true,
	});
	const removed = await t.services.incidents.create(ADMIN, {
		title: "Test incident",
		message: "Ignore this.",
		notify: false,
	});
	await t.services.incidents.delete(ADMIN, removed.id, { reason: "A test" });
	await t.services.drafts.create(agentActor(), {
		title: "Slow pages",
		message: "Pages load slowly.",
	});
	return { api, web, outage };
}

const CLEARED = [
	"incidents",
	"notification_drafts",
	"notification_jobs",
	"notification_deliveries",
	"service_status_changes",
] as const;

describe("DevelopmentService", () => {
	it("is on for pnpm dev and for a development deployment", () => {
		const enabled = (env: Record<string, string>) =>
			createTestContext({ env }).services.development.enabled;
		expect(enabled({ NODE_ENV: "development" })).toBe(true);
		// The container image sets NODE_ENV to production. DEPLOYMENT marks the Worker.
		expect(enabled({ NODE_ENV: "production", DEPLOYMENT: "development" })).toBe(
			true,
		);
		expect(enabled({ NODE_ENV: "production" })).toBe(false);
		expect(enabled({ NODE_ENV: "test" })).toBe(false);
		expect(enabled({})).toBe(false);
		expect(enabled({ DEPLOYMENT: "production" })).toBe(false);
	});

	it("clears the incidents and their records and keeps the rest", async () => {
		const t = createTestContext({ env: { NODE_ENV: "development" } });
		const { api } = await seed(t);
		t.clock.advance(60 * 60 * 1000);
		for (const collection of CLEARED) {
			expect(await t.store.count(collection)).toBeGreaterThan(0);
		}
		expect((await t.services.catalog.get(api.id)).status).toBe("major_outage");
		expect((await t.services.status.summary()).uptime.uptime).toBeLessThan(1);

		await t.services.development.clearIncidents(ADMIN);

		for (const collection of CLEARED) {
			expect(await t.store.count(collection)).toBe(0);
		}
		const services = await t.services.catalog.list();
		expect(services.map((service) => [service.name, service.status])).toEqual([
			["API", "operational"],
			["Website", "operational"],
		]);
		expect(await t.services.regions.list()).toHaveLength(1);
		expect(await t.services.subscribers.list(ADMIN)).toHaveLength(1);
		const summary = await t.services.status.summary();
		expect(summary.overall).toBe("operational");
		expect(summary.uptime.uptime).toBe(1);
	});

	it("refuses when the server is not in development mode", async () => {
		const t = createTestContext({ env: { NODE_ENV: "production" } });
		const { outage } = await seed(t);
		const error = await t.services.development
			.clearIncidents(ADMIN)
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ForbiddenError);
		expect((error as Error).message).toBe(DEVELOPMENT_MODE_REQUIRED);
		await expect(t.services.incidents.find(outage.id)).resolves.toBeDefined();
	});

	it("requires permission to change general settings", async () => {
		const t = createTestContext({ env: { NODE_ENV: "development" } });
		const { outage } = await seed(t);
		await expect(
			t.services.development.clearIncidents(EDITOR),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(
			t.services.development.clearIncidents(
				agentActor(["settings.branding.write"]),
			),
		).rejects.toMatchObject({ permission: "settings.general.write" });
		await expect(t.services.incidents.find(outage.id)).resolves.toBeDefined();
		await t.services.development.clearIncidents(
			agentActor(["settings.general.write"]),
		);
		await expect(t.services.incidents.find(outage.id)).resolves.toBeUndefined();
	});
});
