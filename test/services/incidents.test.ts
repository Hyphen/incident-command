import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
	ADMIN,
	agentActor,
	createTestContext,
	EDITOR,
	type TestContext,
	VIEWER,
} from "../helpers";

describe("IncidentService", () => {
	let t: TestContext;
	let api: string;
	let web: string;

	beforeEach(async () => {
		t = createTestContext();
		api = (await t.services.catalog.create(ADMIN, { name: "API" })).id;
		web = (await t.services.catalog.create(ADMIN, { name: "Web" })).id;
		await t.services.subscribers.addWebhook(ADMIN, {
			url: "https://hooks.example.com/x",
		});
	});

	const statusOf = async (id: string) =>
		(await t.services.catalog.get(id)).status;

	it("creates an incident, sets service status and notifies", async () => {
		await t.services.subscribers.addWebhook(ADMIN, {
			url: "https://hooks.example.com/web-only",
			serviceIds: [web],
		});
		const incident = await t.services.incidents.create(EDITOR, {
			title: "API errors",
			message: "Investigating elevated errors",
			impact: "critical",
			serviceIds: [api, api],
		});
		expect(incident).toMatchObject({
			kind: "incident",
			status: "investigating",
			impact: "critical",
			serviceIds: [api],
			createdBy: { type: "member", id: EDITOR.id, name: EDITOR.name },
			startedAt: "2026-11-02T12:00:00.000Z",
		});
		expect(incident.id).toMatch(/^inc_/);
		expect(incident.updates).toHaveLength(1);
		expect(incident.updates[0]?.message).toBe("Investigating elevated errors");
		expect(incident.updates[0]?.notified).toBe(true);
		expect(await statusOf(api)).toBe("major_outage");
		expect(await statusOf(web)).toBe("operational");
		expect(t.notifier.incidents).toHaveLength(1);
		expect(t.notifier.incidents[0]?.notification.event).toBe(
			"incident.created",
		);
		expect(
			t.notifier.incidents[0]?.notification.services.map((c) => c.id),
		).toEqual([api]);
		expect(
			t.notifier.incidents[0]?.subscribers.map(
				(subscriber) => subscriber.target,
			),
		).toEqual(["https://hooks.example.com/x"]);
		// The notifier gets the delivery settings that apply at send time.
		expect(t.notifier.incidents[0]?.channels.email).toMatchObject({
			channel: "email",
			providers: [{ type: "sendgrid" }],
		});
		await expect(t.services.incidents.get(incident.id)).resolves.toEqual(
			incident,
		);
	});

	it("defaults impact to minor and respects an explicit service status", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Slow",
			message: "Slow pages",
			serviceIds: [web],
			serviceStatus: "partial_outage",
			notify: false,
		});
		expect(incident.impact).toBe("minor");
		expect(incident.updates[0]?.notified).toBe(false);
		expect(await statusOf(web)).toBe("partial_outage");
		expect(t.notifier.incidents).toHaveLength(0);
	});

	it("leaves services alone for impact none", async () => {
		await t.services.catalog.setStatus(EDITOR, web, "degraded_performance");
		await t.services.incidents.create(EDITOR, {
			title: "FYI",
			message: "Heads up",
			impact: "none",
			serviceIds: [web],
		});
		expect(await statusOf(web)).toBe("degraded_performance");
	});

	it("can be created already resolved (retroactive)", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Earlier blip",
			message: "Resolved",
			status: "resolved",
			serviceIds: [api],
		});
		expect(incident.resolvedAt).toBe("2026-11-02T12:00:00.000Z");
		expect(await statusOf(api)).toBe("operational");
	});

	it("validates status, services and permissions", async () => {
		await expect(
			t.services.incidents.create(VIEWER, { title: "x", message: "y" }),
		).rejects.toBeInstanceOf(ForbiddenError);
		const publisher = agentActor(["incidents.publish"]);
		await expect(
			t.services.incidents.create(publisher, { title: "x", message: "y" }),
		).rejects.toBeInstanceOf(ForbiddenError);
		expect(t.notifier.incidents).toHaveLength(0);
		expect(await t.store.count("incidents")).toBe(0);
		const quiet = await t.services.incidents.create(publisher, {
			title: "x",
			message: "y",
			notify: false,
		});
		expect(t.notifier.incidents).toHaveLength(0);
		expect(quiet.updates[0]?.notified).toBe(false);
		const resolved = await t.services.incidents.resolve(
			publisher,
			quiet.id,
			"Done",
			false,
		);
		expect(resolved.updates.at(-1)?.notified).toBe(false);
		expect(t.notifier.incidents).toHaveLength(0);
		await expect(
			t.services.incidents.resolve(publisher, quiet.id, "Again"),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(
			t.services.incidents.create(EDITOR, {
				title: "x",
				message: "y",
				status: "scheduled",
			}),
		).rejects.toThrow(/not valid for incident/);
		await expect(
			t.services.incidents.create(EDITOR, {
				title: "x",
				message: "y",
				serviceIds: ["nope"],
			}),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.incidents.create(EDITOR, { title: "", message: "y" }),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("posts updates and resolves, restoring services and notifying", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Down",
			message: "Down",
			impact: "major",
			serviceIds: [api],
		});
		t.clock.advance(60_000);
		const identified = await t.services.incidents.postUpdate(
			EDITOR,
			incident.id,
			{ status: "identified", message: "Found it" },
		);
		expect(identified.updates).toHaveLength(2);
		expect(identified.status).toBe("identified");
		expect(await statusOf(api)).toBe("partial_outage");

		const noted = await t.services.incidents.postUpdate(ADMIN, incident.id, {
			message: "Still working",
			serviceStatus: "degraded_performance",
		});
		expect(noted.status).toBe("identified");
		expect(await statusOf(api)).toBe("degraded_performance");

		t.clock.advance(60_000);
		const resolved = await t.services.incidents.resolve(EDITOR, incident.id);
		expect(resolved.status).toBe("resolved");
		expect(resolved.resolvedAt).toBe("2026-11-02T12:02:00.000Z");
		expect(resolved.updates.at(-1)?.message).toBe(
			"This incident has been resolved.",
		);
		expect(await statusOf(api)).toBe("operational");
		expect(t.notifier.incidents.map((n) => n.notification.event)).toEqual([
			"incident.created",
			"incident.updated",
			"incident.updated",
			"incident.resolved",
		]);

		// a post-resolution note neither re-notifies as resolved nor touches services
		await t.services.catalog.setStatus(EDITOR, api, "major_outage");
		const note = await t.services.incidents.postUpdate(EDITOR, incident.id, {
			message: "Postmortem published",
		});
		expect(note.resolvedAt).toBe("2026-11-02T12:02:00.000Z");
		expect(await statusOf(api)).toBe("major_outage");
		expect(t.notifier.incidents.at(-1)?.notification.event).toBe(
			"incident.updated",
		);

		// reopening clears resolvedAt
		const reopened = await t.services.incidents.postUpdate(
			EDITOR,
			incident.id,
			{ status: "investigating", message: "It's back" },
		);
		expect(reopened.resolvedAt).toBeUndefined();

		// resolving again with an explicit status applies it
		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			status: "resolved",
			message: "Done",
			serviceStatus: "degraded_performance",
		});
		expect(await statusOf(api)).toBe("degraded_performance");
		// explicit status on an already-closed incident is still applied
		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			message: "All clear",
			serviceStatus: "operational",
		});
		expect(await statusOf(api)).toBe("operational");
	});

	it("does not restore services still affected by another open incident", async () => {
		const first = await t.services.incidents.create(EDITOR, {
			title: "A",
			message: "A",
			impact: "critical",
			serviceIds: [api, web],
		});
		await t.services.incidents.create(EDITOR, {
			title: "B",
			message: "B",
			impact: "critical",
			serviceIds: [api],
		});
		await t.services.incidents.resolve(EDITOR, first.id, "First fixed");
		expect(await statusOf(api)).toBe("major_outage");
		expect(await statusOf(web)).toBe("operational");
	});

	it("sets the status of each affected service", async () => {
		const db = (await t.services.catalog.create(ADMIN, { name: "DB" })).id;
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Errors",
			message: "Looking",
			impact: "critical",
			serviceIds: [api, web, db],
			serviceStatuses: [{ serviceId: api, status: "partial_outage" }],
		});
		expect(await statusOf(api)).toBe("partial_outage");
		expect(await statusOf(web)).toBe("major_outage");

		// A status of one service replaces serviceStatus for that service only.
		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			message: "Better",
			serviceStatus: "degraded_performance",
			serviceStatuses: [{ serviceId: web, status: "major_outage" }],
		});
		expect(await statusOf(api)).toBe("degraded_performance");
		expect(await statusOf(web)).toBe("major_outage");
		expect(await statusOf(db)).toBe("degraded_performance");

		// A status of one service also wins over a different open incident.
		await t.services.incidents.create(EDITOR, {
			title: "Other",
			message: "Other",
			impact: "critical",
			serviceIds: [api, db],
			notify: false,
		});
		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			status: "resolved",
			message: "Fixed",
			serviceStatuses: [{ serviceId: api, status: "operational" }],
		});
		expect(await statusOf(api)).toBe("operational");
		expect(await statusOf(web)).toBe("operational");
		expect(await statusOf(db)).toBe("major_outage");

		// A note after resolution changes only the services that have a status.
		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			message: "Web is slow again",
			serviceStatuses: [{ serviceId: web, status: "degraded_performance" }],
		});
		expect(await statusOf(api)).toBe("operational");
		expect(await statusOf(web)).toBe("degraded_performance");
		expect(await statusOf(db)).toBe("major_outage");
	});

	it("accepts a service status only for an affected service", async () => {
		const notAffected = /only an affected service can have its own status/;
		await expect(
			t.services.incidents.create(EDITOR, {
				title: "x",
				message: "y",
				serviceIds: [api],
				serviceStatuses: [{ serviceId: web, status: "major_outage" }],
			}),
		).rejects.toThrow(notAffected);
		await expect(
			t.services.incidents.create(EDITOR, {
				title: "x",
				message: "y",
				serviceIds: [api],
				serviceStatuses: [
					{ serviceId: api, status: "major_outage" },
					{ serviceId: api, status: "operational" },
				],
			}),
		).rejects.toThrow("serviceStatuses: Give each service only one status");
		expect(await t.store.count("incidents")).toBe(0);

		const incident = await t.services.incidents.create(EDITOR, {
			title: "x",
			message: "y",
			serviceIds: [api],
		});
		await expect(
			t.services.incidents.postUpdate(EDITOR, incident.id, {
				message: "z",
				serviceStatuses: [{ serviceId: web, status: "major_outage" }],
			}),
		).rejects.toThrow(notAffected);
		expect((await t.services.incidents.get(incident.id)).updates).toHaveLength(
			1,
		);
		expect(await statusOf(web)).toBe("operational");
	});

	it("adds services on an update and sets their status", async () => {
		const db = (await t.services.catalog.create(ADMIN, { name: "DB" })).id;
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Errors",
			message: "Looking",
			impact: "critical",
			serviceIds: [api],
			notify: false,
		});
		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			message: "API is better",
			serviceStatuses: [{ serviceId: api, status: "degraded_performance" }],
			notify: false,
		});

		const added = await t.services.incidents.postUpdate(EDITOR, incident.id, {
			message: "Web is affected too",
			serviceIds: [api, web, web],
		});
		expect(added.serviceIds).toEqual([api, web]);
		// The existing service keeps its status. The new service follows the impact.
		expect(await statusOf(api)).toBe("degraded_performance");
		expect(await statusOf(web)).toBe("major_outage");
		expect(
			t.notifier.incidents
				.at(-1)
				?.notification.services.map((service) => service.name),
		).toEqual(["API", "Web"]);

		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			message: "DB is down",
			serviceIds: [db],
			serviceStatus: "partial_outage",
			serviceStatuses: [{ serviceId: web, status: "operational" }],
			notify: false,
		});
		expect((await t.services.incidents.get(incident.id)).serviceIds).toEqual([
			api,
			web,
			db,
		]);
		expect(await statusOf(api)).toBe("partial_outage");
		expect(await statusOf(web)).toBe("operational");
		expect(await statusOf(db)).toBe("partial_outage");

		await expect(
			t.services.incidents.postUpdate(EDITOR, incident.id, {
				message: "Missing",
				serviceIds: ["svc_missing"],
				notify: false,
			}),
		).rejects.toBeInstanceOf(NotFoundError);
		expect((await t.services.incidents.get(incident.id)).updates).toHaveLength(
			4,
		);
	});

	it("leaves a new service as it is when the update sets no status", async () => {
		const quiet = await t.services.incidents.create(EDITOR, {
			title: "Note",
			message: "Note",
			impact: "none",
			serviceIds: [api],
			notify: false,
		});
		await t.services.incidents.postUpdate(EDITOR, quiet.id, {
			message: "Web is listed",
			serviceIds: [web],
			notify: false,
		});
		expect((await t.services.incidents.get(quiet.id)).serviceIds).toEqual([
			api,
			web,
		]);
		expect(await statusOf(api)).toBe("operational");
		expect(await statusOf(web)).toBe("operational");

		const resolved = await t.services.incidents.create(EDITOR, {
			title: "Done",
			message: "Done",
			status: "resolved",
			serviceIds: [api],
			notify: false,
		});
		await t.services.catalog.setStatus(EDITOR, web, "degraded_performance");
		await t.services.incidents.postUpdate(EDITOR, resolved.id, {
			message: "Add web",
			serviceIds: [web],
			notify: false,
		});
		expect(await statusOf(web)).toBe("degraded_performance");
	});

	it("sets the status of a service added during maintenance", async () => {
		const maintenance = await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "Upgrade",
			message: "Planned",
			serviceIds: [api],
			scheduledStart: "2026-11-03T02:00:00.000Z",
			scheduledEnd: "2026-11-03T04:00:00.000Z",
			notify: false,
		});
		await t.services.incidents.postUpdate(EDITOR, maintenance.id, {
			message: "Web is included",
			serviceIds: [web],
			notify: false,
		});
		expect(await statusOf(web)).toBe("operational");

		await t.services.incidents.postUpdate(EDITOR, maintenance.id, {
			status: "in_progress",
			message: "Started",
			notify: false,
		});
		const db = (await t.services.catalog.create(ADMIN, { name: "DB" })).id;
		await t.services.incidents.postUpdate(EDITOR, maintenance.id, {
			message: "DB is included",
			serviceIds: [db],
			notify: false,
		});
		expect(await statusOf(db)).toBe("under_maintenance");
		expect(await statusOf(web)).toBe("under_maintenance");

		await t.services.incidents.postUpdate(EDITOR, maintenance.id, {
			status: "verifying",
			message: "Verifying",
			notify: false,
		});
		const extra = (await t.services.catalog.create(ADMIN, { name: "Extra" }))
			.id;
		await t.services.incidents.postUpdate(EDITOR, maintenance.id, {
			message: "Extra is included",
			serviceIds: [extra],
			notify: false,
		});
		expect(await statusOf(extra)).toBe("under_maintenance");
		expect(await statusOf(api)).toBe("under_maintenance");
	});

	it("does not restore a service that another open incident affects", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "A",
			message: "A",
			impact: "critical",
			serviceIds: [api],
			notify: false,
		});
		const other = await t.services.incidents.create(EDITOR, {
			title: "B",
			message: "B",
			impact: "major",
			serviceIds: [web],
			notify: false,
		});
		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			status: "resolved",
			message: "Fixed",
			serviceIds: [web],
			notify: false,
		});
		expect((await t.services.incidents.get(incident.id)).serviceIds).toEqual([
			api,
			web,
		]);
		expect(await statusOf(api)).toBe("operational");
		expect(await statusOf(web)).toBe("partial_outage");
		expect(other.serviceIds).toEqual([web]);
	});

	it("rejects an update that affects more than 100 services", async () => {
		const extra = await Promise.all(
			Array.from({ length: 99 }, (_, index) =>
				t.services.catalog.create(ADMIN, { name: `S${index}` }),
			),
		);
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Full",
			message: "Full",
			serviceIds: [api, ...extra.map((service) => service.id)],
			notify: false,
		});
		await expect(
			t.services.incidents.postUpdate(EDITOR, incident.id, {
				message: "One more",
				serviceIds: [web],
				notify: false,
			}),
		).rejects.toThrow("An incident can affect at most 100 services.");
		expect(
			(await t.services.incidents.get(incident.id)).serviceIds,
		).toHaveLength(100);
		const same = await t.services.incidents.postUpdate(EDITOR, incident.id, {
			message: "Already listed",
			serviceIds: [api],
			notify: false,
		});
		expect(same.serviceIds).toHaveLength(100);
	});

	it("skips services that were deleted", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "A",
			message: "A",
			impact: "critical",
			serviceIds: [api, web],
		});
		await t.services.catalog.delete(EDITOR, web);
		await t.services.incidents.resolve(EDITOR, incident.id);
		expect(await statusOf(api)).toBe("operational");
		expect(await t.services.incidents.affectedServices(incident)).toHaveLength(
			1,
		);
	});

	it("validates update status for the kind", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "A",
			message: "A",
		});
		await expect(
			t.services.incidents.postUpdate(EDITOR, incident.id, {
				status: "completed",
				message: "x",
			}),
		).rejects.toThrow(/not valid/);
		await expect(
			t.services.incidents.postUpdate(EDITOR, "inc_missing", { message: "x" }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	describe("maintenance", () => {
		const window = {
			scheduledStart: "2026-11-03T02:00:00.000Z",
			scheduledEnd: "2026-11-03T04:00:00.000Z",
		};

		it("schedules, starts and completes maintenance", async () => {
			const maintenance = await t.services.incidents.create(EDITOR, {
				kind: "maintenance",
				title: "DB upgrade",
				message: "Upgrading Postgres",
				serviceIds: [api],
				...window,
			});
			expect(maintenance).toMatchObject({
				kind: "maintenance",
				status: "scheduled",
				impact: "none",
				startedAt: window.scheduledStart,
				...window,
			});
			expect(maintenance.id).toMatch(/^mnt_/);
			expect(await statusOf(api)).toBe("operational");

			const started = await t.services.incidents.postUpdate(
				EDITOR,
				maintenance.id,
				{
					status: "in_progress",
					message: "Started",
					title: "Database upgrade",
				},
			);
			expect(started.title).toBe("Database upgrade");
			expect(started.updates[1]).toMatchObject({
				title: "Database upgrade",
				impact: "none",
			});
			expect(started.updates[0]).toMatchObject({
				title: "DB upgrade",
				impact: "none",
			});
			expect(await statusOf(api)).toBe("under_maintenance");
			await t.services.incidents.postUpdate(EDITOR, maintenance.id, {
				status: "verifying",
				message: "Verifying",
			});
			expect(await statusOf(api)).toBe("under_maintenance");
			const done = await t.services.incidents.resolve(EDITOR, maintenance.id);
			expect(done.status).toBe("completed");
			expect(done.title).toBe("Database upgrade");
			expect(done.updates.at(-1)).toMatchObject({
				title: "Database upgrade",
				impact: "none",
				message: "This maintenance has been completed.",
			});
			expect(await statusOf(api)).toBe("operational");
			expect(t.notifier.incidents.map((n) => n.notification.event)).toEqual([
				"maintenance.scheduled",
				"maintenance.updated",
				"maintenance.updated",
				"maintenance.completed",
			]);
		});

		it("requires a valid window", async () => {
			await expect(
				t.services.incidents.create(EDITOR, {
					kind: "maintenance",
					title: "x",
					message: "y",
				}),
			).rejects.toThrow(/requires scheduledStart and scheduledEnd/);
			await expect(
				t.services.incidents.create(EDITOR, {
					kind: "maintenance",
					title: "x",
					message: "y",
					scheduledStart: window.scheduledEnd,
					scheduledEnd: window.scheduledStart,
				}),
			).rejects.toThrow(/scheduledEnd must be after/);
		});

		it("edits the window", async () => {
			const maintenance = await t.services.incidents.create(EDITOR, {
				kind: "maintenance",
				title: "x",
				message: "y",
				...window,
			});
			const edited = await t.services.incidents.edit(EDITOR, maintenance.id, {
				scheduledEnd: "2026-11-03T05:00:00.000Z",
			});
			expect(edited.scheduledEnd).toBe("2026-11-03T05:00:00.000Z");
			const moved = await t.services.incidents.edit(EDITOR, maintenance.id, {
				scheduledStart: "2026-11-03T03:00:00.000Z",
			});
			expect(moved.startedAt).toBe("2026-11-03T03:00:00.000Z");
			await expect(
				t.services.incidents.edit(EDITOR, maintenance.id, {
					scheduledStart: "2026-11-04T00:00:00.000Z",
				}),
			).rejects.toThrow(/scheduledEnd must be after/);
		});
	});

	it("edits incident metadata", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "A",
			message: "A",
			serviceIds: [api],
		});
		const edited = await t.services.incidents.edit(EDITOR, incident.id, {
			serviceIds: [web],
		});
		expect(edited).toMatchObject({
			title: "A",
			impact: "minor",
			serviceIds: [web],
		});
		expect(edited.updates).toHaveLength(1);
		const untouched = await t.services.incidents.edit(EDITOR, incident.id, {});
		expect(untouched).toMatchObject({ title: "A", serviceIds: [web] });
		expect(untouched.scheduledStart).toBeUndefined();
	});

	it("records the title and the impact on each post", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "API errors",
			message: "Investigating",
			impact: "minor",
			serviceIds: [api],
			notify: false,
		});
		expect(await statusOf(api)).toBe("degraded_performance");
		const posted = await t.services.incidents.postUpdate(EDITOR, incident.id, {
			title: "API outage",
			impact: "critical",
			message: "The API is down",
			serviceIds: [web],
		});
		expect(posted).toMatchObject({ title: "API outage", impact: "critical" });
		expect(posted.updates[0]).toMatchObject({
			title: "API errors",
			impact: "minor",
		});
		expect(posted.updates[1]).toMatchObject({
			title: "API outage",
			impact: "critical",
		});
		expect(await statusOf(api)).toBe("degraded_performance");
		expect(await statusOf(web)).toBe("major_outage");
		expect(t.notifier.incidents.at(-1)?.notification.update.title).toBe(
			"API outage",
		);

		const inherited = await t.services.incidents.postUpdate(
			EDITOR,
			incident.id,
			{ message: "Still down", notify: false },
		);
		expect(inherited.updates.at(-1)).toMatchObject({
			title: "API outage",
			impact: "critical",
		});
		const resolved = await t.services.incidents.resolve(
			EDITOR,
			incident.id,
			"Fixed",
			false,
		);
		expect(resolved.updates.at(-1)).toMatchObject({
			title: "API outage",
			impact: "critical",
			status: "resolved",
		});

		await expect(
			t.services.incidents.postUpdate(EDITOR, incident.id, {
				title: "  ",
				message: "Nope",
				notify: false,
			}),
		).rejects.toBeInstanceOf(ValidationError);
		const saved = await t.services.incidents.get(incident.id);
		expect(saved.title).toBe("API outage");
		expect(saved.updates).toHaveLength(resolved.updates.length);
	});

	it("gives the title and the impact of the incident to posts that an old version stored", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Old title",
			message: "First",
			impact: "minor",
			notify: false,
		});
		const stored = await t.store.get("incidents", incident.id);
		if (!stored) {
			throw new Error("missing incident");
		}
		await t.store.update("incidents", {
			...stored,
			updates: stored.updates.map(
				({ title: _title, impact: _impact, ...update }) => update,
			),
		});
		const read = await t.services.incidents.get(incident.id);
		expect(read.updates[0]).toMatchObject({
			title: "Old title",
			impact: "minor",
		});
		const listed = (await t.services.incidents.list()).find(
			(item) => item.id === incident.id,
		);
		expect(listed?.updates[0]).toMatchObject({
			title: "Old title",
			impact: "minor",
		});
		await t.services.incidents.postUpdate(EDITOR, incident.id, {
			title: "New title",
			impact: "critical",
			message: "Second",
			notify: false,
		});
		const raw = await t.store.get("incidents", incident.id);
		expect(raw?.updates[0]).toMatchObject({
			title: "Old title",
			impact: "minor",
		});
		expect(raw?.updates[1]).toMatchObject({
			title: "New title",
			impact: "critical",
		});
		expect(raw?.title).toBe("New title");
	});

	it("lists with filters", async () => {
		const a = await t.services.incidents.create(EDITOR, {
			title: "A",
			message: "A",
		});
		t.clock.advance(1000);
		const b = await t.services.incidents.create(EDITOR, {
			title: "B",
			message: "B",
			status: "resolved",
		});
		t.clock.advance(1000);
		const m = await t.services.incidents.create(EDITOR, {
			kind: "maintenance",
			title: "M",
			message: "M",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T01:00:00.000Z",
		});
		const ids = (list: { id: string }[]) => list.map((i) => i.id);
		expect(ids(await t.services.incidents.list())).toEqual([m.id, b.id, a.id]);
		expect(ids(await t.services.incidents.list({ kind: "incident" }))).toEqual([
			b.id,
			a.id,
		]);
		expect(ids(await t.services.incidents.list({ open: true }))).toEqual([
			m.id,
			a.id,
		]);
		expect(ids(await t.services.incidents.list({ open: false }))).toEqual([
			b.id,
		]);
		expect(
			ids(await t.services.incidents.list({ since: b.createdAt })),
		).toEqual([m.id, b.id]);
		expect(
			ids(await t.services.incidents.list({ before: b.createdAt })),
		).toEqual([a.id]);
		expect(ids(await t.services.incidents.list({ limit: 1 }))).toEqual([m.id]);
		await expect(t.services.incidents.find("nope")).resolves.toBeUndefined();
		await expect(t.services.incidents.get("nope")).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});

	it("deletes incidents", async () => {
		const incident = await t.services.incidents.create(EDITOR, {
			title: "A",
			message: "A",
		});
		await t.services.incidents.delete(EDITOR, incident.id);
		await expect(
			t.services.incidents.delete(EDITOR, incident.id),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.incidents.edit(EDITOR, incident.id, {}),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("skips notifications without subscribers and survives notifier failures", async () => {
		const quiet = createTestContext();
		await quiet.services.incidents.create(EDITOR, { title: "A", message: "A" });
		expect(quiet.notifier.incidents).toHaveLength(0);

		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		t.notifier.fail = true;
		await expect(
			t.services.incidents.create(EDITOR, { title: "A", message: "A" }),
		).resolves.toBeDefined();
		expect(spy).toHaveBeenCalledWith(
			expect.stringContaining("notifier exploded"),
		);

		vi.spyOn(t.services.subscribers, "recipients").mockRejectedValueOnce(
			"odd failure",
		);
		await t.services.incidents.create(EDITOR, { title: "B", message: "B" });
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("odd failure"));
		spy.mockRestore();
	});

	it("sets regions on each affected service", async () => {
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const web = await t.services.catalog.create(EDITOR, { name: "Web" });
		const united = await t.services.regions.create(EDITOR, {
			name: "United States",
		});
		const europe = await t.services.regions.create(EDITOR, { name: "Europe" });
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Down",
			message: "Looking",
			serviceIds: [api.id, web.id],
			serviceRegions: [
				{ serviceId: api.id, regionIds: [united.id, united.id, europe.id] },
				{ serviceId: web.id, regionIds: [] },
			],
		});
		expect(incident.regionId).toBeUndefined();
		expect(incident.serviceRegions).toEqual([
			{ serviceId: api.id, regionIds: [united.id, europe.id] },
		]);
		const kept = await t.services.incidents.edit(EDITOR, incident.id, {});
		expect(kept.serviceRegions).toEqual(incident.serviceRegions);
		const cleared = await t.services.incidents.edit(EDITOR, incident.id, {
			serviceRegions: null,
		});
		expect(cleared.serviceRegions).toBeUndefined();
		const moved = await t.services.incidents.edit(EDITOR, incident.id, {
			serviceRegions: [
				{ serviceId: api.id, regionIds: [europe.id] },
				{ serviceId: web.id, regionIds: [united.id] },
			],
		});
		expect(moved.serviceRegions).toEqual([
			{ serviceId: api.id, regionIds: [europe.id] },
			{ serviceId: web.id, regionIds: [united.id] },
		]);
		const added = await t.services.incidents.postUpdate(EDITOR, incident.id, {
			message: "Web is global again",
			serviceRegions: [{ serviceId: web.id, regionIds: [] }],
			notify: false,
		});
		expect(added.serviceRegions).toEqual([
			{ serviceId: api.id, regionIds: [europe.id] },
		]);
		await expect(
			t.services.incidents.create(EDITOR, {
				title: "Missing",
				message: "x",
				serviceIds: [api.id],
				serviceRegions: [{ serviceId: api.id, regionIds: ["reg_missing"] }],
			}),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.incidents.edit(EDITOR, incident.id, {
				serviceRegions: [{ serviceId: web.id, regionIds: ["reg_missing"] }],
			}),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.incidents.create(EDITOR, {
				title: "Extra",
				message: "x",
				serviceIds: [api.id],
				serviceRegions: [{ serviceId: web.id, regionIds: [united.id] }],
			}),
		).rejects.toThrow(/serviceRegions/);
		const empty = await t.services.incidents.edit(EDITOR, incident.id, {
			serviceRegions: [],
		});
		expect(empty.serviceRegions).toBeUndefined();
		const both = await t.services.incidents.edit(EDITOR, incident.id, {
			serviceIds: [api.id, web.id],
			serviceRegions: [
				{ serviceId: api.id, regionIds: [europe.id] },
				{ serviceId: web.id, regionIds: [united.id] },
			],
		});
		expect(both.serviceRegions).toHaveLength(2);
		const onlyApi = await t.services.incidents.edit(EDITOR, incident.id, {
			serviceIds: [api.id],
		});
		expect(onlyApi.serviceIds).toEqual([api.id]);
		expect(onlyApi.serviceRegions).toEqual([
			{ serviceId: api.id, regionIds: [europe.id] },
		]);
	});
});
