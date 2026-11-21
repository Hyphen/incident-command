import { impactToStatus, isClosedStatus, worstStatus } from "./status";
import type {
	Incident,
	Region,
	Service,
	ServiceRegions,
	ServiceStatus,
	ServiceStatusChange,
} from "./types";

/** The name of the default region. It is not a stored region. */
export const GLOBAL_REGION_NAME = "Global";

/** The public status tab that lists every outage. */
export const STATUS_OVERVIEW_LABEL = "Overview";

type RegionalIncident = Pick<
	Incident,
	"serviceIds" | "serviceRegions" | "regionId"
>;

/** Regions stored for one service. An empty list means Global. */
export function serviceRegionIds(
	incident: RegionalIncident,
	serviceId: string,
): readonly string[] {
	if (incident.serviceRegions) {
		return (
			incident.serviceRegions.find((entry) => entry.serviceId === serviceId)
				?.regionIds ?? []
		);
	}
	return incident.regionId ? [incident.regionId] : [];
}

/**
 * The regions to store for the affected services.
 * An old incident with only `regionId` uses that region for every service.
 */
export function boundServiceRegions(
	incident: RegionalIncident,
): ServiceRegions[] {
	if (incident.serviceRegions) {
		return incident.serviceRegions.flatMap((entry) => {
			if (
				!incident.serviceIds.includes(entry.serviceId) ||
				entry.regionIds.length === 0
			) {
				return [];
			}
			return [
				{
					serviceId: entry.serviceId,
					regionIds: [...new Set(entry.regionIds)],
				},
			];
		});
	}
	if (!incident.regionId) {
		return [];
	}
	return incident.serviceIds.map((serviceId) => ({
		serviceId,
		regionIds: [incident.regionId as string],
	}));
}

/** Named regions that this incident affects, in first-seen order. */
export function incidentRegionIds(incident: RegionalIncident): string[] {
	const ids: string[] = [];
	const add = (id: string) => {
		if (!ids.includes(id)) {
			ids.push(id);
		}
	};
	if (incident.serviceRegions) {
		for (const serviceId of incident.serviceIds) {
			for (const id of serviceRegionIds(incident, serviceId)) {
				add(id);
			}
		}
		return ids;
	}
	if (incident.regionId) {
		add(incident.regionId);
	}
	return ids;
}

/**
 * True when at least one affected service is Global.
 * An incident with no services is Global when it has no region.
 */
function affectsEveryRegion(incident: RegionalIncident): boolean {
	if (incident.serviceRegions) {
		return incident.serviceIds.some(
			(serviceId) => serviceRegionIds(incident, serviceId).length === 0,
		);
	}
	return incident.regionId === undefined;
}

/**
 * True when this service lists this region.
 * A Global service is not down on a region tab.
 */
export function serviceOnRegion(
	incident: RegionalIncident,
	serviceId: string,
	regionId: string,
): boolean {
	if (!incident.serviceIds.includes(serviceId)) {
		return false;
	}
	return serviceRegionIds(incident, serviceId).includes(regionId);
}

/**
 * True when the incident belongs on this region tab.
 * A service must list the region. A Global service does not.
 * An old incident belongs only when its `regionId` matches.
 */
export function incidentOnRegion(
	incident: RegionalIncident,
	regionId: string,
): boolean {
	if (incident.serviceRegions) {
		return incident.serviceIds.some((serviceId) =>
			serviceOnRegion(incident, serviceId, regionId),
		);
	}
	return incident.regionId === regionId;
}

/**
 * True when a status change from this incident counts on the region tab.
 * A Global service does not count. An old incident counts only in its region.
 * A service that left the incident still counts when its region entry remains.
 */
function countsOnRegion(
	incident: RegionalIncident,
	serviceId: string,
	regionId: string,
): boolean {
	if (incident.serviceRegions) {
		const entry = incident.serviceRegions.find(
			(item) => item.serviceId === serviceId,
		);
		return entry?.regionIds.includes(regionId) ?? false;
	}
	return incident.regionId === regionId;
}

/**
 * The label of the incident regions. Returns nothing when no region exists,
 * so a page with no regions stays unchanged.
 * Several regions use the order of `regions`.
 */
