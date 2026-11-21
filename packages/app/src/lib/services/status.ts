import { type ResolutionStats, resolutionStats } from "../domain/metrics";
import {
	changesOnRegion,
	incidentOnRegion,
	serviceOnRegion,
	serviceStatusOnRegion,
} from "../domain/regions";
import { impactToStatus, worstStatus } from "../domain/status";
import type {
	Incident,
	Region,
	Service,
	ServiceStatus,
	Settings,
} from "../domain/types";
import {
	combineUptime,
	computeUptime,
	DAY_MS,
	type DayStatus,
	minuteTimeline,
	periodUptime,
	type StatusPeriod,
	timelineWindow,
	type UptimeResult,
	type UptimeWindow,
	uptimePeriods,
	uptimeWindow,
} from "../domain/uptime";
import { NotFoundError } from "../errors";
import type { ServiceCatalog } from "./catalog";
import type { ServiceContext } from "./context";
import { type IncidentService, NOT_DELETED } from "./incidents";
import type { RegionService } from "./regions";
import type { SettingsService } from "./settings";

export const RECENT_DAYS = 14;
/** The length of the period of the incident metrics on the portal overview. */
export const METRICS_DAYS = 30;

export interface ServiceView extends Service {
	uptime: number | null;
	days: DayStatus[];
}

export interface ServiceGroupView {
	name: string | null;
	status: ServiceStatus;
	services: ServiceView[];
}

export interface StatusSummary {
	settings: Settings;
	overall: ServiceStatus;
	groups: ServiceGroupView[];
	services: ServiceView[];
	activeIncidents: Incident[];
	activeMaintenance: Incident[];
	upcomingMaintenance: Incident[];
	recentIncidents: Incident[];
	/** Named regions. Empty when the page has no region tabs. */
	regions: Region[];
	/** Set when this summary is one region. Absent means the Overview tab. */
	region?: Region;
	/** The combined uptime of the visible services across the window. */
	uptime: UptimeResult;
	window: UptimeWindow;
	generatedAt: string;
}

export interface UptimePeriod {
	days: number;
	uptime: number | null;
}

export interface ServiceUptimeView {
	service: ServiceView;
	/** The uptime of the service for each period, shortest first. */
	periods: UptimePeriod[];
}

export interface IncidentMetrics extends ResolutionStats {
	/** The length of the period in days. */
	days: number;
	/** The incidents that were created in the period, newest first. */
	incidents: Incident[];
	/** The number of incidents that were created in the period before. */
	previousCount: number;
}

/** The read model of the portal overview. */
export interface StatusOverview {
	summary: StatusSummary;
	/** The combined uptime of the visible services for each period, shortest first. */
	periods: UptimePeriod[];
	services: ServiceUptimeView[];
	metrics: IncidentMetrics;
}

/** The status of one service for each minute of the timeline window. */
export interface ServiceTimeline {
	service: Service;
	/** The periods of the window, oldest first. */
	periods: StatusPeriod[];
}

/** The status of the affected services before, during and after an incident. */
export interface IncidentTimeline {
	/** The start of the window: 2 hours before the incident started. */
	start: string;
	/** The end of the window: 2 hours after the incident closed, or now. */
	end: string;
	/** `true` when the window ends now. */
	untilNow: boolean;
	services: ServiceTimeline[];
}

export interface HistoryMonth {
	/** `YYYY-MM` */
	key: string;
	incidents: Incident[];
}

export interface HistoryPage {
	months: HistoryMonth[];
	/** Key of the page with older months, or `null` for the earliest page. */
	older: string | null;
	/** Key of the page with newer months, or `null` for the latest page. */
	newer: string | null;
}

function monthKey(date: Date): string {
	return date.toISOString().slice(0, 7);
}

function addMonths(key: string, delta: number): string {
	const [year, month] = key.split("-").map(Number) as [number, number];
	return monthKey(new Date(Date.UTC(year, month - 1 + delta, 1)));
}

function monthStart(key: string): string {
	return `${key}-01T00:00:00.000Z`;
}

/** Builds the read models the public status page and API render. */
export class StatusService {
	private readonly ctx: ServiceContext;
	private readonly settings: SettingsService;
	private readonly catalog: ServiceCatalog;
	private readonly incidents: IncidentService;
	private readonly regions: RegionService;

