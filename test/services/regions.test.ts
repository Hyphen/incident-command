import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
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

		const incident = await t.services.incidents.create(EDITOR, {
			title: "Down",
			message: "Looking",
			regionId: first.id,
		});
		await t.store.insert("incidents", {
			...incident,
			id: "inc_legacy",
			revision: undefined,
		});
		await t.services.regions.delete(EDITOR, first.id);
		expect(await t.services.regions.list()).toEqual([second]);
		expect(
			(await t.services.incidents.get(incident.id)).regionId,
		).toBeUndefined();
		expect((await t.store.get("incidents", "inc_legacy"))?.revision).toBe(1);
		expect(
			(await t.store.get("incidents", "inc_legacy"))?.regionId,
		).toBeUndefined();
		await t.services.regions.delete(EDITOR, second.id);
		expect(await t.services.regions.list()).toEqual([]);
	});

	it("rejects a reserved name, a duplicate name and a missing region", async () => {
		await expect(
			t.services.regions.create(EDITOR, { name: " global " }),
		).rejects.toThrow("Global is the default region. Choose another name.");
		const region = await t.services.regions.create(EDITOR, {
			name: "United States",
		});
		await expect(
			t.services.regions.create(EDITOR, { name: "united states" }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.regions.update(EDITOR, region.id, { name: "Global" }),
		).rejects.toThrow("Global is the default region. Choose another name.");
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
