import { createId } from "../crypto";
import {
	REGION_ONLY_ONE_FOR_OPEN_INCIDENT,
	serviceRegionIds,
} from "../domain/regions";
import {
	type CreateRegionInput,
	createRegionSchema,
	type UpdateRegionInput,
	updateRegionSchema,
} from "../domain/schemas";
import { isClosedStatus } from "../domain/status";
import type { Actor, Region, StoredIncident } from "../domain/types";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { iso, parse, requirePermission, type ServiceContext } from "./context";

/** Stop after five failed writes. The same limit as an incident update. */
const MAX_WRITE_ATTEMPTS = 5;

function incidentUsesRegion(
	incident: Pick<StoredIncident, "regionId" | "serviceRegions">,
	regionId: string,
): boolean {
	if (incident.regionId === regionId) {
		return true;
	}
	return (
		incident.serviceRegions?.some((entry) =>
			entry.regionIds.includes(regionId),
		) ?? false
	);
}

/** A copy that no longer uses `regionId`. Other regions stay. */
function withoutRegion(
	incident: StoredIncident,
	regionId: string,
): StoredIncident {
	const next: StoredIncident = { ...incident };
	if (next.regionId === regionId) {
		delete next.regionId;
	}
	if (!next.serviceRegions) {
		return next;
	}
	const serviceRegions = next.serviceRegions.flatMap((entry) => {
		const regionIds = entry.regionIds.filter((id) => id !== regionId);
		return regionIds.length > 0 ? [{ ...entry, regionIds }] : [];
	});
	if (serviceRegions.length > 0) {
		next.serviceRegions = serviceRegions;
	} else {
		delete next.serviceRegions;
	}
	return next;
}

export class RegionService {
	private readonly ctx: ServiceContext;

	constructor(ctx: ServiceContext) {
		this.ctx = ctx;
	}

	/** Regions in display order. */
	async list(): Promise<Region[]> {
		return this.ctx.store.find("regions", {
			sort: [{ field: "order" }, { field: "createdAt" }],
		});
	}

	async get(id: string): Promise<Region> {
		const region = await this.ctx.store.get("regions", id);
		if (!region) {
			throw new NotFoundError("Region", id);
		}
		return region;
	}

	async create(actor: Actor, input: CreateRegionInput): Promise<Region> {
		requirePermission(actor, "services.write");
		const data = parse(createRegionSchema, input);
		await this.assertName(data.name);
		const now = iso(this.ctx.now());
		const region: Region = {
			id: createId("reg"),
			name: data.name,
			order: data.order ?? (await this.ctx.store.count("regions")),
			createdAt: now,
			updatedAt: now,
		};
		return this.ctx.store.insert("regions", region);
	}

	async update(
		actor: Actor,
		id: string,
		input: UpdateRegionInput,
	): Promise<Region> {
		requirePermission(actor, "services.write");
		const patch = parse(updateRegionSchema, input);
		const current = await this.get(id);
		if (patch.name !== undefined && patch.name !== current.name) {
			await this.assertName(patch.name, id);
		}
		const next: Region = {
			...current,
			name: patch.name ?? current.name,
			order: patch.order ?? current.order,
			updatedAt: iso(this.ctx.now()),
		};
		await this.ctx.store.update("regions", next);
		return next;
	}

	/**
	 * Deletes a region.
	 * When other regions remain, an open incident must not have a service that
	 * uses only this region. That service would have no region.
	 * On a closed incident, such a service has no region after the delete.
	 * A service that also uses other regions keeps those regions.
	 */
	async delete(actor: Actor, id: string): Promise<void> {
		requirePermission(actor, "services.delete");
		await this.get(id);
		// A region can sit inside serviceRegions, so a field query cannot find it.
		const incidents = await this.ctx.store.find(
			"incidents",
			{},
			{ consistent: true },
		);
		await this.assertNoOpenOnlyRegion(id, incidents);
		for (const incident of incidents) {
			if (incidentUsesRegion(incident, id)) {
				await this.clearRegion(incident.id, id);
			}
		}
		await this.ctx.store.delete("regions", id);
	}

	private async assertName(name: string, exceptId?: string): Promise<void> {
		const regions = await this.ctx.store.find("regions");
		const taken = regions.some(
			(region) =>
				region.id !== exceptId &&
				region.name.toLowerCase() === name.toLowerCase(),
		);
		if (taken) {
			throw new ValidationError("A region with that name already exists");
		}
	}

	/**
	 * Rejects the delete when another region remains and an open incident has
	 * a service whose only known region is this one.
	 */
	private async assertNoOpenOnlyRegion(
		regionId: string,
		incidents: readonly StoredIncident[],
	): Promise<void> {
		const others = new Set(
			(await this.list())
				.map((region) => region.id)
				.filter((id) => id !== regionId),
		);
		if (others.size === 0) {
			return;
		}
		const stranded = incidents.some(
			(incident) =>
				!incident.deletedAt &&
				!isClosedStatus(incident.status) &&
				incident.serviceIds.some((serviceId) => {
					const ids = serviceRegionIds(incident, serviceId);
					return ids.includes(regionId) && !ids.some((id) => others.has(id));
				}),
		);
		if (stranded) {
			throw new ValidationError(REGION_ONLY_ONE_FOR_OPEN_INCIDENT);
		}
	}

	/**
	 * Removes the region from the latest incident. The write succeeds only
	 * when the revision still matches, and a newer save is tried again.
	 */
	private async clearRegion(id: string, regionId: string): Promise<void> {
		for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
			const current = await this.ctx.store.get("incidents", id, {
				consistent: true,
			});
			if (!current || !incidentUsesRegion(current, regionId)) {
				return;
			}
			const next = withoutRegion(current, regionId);
			next.revision = (current.revision ?? 0) + 1;
			next.updatedAt = iso(this.ctx.now());
			const saved = await this.ctx.store.update("incidents", next, {
				where: [
					{ field: "revision", op: "eq", value: current.revision ?? null },
				],
			});
			if (saved) {
				return;
			}
		}
		throw new ConflictError(
			"The incident is being changed by someone else. Please try again.",
		);
	}
}