	constructor(
		ctx: ServiceContext,
		settings: SettingsService,
		catalog: ServiceCatalog,
		incidents: IncidentService,
		regions: RegionService,
	) {
		this.ctx = ctx;
		this.settings = settings;
		this.catalog = catalog;
		this.incidents = incidents;
		this.regions = regions;
	}

	async summary(options: { regionId?: string } = {}): Promise<StatusSummary> {
		const regions = await this.regions.list();
		const region = options.regionId
			? regions.find((item) => item.id === options.regionId)
			: undefined;
		if (options.regionId && !region) {
			throw new NotFoundError("Region", options.regionId);
		}
		const settings = await this.settings.get();
		const now = this.ctx.now();
		const window = uptimeWindow(now, settings.uptimeDays);
		const since = new Date(
			Math.min(window.start.getTime(), now.getTime() - RECENT_DAYS * DAY_MS),
		).toISOString();
		const onTab = (incident: Incident) =>
			!region || incidentOnRegion(incident, region.id);
		const [services, changes, open, recent, regionIncidents] =
			await Promise.all([
				this.catalog.list({ includeHidden: false }),
				this.ctx.store.find(
					"service_status_changes",
					region
						? { sort: [{ field: "createdAt" }] }
						: {
								where: [
									{
										field: "createdAt",
										op: "gte",
										value: window.start.toISOString(),
									},
								],
								sort: [{ field: "createdAt" }],
							},
				),
				this.incidents.list({ open: true }),
				this.incidents.list({ since }),
				region ? this.incidents.list() : Promise.resolve(undefined),
			]);
		const byId = new Map<string, Incident>();
		for (const incident of [...open, ...recent]) {
			byId.set(incident.id, incident);
		}
		const relevant = [...byId.values()].filter(onTab);
		const viewOpen = open.filter(onTab);

		const viewChanges =
			region && regionIncidents
				? changesOnRegion(changes, regionIncidents, region.id)
				: changes;
		const views: ServiceView[] = services.map((service) => ({
			...service,
			...computeUptime(
				service,
				viewChanges,
				region
					? relevant.filter((incident) =>
							serviceOnRegion(incident, service.id, region.id),
						)
					: relevant,
				window,
			),
			...(region && regionIncidents
				? {
						status: serviceStatusOnRegion(
							service,
							changes,
							regionIncidents,
							region.id,
						),
					}
				: {}),
		}));

		const groups: ServiceGroupView[] = [];
		for (const view of views) {
			const name = view.group ?? null;
			let group = groups.find((candidate) => candidate.name === name);
			if (!group) {
				group = { name, status: "operational", services: [] };
				groups.push(group);
			}
			group.services.push(view);
			group.status = worstStatus(group.services.map((c) => c.status));
		}

		const activeIncidents = viewOpen.filter(
			(incident) => incident.kind === "incident",
		);
		const activeMaintenance = viewOpen.filter(
			(incident) =>
				incident.kind === "maintenance" && incident.status !== "scheduled",
		);
		const upcomingMaintenance = viewOpen
			.filter(
				(incident) =>
					incident.kind === "maintenance" && incident.status === "scheduled",
			)
			.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
		const recentCutoff = new Date(
			now.getTime() - RECENT_DAYS * DAY_MS,
		).toISOString();
		const recentIncidents = recent.filter(
			(incident) =>
				incident.createdAt >= recentCutoff &&
				incident.status !== "scheduled" &&
				onTab(incident),
		);

		const overall = worstStatus([
			...views.map((view) => view.status),
			...activeIncidents.map((incident) => impactToStatus(incident.impact)),
			...activeMaintenance.map((): ServiceStatus => "under_maintenance"),
		]);

		return {
			settings,
			overall,
			groups,
			services: views,
			activeIncidents,
			activeMaintenance,
			upcomingMaintenance,
			recentIncidents,
			regions,
			...(region ? { region } : {}),
			uptime: combineUptime(views, relevant, window),
			window,
			generatedAt: now.toISOString(),
		};
	}

