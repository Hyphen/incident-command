import { NotFoundError } from "@/lib/errors";
import { ADMIN, createTestContext, EDITOR, type TestContext } from "../helpers";

describe("StatusService", () => {
	let t: TestContext;
	beforeEach(() => {
		t = createTestContext();
	});

	it("summarizes an empty page as operational", async () => {
		const summary = await t.services.status.summary();
		expect(summary.overall).toBe("operational");
		expect(summary.groups).toEqual([]);
		expect(summary.window.days).toBe(90);
		expect(summary.window.start.toISOString()).toBe("2026-08-05T00:00:00.000Z");
		expect(summary.generatedAt).toBe("2026-11-02T12:00:00.000Z");
	});

	it("groups services, computes uptime and the overall status", async () => {
		t.clock.set("2026-10-01T00:00:00.000Z");
		const api = await t.services.catalog.create(EDITOR, {
			name: "API",
			group: "Core",
		});
		await t.services.catalog.create(EDITOR, { name: "Web" });
		await t.services.catalog.create(EDITOR, {
			name: "Workers",
			group: "Core",
		});
		await t.services.catalog.create(EDITOR, {
			name: "Secret",
			hidden: true,
			status: "major_outage",
		});
		t.clock.set("2026-11-01T10:00:00.000Z");
		const incident = await t.services.incidents.create(EDITOR, {
			title: "API down",
			message: "Down",
			impact: "critical",
			serviceIds: [api.id],
		});
		t.clock.set("2026-11-01T11:00:00.000Z");
		await t.services.incidents.resolve(EDITOR, incident.id);
		t.clock.set("2026-11-02T12:00:00.000Z");

		const summary = await t.services.status.summary();
		expect(
			summary.groups.map((g) => [g.name, g.services.map((c) => c.name)]),
		).toEqual([
			["Core", ["API", "Workers"]],
			[null, ["Web"]],
		]);
		expect(summary.overall).toBe("operational");
		const apiView = summary.services.find((c) => c.id === api.id);
		const day = apiView?.days.find((d) => d.date === "2026-11-01");
		expect(day?.status).toBe("major_outage");
		expect(day?.incidents.map((i) => i.id)).toEqual([incident.id]);
		expect(apiView?.uptime).toBeLessThan(1);
		expect(apiView?.days[0]?.status).toBeNull();
		expect(summary.recentIncidents.map((i) => i.id)).toEqual([incident.id]);
		expect(summary.activeIncidents).toEqual([]);
	});

	it("reflects active incidents and maintenance", async () => {
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Elevated errors",
			message: "Hmm",
			impact: "major",
		});
		const soon = await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "Later",
			message: "Later",
			scheduledStart: "2026-11-10T00:00:00.000Z",
			scheduledEnd: "2026-11-10T01:00:00.000Z",
		});
		const sooner = await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "Sooner",
			message: "Sooner",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T01:00:00.000Z",
		});
		const running = await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "Now",
			message: "Now",
			status: "in_progress",
			serviceIds: [api.id],
			scheduledStart: "2026-11-02T11:00:00.000Z",
			scheduledEnd: "2026-11-02T13:00:00.000Z",
		});
		const summary = await t.services.status.summary();
		expect(summary.activeIncidents.map((i) => i.id)).toEqual([incident.id]);
		expect(summary.activeMaintenance.map((i) => i.id)).toEqual([running.id]);
		expect(summary.upcomingMaintenance.map((i) => i.id)).toEqual([
			sooner.id,
			soon.id,
		]);
		expect(summary.recentIncidents.map((i) => i.id)).not.toContain(soon.id);
		expect(summary.overall).toBe("partial_outage");
		expect(summary.services[0]?.status).toBe("under_maintenance");

		await t.services.incidents.resolve(EDITOR, incident.id);
		expect((await t.services.status.summary()).overall).toBe(
			"under_maintenance",
		);
	});

	it("gives the minute timeline of the visible affected services", async () => {
		t.clock.set("2026-10-01T00:00:00.000Z");
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const web = await t.services.catalog.create(EDITOR, { name: "Web" });
		const secret = await t.services.catalog.create(EDITOR, {
			name: "Secret",
			hidden: true,
		});
		t.clock.set("2026-11-02T10:00:00.000Z");
		const incident = await t.services.incidents.create(EDITOR, {
			title: "API down",
			message: "Down",
			impact: "critical",
			serviceIds: [api.id, secret.id],
		});
		t.clock.set("2026-11-02T10:30:00.000Z");
		await t.services.catalog.setStatus(EDITOR, web.id, "partial_outage");
		t.clock.set("2026-11-02T11:00:00.000Z");
		const resolved = await t.services.incidents.resolve(EDITOR, incident.id);
		t.clock.set("2026-11-02T12:00:00.000Z");

		// The window starts 2 hours before the incident and stops at now.
		const timeline = await t.services.status.incidentTimeline(resolved);
		expect(timeline.untilNow).toBe(true);
		expect(timeline.services.map((entry) => entry.service.name)).toEqual([
			"API",
		]);
		expect(
			timeline.services[0]?.periods.map((period) => [
				period.status,
				period.start,
				period.end,
			]),
		).toEqual([
			["operational", "2026-11-02T08:00:00.000Z", "2026-11-02T10:00:00.000Z"],
			["major_outage", "2026-11-02T10:00:00.000Z", "2026-11-02T11:00:00.000Z"],
			["operational", "2026-11-02T11:00:00.000Z", "2026-11-02T12:00:00.000Z"],
		]);

		// Later, the window stops 2 hours after the incident. A status change
		// after the window does not show.
		t.clock.set("2026-11-05T09:00:00.000Z");
		await t.services.catalog.setStatus(EDITOR, api.id, "degraded_performance");
		t.clock.set("2026-11-20T00:00:00.000Z");
		const later = await t.services.status.incidentTimeline(resolved);
		expect(later).toMatchObject({
			start: "2026-11-02T08:00:00.000Z",
			end: "2026-11-02T13:00:00.000Z",
			untilNow: false,
		});
		expect(
			later.services[0]?.periods.map((period) => [period.status, period.end]),
		).toEqual([
			["operational", "2026-11-02T10:00:00.000Z"],
			["major_outage", "2026-11-02T11:00:00.000Z"],
			["operational", "2026-11-02T13:00:00.000Z"],
		]);
	});

	it("gives no minute timeline for maintenance that did not start", async () => {
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const scheduled = await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "Later",
			message: "Later",
			serviceIds: [api.id],
			scheduledStart: "2026-11-10T00:00:00.000Z",
			scheduledEnd: "2026-11-10T01:00:00.000Z",
		});
		expect(
			(await t.services.status.incidentTimeline(scheduled)).services,
		).toEqual([]);
	});

	it("adds uptime periods and incident metrics for the overview", async () => {
		t.clock.set("2026-08-01T00:00:00.000Z");
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		await t.services.catalog.create(EDITOR, { name: "Secret", hidden: true });
		const incident = (title: string, serviceIds: string[] = []) =>
			t.services.incidents.create(EDITOR, {
				title,
				message: title,
				impact: "critical",
				serviceIds,
			});
		// Older than the period before: not counted.
		t.clock.set("2026-08-20T10:00:00.000Z");
		await t.services.incidents.resolve(EDITOR, (await incident("Ancient")).id);
		// The period before.
		t.clock.set("2026-09-23T10:00:00.000Z");
		await t.services.incidents.resolve(EDITOR, (await incident("Old")).id);
		// This period: one outage of 2h and one open incident.
		t.clock.set("2026-10-30T10:00:00.000Z");
		const outage = await incident("Down", [api.id]);
		t.clock.set("2026-10-30T12:00:00.000Z");
		await t.services.incidents.resolve(EDITOR, outage.id);
		t.clock.set("2026-11-02T11:00:00.000Z");
		const open = await incident("Slow");
		await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "Upgrade",
			message: "Upgrade",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T01:00:00.000Z",
		});
		t.clock.set("2026-11-02T12:00:00.000Z");

		const overview = await t.services.status.overview();
		// Each period ends at noon today: 2h of major outage in each period.
		const expected = [
			{ days: 7, uptime: expect.closeTo(1 - 2 / (6 * 24 + 12), 10) },
			{ days: 30, uptime: expect.closeTo(1 - 2 / (29 * 24 + 12), 10) },
			{ days: 90, uptime: expect.closeTo(1 - 2 / (89 * 24 + 12), 10) },
		];
		expect(overview.periods).toEqual(expected);
		expect(overview.summary.uptime.uptime).toBeCloseTo(1 - 2 / 2148, 10);
		expect(overview.services.map((row) => row.service.id)).toEqual([api.id]);
		expect(overview.services[0]?.periods).toEqual(expected);
		expect(overview.metrics).toMatchObject({
			days: 30,
			previousCount: 1,
			resolved: 1,
			meanMs: 2 * 3_600_000,
			longestMs: 2 * 3_600_000,
		});
		expect(overview.metrics.incidents.map((i) => i.id)).toEqual([
			open.id,
			outage.id,
		]);
	});

	it("honors the configured uptime window", async () => {
		await t.services.settings.update(ADMIN, { uptimeDays: 7 });
		const summary = await t.services.status.summary();
		expect(summary.window.days).toBe(7);
	});

	it("paginates history by month", async () => {
		t.clock.set("2026-08-15T00:00:00.000Z");
		const august = await t.services.incidents.create(EDITOR, {
			title: "Aug",
			message: "a",
			status: "resolved",
		});
		t.clock.set("2026-10-20T00:00:00.000Z");
		const october = await t.services.incidents.create(EDITOR, {
			title: "Oct",
			message: "o",
			status: "resolved",
		});
		await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "Future",
			message: "f",
			scheduledStart: "2026-12-01T00:00:00.000Z",
			scheduledEnd: "2026-12-01T01:00:00.000Z",
		});
		t.clock.set("2026-11-02T12:00:00.000Z");

		const latest = await t.services.status.history();
		expect(latest.months.map((m) => m.key)).toEqual([
			"2026-11",
			"2026-10",
			"2026-09",
		]);
		expect(latest.months[1]?.incidents.map((i) => i.id)).toEqual([october.id]);
		expect(latest.older).toBe("2026-08");
		expect(latest.newer).toBeNull();

		const older = await t.services.status.history("2026-08");
		expect(older.months.map((m) => m.key)).toEqual([
			"2026-08",
			"2026-07",
			"2026-06",
		]);
		expect(older.months[0]?.incidents.map((i) => i.id)).toEqual([august.id]);
		expect(older.newer).toBe("2026-11");
		// August has the earliest incident, so the history stops there.
		expect(older.older).toBeNull();
		expect(await t.services.status.history("1775-02")).toEqual(older);

		const middle = await t.services.status.history("2026-08", 2);
		expect(middle.newer).toBe("2026-10");
		const recent = await t.services.status.history("2026-10");
		expect(recent.newer).toBe("2026-11");

		expect((await t.services.status.history("2027-01")).newer).toBeNull();
		expect((await t.services.status.history("garbage")).months[0]?.key).toBe(
			"2026-11",
		);
	});

	it("does not start the history at a deleted incident", async () => {
		t.clock.set("2026-05-05T00:00:00.000Z");
		const may = await t.services.incidents.create(EDITOR, {
			title: "May",
			message: "m",
			status: "resolved",
		});
		t.clock.set("2026-11-02T12:00:00.000Z");
		await t.services.incidents.delete(EDITOR, may.id, { reason: "Wrong" });
		const latest = await t.services.status.history();
		expect(latest.older).toBeNull();
	});

	it("has one history page when no incident started", async () => {
		t.clock.set("2026-05-05T00:00:00.000Z");
		await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "Future",
			message: "f",
			scheduledStart: "2026-12-01T00:00:00.000Z",
			scheduledEnd: "2026-12-01T01:00:00.000Z",
		});
		t.clock.set("2026-11-02T12:00:00.000Z");

		const latest = await t.services.status.history();
		expect(latest.older).toBeNull();
		expect(latest.newer).toBeNull();
		expect(await t.services.status.history("2026-05")).toEqual(latest);
	});

	it("keeps Global complete and limits a region tab", async () => {
		t.clock.set("2026-10-01T00:00:00.000Z");
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const united = await t.services.regions.create(EDITOR, {
			name: "United States",
		});
		const europe = await t.services.regions.create(EDITOR, { name: "Europe" });
		t.clock.set("2026-11-01T10:00:00.000Z");
		const regional = await t.services.incidents.create(EDITOR, {
			title: "US down",
			message: "Down",
			impact: "critical",
			serviceIds: [api.id],
			regionId: united.id,
		});
		t.clock.set("2026-11-01T11:00:00.000Z");
		await t.services.incidents.resolve(EDITOR, regional.id);
		t.clock.set("2026-11-02T12:00:00.000Z");

		const whole = await t.services.status.summary();
		expect(whole.region).toBeUndefined();
		expect(whole.services[0]?.status).toBe("operational");
		expect(whole.services[0]?.uptime).toBeLessThan(1);
		const europeView = await t.services.status.summary({ regionId: europe.id });
		expect(europeView.region?.name).toBe("Europe");
		expect(europeView.activeIncidents).toEqual([]);
		expect(europeView.services[0]?.status).toBe("operational");
		expect(europeView.services[0]?.uptime).toBe(1);
		expect(europeView.recentIncidents).toEqual([]);

		const open = await t.services.incidents.create(EDITOR, {
			title: "US open",
			message: "Still down",
			impact: "critical",
			serviceIds: [api.id],
			regionId: united.id,
		});
		const during = await t.services.status.summary();
		expect(during.services[0]?.status).toBe("major_outage");
		const hidden = await t.services.status.summary({ regionId: europe.id });
		expect(hidden.activeIncidents).toEqual([]);
		expect(hidden.services[0]?.status).toBe("operational");
		t.clock.advance(1000);
		const everywhere = await t.services.incidents.create(EDITOR, {
			title: "Everywhere",
			message: "Wide",
			impact: "major",
			serviceIds: [api.id],
		});
		const maintenance = await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "Global window",
			message: "Work",
			scheduledStart: "2026-11-21T06:00:00.000Z",
			scheduledEnd: "2026-11-22T08:00:00.000Z",
		});
		const globalView = await t.services.status.summary();
		expect(globalView.services[0]?.status).toBe("partial_outage");
		expect(globalView.activeIncidents.map((item) => item.id)).toEqual([
			everywhere.id,
			open.id,
		]);
		expect(globalView.upcomingMaintenance.map((item) => item.id)).toEqual([
			maintenance.id,
		]);
		const usView = await t.services.status.summary({ regionId: united.id });
		expect(usView.activeIncidents.map((item) => item.id)).toEqual([open.id]);
		expect(usView.upcomingMaintenance).toEqual([]);
		expect(usView.recentIncidents.map((item) => item.id)).not.toContain(
			everywhere.id,
		);
		expect(usView.services[0]?.status).toBe("major_outage");
		const euView = await t.services.status.summary({ regionId: europe.id });
		expect(euView.activeIncidents).toEqual([]);
		expect(euView.upcomingMaintenance).toEqual([]);
		expect(euView.recentIncidents).toEqual([]);
		expect(euView.services[0]?.status).toBe("operational");
		expect(euView.services[0]?.uptime).toBe(1);
		await expect(
			t.services.status.summary({ regionId: "reg_missing" }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("filters history by region and keeps the month range", async () => {
		const united = await t.services.regions.create(EDITOR, {
			name: "United States",
		});
		const europe = await t.services.regions.create(EDITOR, { name: "Europe" });
		t.clock.set("2026-10-10T00:00:00.000Z");
		const euOnly = await t.services.incidents.create(EDITOR, {
			title: "EU only",
			message: "x",
			status: "resolved",
			regionId: europe.id,
		});
		t.clock.set("2026-11-02T12:00:00.000Z");
		const usOnly = await t.services.incidents.create(EDITOR, {
			title: "US only",
			message: "x",
			status: "resolved",
			regionId: united.id,
		});
		t.clock.advance(1000);
		const global = await t.services.incidents.create(EDITOR, {
			title: "Global",
			message: "x",
			status: "resolved",
		});
		const all = await t.services.status.history();
		const us = await t.services.status.history(undefined, 3, united.id);
		expect(us.months.map((month) => month.key)).toEqual(
			all.months.map((month) => month.key),
		);
		expect(
			us.months.find((month) => month.key === "2026-10")?.incidents,
		).toEqual([]);
		expect(
			us.months
				.find((month) => month.key === "2026-11")
				?.incidents.map((item) => item.id),
		).toEqual([usOnly.id]);
		expect(
			all.months
				.find((month) => month.key === "2026-11")
				?.incidents.map((item) => item.id),
		).toEqual([global.id, usOnly.id]);
		expect(
			all.months
				.find((month) => month.key === "2026-10")
				?.incidents.map((item) => item.id),
		).toEqual([euOnly.id]);
		await expect(
			t.services.status.history(undefined, 3, "reg_missing"),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("ends a regional outage when that incident ends", async () => {
		t.clock.set("2026-10-01T00:00:00.000Z");
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const united = await t.services.regions.create(EDITOR, {
			name: "United States",
		});
		const europe = await t.services.regions.create(EDITOR, { name: "Europe" });
		t.clock.set("2026-11-02T10:00:00.000Z");
		const us = await t.services.incidents.create(EDITOR, {
			title: "US down",
			message: "Down",
			impact: "critical",
			serviceIds: [api.id],
			regionId: united.id,
		});
		t.clock.set("2026-11-02T10:30:00.000Z");
		const eu = await t.services.incidents.create(EDITOR, {
			title: "EU down",
			message: "Down",
			impact: "critical",
			serviceIds: [api.id],
			regionId: europe.id,
		});
		t.clock.set("2026-11-02T11:00:00.000Z");
		await t.services.incidents.resolve(EDITOR, us.id);
		t.clock.set("2026-11-02T12:00:00.000Z");
		await t.services.incidents.resolve(EDITOR, eu.id);

		const hour = 60 * 60 * 1000;
		const usView = await t.services.status.summary({ regionId: united.id });
		const euView = await t.services.status.summary({ regionId: europe.id });
		expect(usView.services[0]?.status).toBe("operational");
		expect(euView.services[0]?.status).toBe("operational");
		expect(
			usView.services[0]?.days.find((day) => day.date === "2026-11-02")
				?.downtimeMs,
		).toBe(hour);
		expect(
			euView.services[0]?.days.find((day) => day.date === "2026-11-02")
				?.downtimeMs,
		).toBe(hour * 1.5);
	});

	it("keeps the status a closed incident recorded", async () => {
		t.clock.set("2026-10-01T00:00:00.000Z");
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const europe = await t.services.regions.create(EDITOR, { name: "Europe" });
		t.clock.set("2026-11-02T10:00:00.000Z");
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Slow",
			message: "Errors",
			impact: "critical",
			serviceIds: [api.id],
			regionId: europe.id,
		});
		t.clock.set("2026-11-02T11:00:00.000Z");
		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			status: "resolved",
			message: "Still slow",
			serviceStatus: "degraded_performance",
		});
		const view = await t.services.status.summary({ regionId: europe.id });
		expect(view.services[0]?.status).toBe("degraded_performance");
		expect((await t.services.status.summary()).services[0]?.status).toBe(
			"degraded_performance",
		);
	});

	it("keeps an outage while another incident on the tab affects the service", async () => {
		t.clock.set("2026-10-01T00:00:00.000Z");
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const united = await t.services.regions.create(EDITOR, {
			name: "United States",
		});
		t.clock.set("2026-11-02T10:00:00.000Z");
		const us = await t.services.incidents.create(EDITOR, {
			title: "US down",
			message: "Down",
			impact: "critical",
			serviceIds: [api.id],
			regionId: united.id,
		});
		t.clock.set("2026-11-02T10:30:00.000Z");
		const wide = await t.services.incidents.create(EDITOR, {
			title: "Watching",
			message: "No impact yet",
			impact: "none",
			serviceIds: [api.id],
			regionId: united.id,
		});
		t.clock.set("2026-11-02T11:00:00.000Z");
		await t.services.incidents.resolve(EDITOR, us.id);
		const during = await t.services.status.summary({ regionId: united.id });
		expect(during.services[0]?.status).toBe("major_outage");
		expect((await t.services.status.summary()).services[0]?.status).toBe(
			"major_outage",
		);
		t.clock.set("2026-11-02T12:00:00.000Z");
		await t.services.incidents.resolve(EDITOR, wide.id);
		const after = await t.services.status.summary({ regionId: united.id });
		expect(after.services[0]?.status).toBe("operational");
	});
});