export function regionNameFor(
	incident: RegionalIncident,
	regions: readonly Pick<Region, "id" | "name">[],
): string | undefined {
	if (regions.length === 0) {
		return undefined;
	}
	const names = regions
		.filter((region) => incidentRegionIds(incident).includes(region.id))
		.map((region) => region.name);
	if (names.length === 0) {
		return GLOBAL_REGION_NAME;
	}
	if (affectsEveryRegion(incident)) {
		return [GLOBAL_REGION_NAME, ...names].join(", ");
	}
	return names.join(", ");
}

/**
 * The status page to open from an incident.
 * One region opens that tab. Global, or more than one region, opens Global.
 */
export function regionTabPath(
	incident: RegionalIncident,
	regions: readonly Pick<Region, "id">[],
): string {
	if (affectsEveryRegion(incident)) {
		return "/";
	}
	const known = regions.filter((region) =>
		incidentRegionIds(incident).includes(region.id),
	);
	if (known.length === 1) {
		return `/?region=${known[0]?.id}`;
	}
	return "/";
}

function byTime(a: ServiceStatusChange, b: ServiceStatusChange): number {
	return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * One status chain, or nothing when more than one order is possible.
 * A branch, a fork, or a leftover change is not one chain.
 */
function unambiguousChain(
	group: readonly ServiceStatusChange[],
): ServiceStatusChange[] | undefined {
	const remaining = group.slice();
	const produced = new Set(remaining.map((change) => change.status));
	let pending = remaining.filter(
		(change) => !produced.has(change.previousStatus),
	);
	if (pending.length !== 1) {
		return undefined;
	}
	const ordered: ServiceStatusChange[] = [];
	while (pending.length === 1) {
		const current = pending[0] as ServiceStatusChange;
		ordered.push(current);
		remaining.splice(remaining.indexOf(current), 1);
		pending = remaining.filter(
			(change) => change.previousStatus === current.status,
		);
	}
	return remaining.length === 0 ? ordered : undefined;
}

/**
 * Orders changes that share one time.
 * One chain follows the status links. Any other group stays in write order.
 */
function chainSameTime(
	group: readonly ServiceStatusChange[],
): ServiceStatusChange[] {
	const written = group.slice().sort(byTime);
	return unambiguousChain(written) ?? written;
}

/** Orders the changes of one service. The same time follows the status chain. */
function orderChanges(
	changes: readonly ServiceStatusChange[],
): ServiceStatusChange[] {
	const byStamp = new Map<string, ServiceStatusChange[]>();
	for (const change of changes) {
		const list = byStamp.get(change.createdAt);
		if (list) {
			list.push(change);
		} else {
			byStamp.set(change.createdAt, [change]);
		}
	}
	const ordered: ServiceStatusChange[] = [];
	for (const [, group] of [...byStamp.entries()].sort((left, right) =>
		left[0].localeCompare(right[0]),
	)) {
		ordered.push(...chainSameTime(group));
	}
	return ordered;
}

/** The status an open incident implies when it did not record a change. */
function impliedEffect(incident: Incident): ServiceStatus | undefined {
	if (incident.kind === "maintenance") {
		return incident.status === "in_progress" ? "under_maintenance" : undefined;
	}
	if (incident.impact === "none") {
		return undefined;
	}
	return impactToStatus(incident.impact);
}

function at(value: string): number {
	return Date.parse(value);
}

/** An incident affects a service at `when` when that time is inside its window. */
function openAt(incident: Incident, when: number): boolean {
	if (incident.status === "scheduled") {
		return false;
	}
	if (isClosedStatus(incident.status) && !incident.resolvedAt) {
		return false;
	}
	if (at(incident.startedAt) > when) {
		return false;
	}
	return !(incident.resolvedAt && at(incident.resolvedAt) <= when);
}

/**
 * Another incident on this tab still affects the service, so a skipped
 * recovery must not clear the earlier outage.
 */
function heldByOther(
	incidents: readonly Incident[],
	regionId: string,
	serviceId: string,
	exceptId: string,
	resolvedAt: number,
	when: number,
): boolean {
	return incidents.some(
		(incident) =>
			incident.id !== exceptId &&
			serviceOnRegion(incident, serviceId, regionId) &&
			at(incident.startedAt) <= resolvedAt &&
			openAt(incident, when),
	);
}

/**
 * The status recorded for one service at one time.
 * A manual change stays. A change from another region does not count.
 * A change from before an incident closed counts only while another
 * incident on this tab still affects the service.
 * A status recorded when the incident closed stays.
 */
function replay(
	serviceId: string,
	initial: ServiceStatus,
	changes: readonly ServiceStatusChange[],
	incidents: readonly Incident[],
	regionId: string,
	when: number,
): ServiceStatus {
	const byId = new Map(incidents.map((incident) => [incident.id, incident]));
	let status = initial;
	const seen = new Set<string>();
	for (const change of changes) {
		if (at(change.createdAt) > when) {
			break;
		}
		if (!change.incidentId) {
			status = change.status;
			continue;
		}
		const incident = byId.get(change.incidentId);
		if (!incident || !countsOnRegion(incident, serviceId, regionId)) {
			continue;
		}
		const resolved = incident.resolvedAt ? at(incident.resolvedAt) : undefined;
		if (
			resolved !== undefined &&
			resolved <= when &&
			at(change.createdAt) < resolved &&
			!heldByOther(incidents, regionId, serviceId, incident.id, resolved, when)
		) {
			continue;
		}
		seen.add(incident.id);
		status = change.status;
	}
	for (const incident of incidents) {
		if (
			!openAt(incident, when) ||
			!serviceOnRegion(incident, serviceId, regionId) ||
			seen.has(incident.id)
		) {
			continue;
		}
		const effect = impliedEffect(incident);
		if (effect) {
			status = worstStatus([status, effect]);
		}
	}
	return status;
}

/**
 * The status of a service on one region tab.
 * A manual status stays. An incident in another region does not count.
 * A Global incident does not count.
 * A closed incident keeps a status that its close recorded.
 */
export function serviceStatusOnRegion(
	service: Service,
	changes: readonly ServiceStatusChange[],
	incidents: readonly Incident[],
	regionId: string,
): ServiceStatus {
	const mine = orderChanges(
		changes.filter((change) => change.serviceId === service.id),
	);
	const initial = mine[0]?.previousStatus ?? service.status;
	return replay(
		service.id,
		initial,
		mine,
		incidents,
		regionId,
		Number.POSITIVE_INFINITY,
	);
}

/**
 * Status changes as one region sees them. Uptime for a region uses this list.
 * An outage in another region does not count. A Global outage does not count.
 * An outage ends when its incident ends, unless another incident on this tab
 * still affects the service.
 */
export function changesOnRegion(
	changes: readonly ServiceStatusChange[],
	incidents: readonly Incident[],
	regionId: string,
): ServiceStatusChange[] {
	const byService = new Map<string, ServiceStatusChange[]>();
	for (const change of changes) {
		const list = byService.get(change.serviceId);
		if (list) {
			list.push(change);
		} else {
			byService.set(change.serviceId, [change]);
		}
	}
	const result: ServiceStatusChange[] = [];
	for (const [serviceId, mine] of byService) {
		const sorted = orderChanges(mine);
		const initial = (sorted[0] as ServiceStatusChange).previousStatus;
		const times = new Set<number>();
		for (const change of sorted) {
			times.add(at(change.createdAt));
		}
		for (const incident of incidents) {
			if (!countsOnRegion(incident, serviceId, regionId)) {
				continue;
			}
			const affects =
				incident.serviceIds.includes(serviceId) ||
				sorted.some((change) => change.incidentId === incident.id);
			if (!affects) {
				continue;
			}
			times.add(at(incident.startedAt));
			if (incident.resolvedAt) {
				times.add(at(incident.resolvedAt));
			}
		}
		const ordered = [...times].sort((a, b) => a - b);
		let status = initial;
		let emitted = false;
		let index = 0;
		for (const when of ordered) {
			const next = replay(
				serviceId,
				initial,
				sorted,
				incidents,
				regionId,
				when,
			);
			if (!emitted || next !== status) {
				result.push({
					id: `ssc_region_${serviceId}_${index}`,
					serviceId,
					status: next,
					previousStatus: emitted ? status : initial,
					createdAt: new Date(when).toISOString(),
				});
				status = next;
				emitted = true;
				index += 1;
			}
		}
	}
	return result;
}
