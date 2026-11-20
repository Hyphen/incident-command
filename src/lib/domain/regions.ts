import { impactToStatus, worstStatus } from "./status";
import type {
	Incident,
	Region,
	Service,
	ServiceStatus,
	ServiceStatusChange,
} from "./types";

/** The name of the default region. It is not a stored region. */
export const GLOBAL_REGION_NAME = "Global";

/** An incident with no region, or an incident in this region. */
export function incidentOnRegion(
	incident: Pick<Incident, "regionId">,
	regionId: string,
): boolean {
	return incident.regionId === undefined || incident.regionId === regionId;
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

/** The status an open incident implies when it did not record a change. */
function impliedEffect(incident: Incident): ServiceStatus | undefined {
	if (incident.status === "scheduled") {
		return undefined;
	}
	if (incident.kind === "maintenance") {
		return incident.status === "in_progress" ? "under_maintenance" : undefined;
	}
	if (incident.impact === "none") {
		return undefined;
	}
	return impactToStatus(incident.impact);
}

/**
 * The status of a service on one region tab.
 * A manual status stays. An open incident in another region does not count.
 * A global incident counts on every region tab.
 */
export function serviceStatusOnRegion(
	service: Service,
	changes: readonly ServiceStatusChange[],
	openIncidents: readonly Incident[],
	regionId: string,
): ServiceStatus {
	const here = new Set(
		openIncidents
			.filter((incident) => incidentOnRegion(incident, regionId))
			.map((incident) => incident.id),
	);
	const mine = changes
		.filter((change) => change.serviceId === service.id)
		.sort(byTime);
	let status = mine[0]?.previousStatus ?? service.status;
	const seen = new Set<string>();
	for (const change of mine) {
		if (!change.incidentId) {
			status = change.status;
			continue;
		}
		seen.add(change.incidentId);
		if (!here.has(change.incidentId)) {
			continue;
		}
		status = change.status;
	}
	for (const incident of openIncidents) {
		if (
			!here.has(incident.id) ||
			seen.has(incident.id) ||
			!incident.serviceIds.includes(service.id)
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
