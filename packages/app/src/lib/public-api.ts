import { z } from "zod";
import { incidentRegionIds, serviceRegionIds } from "./domain/regions";
import {
	eventStatusSchema,
	impactSchema,
	kindSchema,
	serviceStatusSchema,
} from "./domain/schemas";
import { OVERALL_STATUS_COPY } from "./domain/status";
import type { Incident, Region } from "./domain/types";
import type { StatusSummary } from "./services/status";

const timestamp = z.string().describe("An ISO 8601 time in UTC.");

export const regionRefSchema = z
	.object({ id: z.string(), name: z.string() })
	.describe("A named region.");

export const publicUpdateSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		impact: impactSchema,
		status: eventStatusSchema,
		message: z.string(),
		createdAt: timestamp,
	})
	.describe("One post on an incident.");

export const publicIncidentSchema = z
	.object({
		id: z.string(),
		kind: kindSchema,
		title: z.string().describe("The title of the latest post."),
		status: eventStatusSchema,
		impact: impactSchema.describe("The impact of the latest post."),
		regions: z
			.array(regionRefSchema)
			.describe(
				"The regions of the incident. The list is empty when the page has no regions.",
			),
		services: z
			.array(z.string())
			.describe("The ids of the affected services that the page shows."),
		serviceRegions: z
			.array(
				z.object({ serviceId: z.string(), regions: z.array(regionRefSchema) }),
			)
			.describe(
				"The regions of each affected service. A service that is not in the list has no region.",
			),
		startedAt: timestamp,
		resolvedAt: timestamp.nullable(),
		scheduledStart: timestamp
			.nullable()
			.describe("The start of the maintenance window."),
		scheduledEnd: timestamp
			.nullable()
			.describe("The end of the maintenance window."),
		updates: z
			.array(publicUpdateSchema)
			.describe("The posts, the newest first."),
	})
	.describe("An incident or a maintenance.");

/** The public JSON representation of the status page (`GET /api/v1/status`). */
export const publicStatusSchema = z
	.object({
		page: z.object({
			name: z.string(),
			url: z.string().nullable().describe("The Public URL setting."),
		}),
		region: regionRefSchema
			.nullable()
			.describe("The region of the response, or null for the Overview."),
		regions: z.array(regionRefSchema),
		status: z.object({
			indicator: serviceStatusSchema.describe(
				"The worst status of the services on this view. An incident impact does not make it worse.",
			),
			description: z.string(),
		}),
		services: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				description: z.string().nullable(),
				group: z.string().nullable(),
				status: serviceStatusSchema,
				uptime: z
					.number()
					.nullable()
					.describe(
						"Uptime over the full window, from 0 to 1, or null when the service has no data. Time before the service existed is not downtime.",
					),
			}),
		),
		incidents: z
			.array(publicIncidentSchema)
			.describe("The incidents that are not resolved."),
		maintenance: z.object({
			active: z.array(publicIncidentSchema),
			upcoming: z.array(publicIncidentSchema),
		}),
		generatedAt: timestamp,
	})
	.describe("The status page in JSON.");

export type PublicStatus = z.infer<typeof publicStatusSchema>;

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
): z.infer<typeof publicIncidentSchema> {
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
export function buildPublicStatus(summary: StatusSummary): PublicStatus {
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
