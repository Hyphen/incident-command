import { incidentRegionIds, serviceRegionIds } from "./domain/regions";
import { OVERALL_STATUS_COPY } from "./domain/status";
import type { Incident, Region } from "./domain/types";
import type { StatusSummary } from "./services/status";

function namedRegions(
	regionIds: readonly string[],
	regions: readonly Region[],
) {
	return regions
		.filter((region) => regionIds.includes(region.id))
		.map((region) => ({ id: region.id, name: region.name }));
}

function publicIncident(
	incident: Incident,
	visible: Set<string>,
	regions: readonly Region[],
) {
	return {
		id: incident.id,
		kind: incident.kind,
		title: incident.title,
		status: incident.status,
		impact: incident.impact,
		regions: namedRegions(incidentRegionIds(incident), regions),
		services: incident.serviceIds.filter((id) => visible.has(id)),
		serviceRegions: incident.serviceIds.flatMap((id) => {
			if (!visible.has(id)) {
				return [];
			}
			const bound = namedRegions(serviceRegionIds(incident, id), regions);
			return bound.length > 0 ? [{ serviceId: id, regions: bound }] : [];
		}),
		startedAt: incident.startedAt,
		resolvedAt: incident.resolvedAt ?? null,
		scheduledStart: incident.scheduledStart ?? null,
		scheduledEnd: incident.scheduledEnd ?? null,
		updates: [...incident.updates].reverse().map((update) => ({
			id: update.id,
			title: update.title,
			impact: update.impact,
			status: update.status,
			message: update.message,
			createdAt: update.createdAt,
		})),
	};
}

/** The public JSON representation of the status page (no internal fields). */
export function buildPublicStatus(summary: StatusSummary) {
	const visible = new Set(summary.services.map((service) => service.id));
	const toPublic = (incident: Incident) =>
		publicIncident(incident, visible, summary.regions);
	return {
		page: {
			name: summary.settings.siteName,
			url: summary.settings.siteUrl ?? null,
		},
		region: summary.region
			? { id: summary.region.id, name: summary.region.name }
			: null,
		regions: summary.regions.map((region) => ({
			id: region.id,
			name: region.name,
		})),
		status: {
			indicator: summary.overall,
			description: OVERALL_STATUS_COPY[summary.overall].title,
		},
		services: summary.services.map((service) => ({
			id: service.id,
			name: service.name,
			description: service.description ?? null,
			group: service.group ?? null,
			status: service.status,
			uptime: service.uptime,
		})),
		incidents: summary.activeIncidents.map(toPublic),
		maintenance: {
			active: summary.activeMaintenance.map(toPublic),
			upcoming: summary.upcomingMaintenance.map(toPublic),
		},
		generatedAt: summary.generatedAt,
	};
}
