import { REGION_ONLY_ONE_FOR_OPEN_INCIDENT } from "@/lib/domain/regions";
import type { StoredIncident } from "@/lib/domain/types";
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "@/lib/errors";
import type { DocumentStore } from "@/lib/store/types";
import {
	createTestContext,
	EDITOR,
	type TestContext,
	VIEWER,
} from "../helpers";

describe("RegionService", () => {
	let t: TestContext;
	beforeEach(() => {
		t = createTestContext();
	});

	it("creates, lists, renames and deletes regions", async () => {
		const first = await t.services.regions.create(EDITOR, {
			name: "United States",
		});
		t.clock.advance(1000);
		const second = await t.services.regions.create(EDITOR, {
			name: "Europe",
			order: 0,
		});
		expect(first.order).toBe(0);
		expect(second.order).toBe(0);
		expect(
			(await t.services.regions.list()).map((region) => region.id),
		).toEqual([first.id, second.id]);

		const renamed = await t.services.regions.update(EDITOR, first.id, {
			name: "united states",
		});
		expect(renamed.name).toBe("united states");
		const moved = await t.services.regions.update(EDITOR, first.id, {
			order: 5,
		});
		expect(moved).toMatchObject({ name: "united states", order: 5 });
		const same = await t.services.regions.update(EDITOR, first.id, {
			name: "united states",
		});
		expect(same.order).toBe(5);
		expect(await t.services.regions.get(first.id)).toMatchObject({
			name: "united states",
		});

		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Down",
			message: "Looking",
			status: "resolved",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [first.id] }],
		});
		const legacy: StoredIncident = {
			...incident,
			id: "inc_legacy",
			revision: undefined,
			regionId: first.id,
		};
		delete legacy.serviceRegions;
		await t.store.insert("incidents", legacy);
		await t.services.regions.delete(EDITOR, first.id);
		expect(await t.services.regions.list()).toEqual([second]);
		expect(
			(await t.services.incidents.get(incident.id)).serviceRegions,
		).toBeUndefined();
		expect((await t.store.get("incidents", "inc_legacy"))?.revision).toBe(1);
		expect(
			(await t.store.get("incidents", "inc_legacy"))?.regionId,
		).toBeUndefined();
		await t.services.regions.delete(EDITOR, second.id);
		expect(await t.services.regions.list()).toEqual([]);
	});

	it("rejects a duplicate name and a missing region", async () => {
		await t.services.regions.create(EDITOR, { name: "United States" });
		await expect(
			t.services.regions.create(EDITOR, { name: "united states" }),
		).rejects.toBeInstanceOf(ValidationError);
		const other = await t.services.regions.create(EDITOR, { name: "Europe" });
		await expect(
			t.services.regions.update(EDITOR, other.id, { name: "UNITED STATES" }),
		).rejects.toThrow("A region with that name already exists");
		await expect(
			t.services.regions.create(EDITOR, { name: "" }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(t.services.regions.get("reg_missing")).rejects.toBeInstanceOf(
			NotFoundError,
		);
		await expect(
			t.services.regions.update(EDITOR, "reg_missing", { name: "Asia" }),
		).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			t.services.regions.delete(EDITOR, "reg_missing"),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	function replaceUpdate(
		change: (current: StoredIncident) => Promise<void>,
	): void {
		const update = t.store.update.bind(t.store);
		let raced = false;
		t.store.update = (async (collection, doc, options) => {
			if (!raced && collection === "incidents" && options?.where) {
				raced = true;
				const current = await t.store.get("incidents", doc.id, {
					consistent: true,
				});
				if (current) {
					await change(current);
				}
			}
			return update(collection, doc, options);
		}) as DocumentStore["update"];
	}

	it("keeps a newer incident update when a region is deleted", async () => {
		const region = await t.services.regions.create(EDITOR, { name: "Europe" });
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Down",
			message: "Looking",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [region.id] }],
		});
		replaceUpdate(async (current) => {
			await t.store.update("incidents", {
				...current,
				updates: [
					...current.updates,
					{
						id: "upd_race",
						title: current.title,
						impact: current.impact,
						status: current.status,
						message: "Posted during the delete",
						author: current.createdBy,
						createdAt: current.updatedAt,
					},
				],
				revision: (current.revision ?? 0) + 1,
			});
		});
		await t.services.regions.delete(EDITOR, region.id);
		const saved = await t.services.incidents.get(incident.id);
		expect(saved.serviceRegions).toBeUndefined();
		expect(saved.updates.map((update) => update.message)).toContain(
			"Posted during the delete",
		);
	});

	it("stops when the incident keeps changing", async () => {
		const region = await t.services.regions.create(EDITOR, { name: "Europe" });
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Down",
			message: "Looking",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [region.id] }],
		});
		const update = t.store.update.bind(t.store);
		t.store.update = (async (collection, doc, options) => {
			if (collection === "incidents" && options?.where) {
				const current = await t.store.get("incidents", doc.id, {
					consistent: true,
				});
				if (current) {
					await update("incidents", {
						...current,
						revision: (current.revision ?? 0) + 1,
					});
				}
			}
			return update(collection, doc, options);
		}) as DocumentStore["update"];
		await expect(
			t.services.regions.delete(EDITOR, region.id),
		).rejects.toBeInstanceOf(ConflictError);
		expect(await t.services.regions.list()).toEqual([region]);
		expect(
			(await t.services.incidents.get(incident.id)).serviceRegions,
		).toEqual([{ serviceId: api.id, regionIds: [region.id] }]);
	});

	it("deletes a region when the incident is already gone", async () => {
		const region = await t.services.regions.create(EDITOR, { name: "Europe" });
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Down",
			message: "Looking",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [region.id] }],
		});
		replaceUpdate(async (current) => {
			await t.store.delete("incidents", current.id);
		});
		await t.services.regions.delete(EDITOR, region.id);
		expect(await t.store.get("incidents", incident.id)).toBeUndefined();
		expect(await t.services.regions.list()).toEqual([]);
	});

	it("keeps a clear that another delete already saved", async () => {
		const region = await t.services.regions.create(EDITOR, { name: "Europe" });
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Down",
			message: "Looking",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [region.id] }],
		});
		replaceUpdate(async (current) => {
			const next: StoredIncident = {
				...current,
				updates: [
					...current.updates,
					{
						id: "upd_race",
						title: current.title,
						impact: current.impact,
						status: current.status,
						message: "Cleared first",
						author: current.createdBy,
						createdAt: current.updatedAt,
					},
				],
				revision: (current.revision ?? 0) + 1,
			};
			delete next.serviceRegions;
			await t.store.update("incidents", next);
		});
		await t.services.regions.delete(EDITOR, region.id);
		const saved = await t.services.incidents.get(incident.id);
		expect(saved.serviceRegions).toBeUndefined();
		expect(saved.updates.map((update) => update.message)).toContain(
			"Cleared first",
		);
	});

	it("keeps a region that an open incident needs, and the other regions of a service", async () => {
		const united = await t.services.regions.create(EDITOR, {
			name: "United States",
		});
		const europe = await t.services.regions.create(EDITOR, { name: "Europe" });
		const api = await t.services.catalog.create(EDITOR, { name: "API" });
		const web = await t.services.catalog.create(EDITOR, { name: "Web" });
		const incident = await t.services.incidents.create(EDITOR, {
			title: "Down",
			message: "Looking",
			serviceIds: [api.id, web.id],
			serviceRegions: [
				{ serviceId: api.id, regionIds: [united.id, europe.id] },
				{ serviceId: web.id, regionIds: [united.id] },
			],
		});
		// A member cannot edit a deleted incident, so it does not keep the region.
		const hidden = await t.services.incidents.create(EDITOR, {
			title: "Duplicate",
			message: "Looking",
			serviceIds: [web.id],
			serviceRegions: [{ serviceId: web.id, regionIds: [united.id] }],
		});
		await t.services.incidents.delete(EDITOR, hidden.id, {
			reason: "Duplicate",
		});
		await expect(
			t.services.regions.delete(EDITOR, united.id),
		).rejects.toMatchObject({ message: REGION_ONLY_ONE_FOR_OPEN_INCIDENT });
		expect(await t.services.regions.list()).toEqual([united, europe]);
		expect(
			(await t.services.incidents.get(incident.id)).serviceRegions,
		).toHaveLength(2);

		await t.services.incidents.resolve(EDITOR, incident.id, undefined, false);
		await t.services.regions.delete(EDITOR, united.id);
		expect(
			(await t.services.incidents.get(incident.id)).serviceRegions,
		).toEqual([{ serviceId: api.id, regionIds: [europe.id] }]);
	});

	it("requires the service permissions", async () => {
		const region = await t.services.regions.create(EDITOR, { name: "Europe" });
		await expect(t.services.regions.list()).resolves.toEqual([region]);
		await expect(
			t.services.regions.create(VIEWER, { name: "Asia" }),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(
			t.services.regions.update(VIEWER, region.id, { name: "Asia" }),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(
			t.services.regions.delete(VIEWER, region.id),
		).rejects.toBeInstanceOf(ForbiddenError);
	});
});
