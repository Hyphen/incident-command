import { DOWNTIME_WEIGHT, statusSeverity, worstStatus } from "./status";
import type {
	Incident,
	IncidentImpact,
	Service,
	ServiceStatus,
	ServiceStatusChange,
} from "./types";

export const DAY_MS = 86_400_000;

/** The standard uptime periods in days. */
export const UPTIME_PERIODS = [7, 30, 90] as const;

export interface DayIncident {
	id: string;
	title: string;
	impact: IncidentImpact;
}

export interface DayStatus {
	/** UTC date, `YYYY-MM-DD`. */
	date: string;
	/** Worst status during the day, or `null` when there is no data (before the service existed). */
	status: ServiceStatus | null;
	/** Fraction between 0 and 1, or `null` when there is no data. */
	uptime: number | null;
	/** The time with data during the day, in milliseconds. */
	trackedMs: number;
	/** The weighted downtime during the day, in milliseconds (see `DOWNTIME_WEIGHT`). */
	downtimeMs: number;
	incidents: DayIncident[];
}

export interface UptimeResult {
	uptime: number | null;
	days: DayStatus[];
}

export interface UptimeWindow {
	start: Date;
	end: Date;
	days: number;
}

export function startOfUtcDay(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

export function toDateKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** The window of `days` whole UTC days ending with today (until `now`). */
export function uptimeWindow(now: Date, days: number): UptimeWindow {
	const start = new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
	return { start, end: now, days };
}

function ratio(trackedMs: number, downtimeMs: number): number | null {
	return trackedMs > 0 ? 1 - downtimeMs / trackedMs : null;
}

/** The incidents that overlap the day that starts at `dayStart`. */
function dayIncidents(
	incidents: readonly Incident[],
	dayStart: number,
	now: number,
): DayIncident[] {
	return incidents
		.filter((incident) => {
			const started = new Date(incident.startedAt).getTime();
			const ended = incident.resolvedAt
				? new Date(incident.resolvedAt).getTime()
				: now;
			return started < dayStart + DAY_MS && ended >= dayStart;
		})
		.map(({ id, title, impact }) => ({ id, title, impact }));
}

interface Segment {
	status: ServiceStatus;
	start: number;
	end: number;
}

function buildSegments(
	service: Service,
	changes: readonly ServiceStatusChange[],
	window: UptimeWindow,
): Segment[] {
	const sorted = [...changes]
		.filter((change) => change.serviceId === service.id)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	const segments: Segment[] = [];
	let cursor = Math.max(
		window.start.getTime(),
		new Date(service.createdAt).getTime(),
	);
	let status = sorted[0]?.previousStatus ?? service.status;
	for (const change of sorted) {
		const at = new Date(change.createdAt).getTime();
		if (at > cursor) {
			segments.push({ status, start: cursor, end: at });
			cursor = at;
		}
		status = change.status;
	}
	const end = window.end.getTime();
	if (end > cursor) {
		segments.push({ status, start: cursor, end });
	}
	return segments;
}

/**
 * Computes the uptime of a service across a window of days from its status
 * change history. Partial outages count as 30% downtime and major outages as
 * 100%; degraded performance and maintenance do not count as downtime.
 */
export function computeUptime(
	service: Service,
	changes: readonly ServiceStatusChange[],
	incidents: readonly Incident[],
	window: UptimeWindow,
): UptimeResult {
	const segments = buildSegments(service, changes, window);
	const affecting = incidents.filter(
		(incident) =>
			incident.kind === "incident" && incident.serviceIds.includes(service.id),
	);
	const now = window.end.getTime();
	let totalTracked = 0;
	let totalDown = 0;
	const days: DayStatus[] = [];

	for (let index = 0; index < window.days; index++) {
		const dayStart = window.start.getTime() + index * DAY_MS;
		const dayEnd = Math.min(dayStart + DAY_MS, now);
		let tracked = 0;
		let down = 0;
		let worst: ServiceStatus | null = null;
		for (const segment of segments) {
			const overlap =
				Math.min(segment.end, dayEnd) - Math.max(segment.start, dayStart);
			if (overlap <= 0) {
				continue;
			}
			tracked += overlap;
			down += overlap * DOWNTIME_WEIGHT[segment.status];
			if (
				worst === null ||
				statusSeverity(segment.status) > statusSeverity(worst)
			) {
				worst = segment.status;
			}
		}
		totalTracked += tracked;
		totalDown += down;
		days.push({
			date: toDateKey(new Date(dayStart)),
			status: worst,
			uptime: ratio(tracked, down),
			trackedMs: tracked,
			downtimeMs: down,
			incidents: dayIncidents(affecting, dayStart, now),
		});
	}

	return { uptime: ratio(totalTracked, totalDown), days };
}

/**
 * Combines the uptime of services into one result for the same window. Each
 * day adds the tracked time and the downtime of all services. A day shows
 * the worst status of the services and each incident that overlaps it, also
 * an incident without services.
 */
export function combineUptime(
	results: readonly UptimeResult[],
	incidents: readonly Incident[],
	window: UptimeWindow,
): UptimeResult {
	const affecting = incidents.filter(
		(incident) => incident.kind === "incident",
	);
	const now = window.end.getTime();
	const days: DayStatus[] = [];
	for (let index = 0; index < window.days; index++) {
		const dayStart = window.start.getTime() + index * DAY_MS;
		const parts = results
			.map((result) => result.days[index] as DayStatus)
			.filter((day) => day.status !== null);
		let trackedMs = 0;
		let downtimeMs = 0;
		for (const part of parts) {
			trackedMs += part.trackedMs;
			downtimeMs += part.downtimeMs;
		}
		days.push({
			date: toDateKey(new Date(dayStart)),
			status:
				parts.length > 0
					? worstStatus(parts.map((part) => part.status as ServiceStatus))
					: null,
			uptime: ratio(trackedMs, downtimeMs),
			trackedMs,
			downtimeMs,
			incidents: dayIncidents(affecting, dayStart, now),
		});
	}
	return { uptime: periodUptime(days, days.length), days };
}

/** The uptime of the last `count` days, or `null` when these days have no data. */
export function periodUptime(
	days: readonly DayStatus[],
	count: number,
): number | null {
	let trackedMs = 0;
	let downtimeMs = 0;
	for (const day of days.slice(-count)) {
		trackedMs += day.trackedMs;
		downtimeMs += day.downtimeMs;
	}
	return ratio(trackedMs, downtimeMs);
}

/**
 * The uptime periods in days for a window, shortest first. The standard
 * periods that are shorter than the window come first. The window is the
 * last period.
 */
export function uptimePeriods(windowDays: number): number[] {
	return [...UPTIME_PERIODS.filter((days) => days < windowDays), windowDays];
}

/** Formats an uptime fraction as a percentage string such as `99.95%`. */
export function formatUptime(uptime: number | null): string {
	if (uptime === null) {
		return "No data";
	}
	const percent = Math.floor(uptime * 10_000 + 1e-6) / 100;
	return `${percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(2)}%`;
}
