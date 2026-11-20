import { impactToStatus, isClosedStatus, worstStatus } from "./status";
import type {
	Incident,
	Region,
	Service,
	ServiceStatus,
	ServiceStatusChange,
} from "./types";

/** The name of the default region. It is not a stored region. */
export const GLOBAL_REGION_NAME = "Global";

/** An incident in this region. A Global incident is not in a region. */
export function incidentOnRegion(
	incident: Pick<Incident, "regionId">,
	regionId: string,
): boolean {
	return incident.regionId === regionId;
}

/**
 * The label of the incident region. Returns nothing when no region exists,
 * so a page with no regions stays unchanged.
 */
export function regionNameFor(
	incident: Pick<Incident, "regionId">,
	regions: readonly Pick<Region, "id" | "name">[],
): string | undefined {
	if (regions.length === 0) {
		return undefined;
	}
	if (!incident.regionId) {
		return GLOBAL_REGION_NAME;
	}
	return (
		regions.find((region) => region.id === incident.regionId)?.name ??
		GLOBAL_REGION_NAME
	);
}

function byTime(a: ServiceStatusChange, b: ServiceStatusChange): number {
	return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * Orders changes that share one time. The order follows the status chain.
 * An id can sort first when that change is not the first change.
 */
function chainSameTime(
	group: readonly ServiceStatusChange[],
): ServiceStatusChange[] {
	const remaining = group.slice().sort(byTime);
	const ordered: ServiceStatusChange[] = [];
	let previous: ServiceStatus | undefined;
	while (remaining.length > 0) {
		const produced = new Set(remaining.map((change) => change.status));
		const index =
			previous === undefined
				? remaining.findIndex((change) => !produced.has(change.previousStatus))
				: remaining.findIndex((change) => change.previousStatus === previous);
		const next = remaining.splice(
			index === -1 ? 0 : index,
			1,
		)[0] as ServiceStatusChange;
		ordered.push(next);
		previous = next.status;
	}
	return ordered;
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
			incidentOnRegion(incident, regionId) &&
			incident.serviceIds.includes(serviceId) &&
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
		if (!incident || !incidentOnRegion(incident, regionId)) {
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
			!incidentOnRegion(incident, regionId) ||
			seen.has(incident.id) ||
			!incident.serviceIds.includes(serviceId)
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
			if (!incidentOnRegion(incident, regionId)) {
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
