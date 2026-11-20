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

/** True when this service is down on the region tab. */
export function serviceOnRegion(
	incident: RegionalIncident,
	serviceId: string,
	regionId: string,
): boolean {
	if (!incident.serviceIds.includes(serviceId)) {
		return false;
	}
	const ids = serviceRegionIds(incident, serviceId);
	return ids.length === 0 || ids.includes(regionId);
}

/**
 * True when the incident belongs on this region tab.
 * A Global service puts the incident on every tab.
 * An old incident with no `serviceRegions` uses its single region.
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
	return incident.regionId === undefined || incident.regionId === regionId;
}

/**
 * True when a status change from this incident counts on the region tab.
 * An old incident counts for every service. A new incident counts only
 * for a service that lists the region, or for a Global service.
 */
function countsOnRegion(
	incident: RegionalIncident,
	serviceId: string,
	regionId: string,
): boolean {
	if (incident.serviceRegions) {
		return serviceOnRegion(incident, serviceId, regionId);
	}
	return incident.regionId === undefined || incident.regionId === regionId;
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
 * A global incident counts on every region tab.
 * A closed incident keeps a status that its close recorded.
 */
export function serviceStatusOnRegion(
	service: Service,
	changes: readonly ServiceStatusChange[],
	incidents: readonly Incident[],
	regionId: string,
): ServiceStatus {
	const mine = changes
		.filter((change) => change.serviceId === service.id)
		.sort(byTime);
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
 * An outage in another region does not count. An outage ends when its
 * incident ends, unless another incident on this tab still affects the service.
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
		const earliest = mine.reduce((best, change) =>
			byTime(change, best) < 0 ? change : best,
		);
		const initial = earliest.previousStatus;
		const sorted = mine.slice().sort(byTime);
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
