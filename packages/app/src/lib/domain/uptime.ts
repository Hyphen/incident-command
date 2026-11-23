import { DOWNTIME_WEIGHT, statusSeverity, worstStatus } from "./status";
import type {
	Incident,
	IncidentImpact,
	Service,
	ServiceStatus,
	ServiceStatusChange,
} from "./types";

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

/** The time that the minute timeline shows before and after an incident. */
export const TIMELINE_MARGIN_MS = 120 * MINUTE_MS;

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
	/**
	 * Uptime of the time with data on this day, from 0 to 1.
	 * `null` when the day has no data.
	 */
	uptime: number | null;
	/** The time with data on this day, in milliseconds. */
	trackedMs: number;
	/** The weighted downtime on this day, in milliseconds (see `DOWNTIME_WEIGHT`). */
	downtimeMs: number;
	/**
	 * The length of this day in the window, in milliseconds.
	 * The window percentage uses this length. Time with no data is not downtime.
	 */
	windowMs: number;
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

/** The time range of the minute timeline. `start` is a whole minute. */
export interface TimelineWindow {
	start: Date;
	end: Date;
}

/** A sequence of minutes that have the same status. */
export interface StatusPeriod {
	/** The worst status in each minute, or `null` when there is no data. */
	status: ServiceStatus | null;
	start: string;
	/** The end of the last minute. For the last period, this is the window end. */
	end: string;
	minutes: number;
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
	window: Pick<UptimeWindow, "start" | "end">,
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
	const end = window.end.getTime();
	for (const change of sorted) {
		const at = new Date(change.createdAt).getTime();
		if (at >= end) {
			break;
		}
		if (at > cursor) {
			segments.push({ status, start: cursor, end: at });
			cursor = at;
		}
		status = change.status;
	}
	if (end > cursor) {
		segments.push({ status, start: cursor, end });
	}
	return segments;
}

/**
 * The uptime of one service for the window, from its status changes.
 * The result divides the weighted downtime by the full window.
 * Time before the service existed is not downtime.
 * The uptime of one day uses only the time with data on that day.
 * A partial outage counts as 30% downtime, and a major outage counts as 100% downtime.
 * Degraded performance and maintenance count as uptime.
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
		days.push({
			date: toDateKey(new Date(dayStart)),
			status: worst,
			uptime: ratio(tracked, down),
			trackedMs: tracked,
			downtimeMs: down,
			windowMs: dayEnd - dayStart,
			incidents: dayIncidents(affecting, dayStart, now),
		});
	}

	return { uptime: periodUptime(days, days.length), days };
}

/**
 * The window of the minute timeline of an incident. The window starts
 * `TIMELINE_MARGIN_MS` before the incident started, on a whole minute. It ends
 * `TIMELINE_MARGIN_MS` after the incident closed, but not after `now`. An
 * open incident closes at `now`.
 */
export function timelineWindow(
	incident: Pick<Incident, "startedAt" | "resolvedAt">,
	now: Date,
): TimelineWindow {
	const closed = incident.resolvedAt
		? new Date(incident.resolvedAt).getTime()
		: now.getTime();
	// Maintenance can close before its scheduled start.
	const started = Math.min(new Date(incident.startedAt).getTime(), closed);
	return {
		start: new Date(
			Math.floor((started - TIMELINE_MARGIN_MS) / MINUTE_MS) * MINUTE_MS,
		),
		end: new Date(Math.min(closed + TIMELINE_MARGIN_MS, now.getTime())),
	};
}

/**
 * The status of a service for each minute of `window`. A minute has the worst
 * status that the service had in that minute. The result merges the minutes
 * that have the same status into periods, oldest first. `changes` must contain
 * each status change after `window.start`, also the changes after `window.end`.
 */
export function minuteTimeline(
	service: Service,
	changes: readonly ServiceStatusChange[],
	window: TimelineWindow,
): StatusPeriod[] {
	const origin = window.start.getTime();
	const close = window.end.getTime();
	const count = Math.ceil((close - origin) / MINUTE_MS);
	const minutes: (ServiceStatus | null)[] = new Array(count).fill(null);
	for (const segment of buildSegments(service, changes, window)) {
		const first = Math.floor((segment.start - origin) / MINUTE_MS);
		const last = Math.ceil((segment.end - origin) / MINUTE_MS);
		for (let index = first; index < last; index++) {
			const current = minutes[index] as ServiceStatus | null;
			if (
				current === null ||
				statusSeverity(segment.status) > statusSeverity(current)
			) {
				minutes[index] = segment.status;
			}
		}
	}
	const periods: StatusPeriod[] = [];
	minutes.forEach((status, index) => {
		const end = new Date(
			Math.min(origin + (index + 1) * MINUTE_MS, close),
		).toISOString();
		const period = periods.at(-1);
		if (period && period.status === status) {
			period.end = end;
			period.minutes += 1;
		} else {
			periods.push({
				status,
				start: new Date(origin + index * MINUTE_MS).toISOString(),
				end,
				minutes: 1,
			});
		}
	});
	return periods;
}

/**
 * Combines the uptime of services for one window.
 * Each service uses the full window, and time before it existed is not downtime.
 * A service with no data does not change the result.
 * A day shows the worst status of the services that have data on that day.
 * A day also lists each incident that overlaps it, and an incident with no services.
 * The uptime of one day uses only the time with data on that day.
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
	const live = results.filter((result) =>
		result.days.some((day) => day.trackedMs > 0),
	);
	const days: DayStatus[] = [];
	for (let index = 0; index < window.days; index++) {
		const dayStart = window.start.getTime() + index * DAY_MS;
		const parts = live.map((result) => result.days[index] as DayStatus);
		let trackedMs = 0;
		let downtimeMs = 0;
		let windowMs = 0;
		const measured: ServiceStatus[] = [];
		for (const part of parts) {
			trackedMs += part.trackedMs;
			downtimeMs += part.downtimeMs;
			windowMs += part.windowMs;
			if (part.status !== null) {
				measured.push(part.status);
			}
		}
		days.push({
			date: toDateKey(new Date(dayStart)),
			status: measured.length > 0 ? worstStatus(measured) : null,
			uptime: ratio(trackedMs, downtimeMs),
			trackedMs,
			downtimeMs,
			windowMs,
			incidents: dayIncidents(affecting, dayStart, now),
		});
	}
	return { uptime: periodUptime(days, days.length), days };
}

/**
 * The uptime of the last `count` days, or `null` when these days have no data.
 * The result divides the weighted downtime by the full length of these days.
 * Time with no data is not downtime.
 */
export function periodUptime(
	days: readonly DayStatus[],
	count: number,
): number | null {
	let windowMs = 0;
	let trackedMs = 0;
	let downtimeMs = 0;
	for (const day of days.slice(-count)) {
		windowMs += day.windowMs;
		trackedMs += day.trackedMs;
		downtimeMs += day.downtimeMs;
	}
	if (trackedMs <= 0) {
		return null;
	}
	return 1 - downtimeMs / windowMs;
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