	/**
	 * The status summary with the uptime of each period and the incident
	 * metrics of the last `METRICS_DAYS` days.
	 */
	async overview(): Promise<StatusOverview> {
		const now = this.ctx.now().getTime();
		const cutoff = new Date(now - METRICS_DAYS * DAY_MS).toISOString();
		const [summary, incidents] = await Promise.all([
			this.summary(),
			this.incidents.list({
				kind: "incident",
				since: new Date(now - 2 * METRICS_DAYS * DAY_MS).toISOString(),
			}),
		]);
		const lengths = uptimePeriods(summary.window.days);
		const periods = (days: readonly DayStatus[]): UptimePeriod[] =>
			lengths.map((length) => ({
				days: length,
				uptime: periodUptime(days, length),
			}));
		const current = incidents.filter(
			(incident) => incident.createdAt >= cutoff,
		);
		return {
			summary,
			periods: periods(summary.uptime.days),
			services: summary.services.map((service) => ({
				service,
				periods: periods(service.days),
			})),
			metrics: {
				days: METRICS_DAYS,
				incidents: current,
				previousCount: incidents.length - current.length,
				...resolutionStats(current),
			},
		};
	}

	/**
	 * The status for each minute of the incident, for each visible service that
	 * the incident affects. The window also shows 2 hours before the incident
	 * started and 2 hours after it closed. The window does not continue after
	 * now. The result has no services when the maintenance did not start.
	 */
	async incidentTimeline(incident: Incident): Promise<IncidentTimeline> {
		const now = this.ctx.now();
		const window = timelineWindow(incident, now);
		const timeline: IncidentTimeline = {
			start: window.start.toISOString(),
			end: window.end.toISOString(),
			untilNow: window.end.getTime() === now.getTime(),
			services: [],
		};
		if (incident.status === "scheduled") {
			return timeline;
		}
		const [services, changes] = await Promise.all([
			this.catalog.list({ includeHidden: false }),
			this.ctx.store.find("service_status_changes", {
				where: [{ field: "createdAt", op: "gte", value: timeline.start }],
				sort: [{ field: "createdAt" }],
			}),
		]);
		timeline.services = services
			.filter((service) => incident.serviceIds.includes(service.id))
			.map((service) => ({
				service,
				periods: minuteTimeline(service, changes, window),
			}));
		return timeline;
	}

	/**
	 * Incident history paginated by month. `month` (`YYYY-MM`) is the newest
	 * month on the page; defaults to the current month.
	 *
	 * The history starts at the month of the earliest incident. A page does not
	 * start before that month, and the earliest page has no older page. Thus a
	 * crawler that follows the "older" links comes to an end.
	 */
	async history(
		month?: string,
		months = 3,
		regionId?: string,
	): Promise<HistoryPage> {
		if (regionId) {
			const regions = await this.regions.list();
			if (!regions.some((region) => region.id === regionId)) {
				throw new NotFoundError("Region", regionId);
			}
		}
		const current = monthKey(this.ctx.now());
		const [first] = await this.ctx.store.find("incidents", {
			where: [{ field: "status", op: "ne", value: "scheduled" }, NOT_DELETED],
			sort: [{ field: "createdAt" }],
			limit: 1,
		});
		const earliest = first ? first.createdAt.slice(0, 7) : current;
		const requested =
			month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month < current
				? month
				: current;
		const newest = requested.localeCompare(earliest) < 0 ? earliest : requested;
		const oldest = addMonths(newest, -(months - 1));
		const incidents = (
			await this.incidents.list({
				since: monthStart(oldest),
				before: monthStart(addMonths(newest, 1)),
			})
		).filter(
			(incident) =>
				incident.status !== "scheduled" &&
				(!regionId || incidentOnRegion(incident, regionId)),
		);
		const result: HistoryMonth[] = [];
		for (let offset = 0; offset < months; offset++) {
			const key = addMonths(newest, -offset);
			result.push({
				key,
				incidents: incidents.filter((incident) =>
					incident.createdAt.startsWith(key),
				),
			});
		}
		const newer = addMonths(newest, months);
		return {
			months: result,
			older: oldest > earliest ? addMonths(oldest, -1) : null,
			newer:
				newest === current
					? null
					: newer.localeCompare(current) > 0
						? current
						: newer,
		};
	}
}
