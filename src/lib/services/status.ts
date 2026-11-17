import { type ResolutionStats, resolutionStats } from "../domain/metrics";
import { impactToStatus, worstStatus } from "../domain/status";
import type {
	Incident,
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
	timelineStart,
	type UptimeResult,
	type UptimeWindow,
	uptimePeriods,
	uptimeWindow,
} from "../domain/uptime";
import type { ServiceCatalog } from "./catalog";
import type { ServiceContext } from "./context";
import type { IncidentService } from "./incidents";
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

/** The status of one service for each minute of the last 24 hours. */
export interface ServiceTimeline {
	service: Service;
	/** The periods of the 24 hours, oldest first. */
	periods: StatusPeriod[];
}

export interface HistoryMonth {
	/** `YYYY-MM` */
	key: string;
	incidents: Incident[];
}

export interface HistoryPage {
	months: HistoryMonth[];
	/** Key of the page with older months. */
	older: string;
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

	constructor(
		ctx: ServiceContext,
		settings: SettingsService,
		catalog: ServiceCatalog,
		incidents: IncidentService,
	) {
		this.ctx = ctx;
		this.settings = settings;
		this.catalog = catalog;
		this.incidents = incidents;
	}

	async summary(): Promise<StatusSummary> {
		const settings = await this.settings.get();
		const now = this.ctx.now();
		const window = uptimeWindow(now, settings.uptimeDays);
		const since = new Date(
			Math.min(window.start.getTime(), now.getTime() - RECENT_DAYS * DAY_MS),
		).toISOString();
		const [services, changes, open, recent] = await Promise.all([
			this.catalog.list({ includeHidden: false }),
			this.ctx.store.find("service_status_changes", {
				where: [
					{ field: "createdAt", op: "gte", value: window.start.toISOString() },
				],
				sort: [{ field: "createdAt" }],
			}),
			this.incidents.list({ open: true }),
			this.incidents.list({ since }),
		]);
		const byId = new Map<string, Incident>();
		for (const incident of [...open, ...recent]) {
			byId.set(incident.id, incident);
		}
		const relevant = [...byId.values()];

		const views: ServiceView[] = services.map((service) => ({
			...service,
			...computeUptime(service, changes, relevant, window),
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

		const activeIncidents = open.filter(
			(incident) => incident.kind === "incident",
		);
		const activeMaintenance = open.filter(
			(incident) =>
				incident.kind === "maintenance" && incident.status !== "scheduled",
		);
		const upcomingMaintenance = open
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
				incident.createdAt >= recentCutoff && incident.status !== "scheduled",
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
	 * The status for each minute of the last 24 hours, for each visible service
	 * that the incident affects. The result is empty when the incident was not
	 * in progress in these 24 hours.
	 */
	async incidentTimeline(incident: Incident): Promise<ServiceTimeline[]> {
		const now = this.ctx.now();
		const start = timelineStart(now).toISOString();
		if (
			incident.status === "scheduled" ||
			(incident.resolvedAt !== undefined && incident.resolvedAt < start)
		) {
			return [];
		}
		const [services, changes] = await Promise.all([
			this.catalog.list({ includeHidden: false }),
			this.ctx.store.find("service_status_changes", {
				where: [{ field: "createdAt", op: "gte", value: start }],
				sort: [{ field: "createdAt" }],
			}),
		]);
		return services
			.filter((service) => incident.serviceIds.includes(service.id))
			.map((service) => ({
				service,
				periods: minuteTimeline(service, changes, now),
			}));
	}

	/**
	 * Incident history paginated by month. `month` (`YYYY-MM`) is the newest
	 * month on the page; defaults to the current month.
	 */
	async history(month?: string, months = 3): Promise<HistoryPage> {
		const current = monthKey(this.ctx.now());
		const newest =
			month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month < current
				? month
				: current;
		const oldest = addMonths(newest, -(months - 1));
		const incidents = (
			await this.incidents.list({
				since: monthStart(oldest),
				before: monthStart(addMonths(newest, 1)),
			})
		).filter((incident) => incident.status !== "scheduled");
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
			older: addMonths(oldest, -1),
			newer:
				newest === current
					? null
					: newer.localeCompare(current) > 0
						? current
						: newer,
		};
	}
}
