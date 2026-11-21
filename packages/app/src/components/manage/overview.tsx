import Link from "next/link";
import type { ReactNode } from "react";
import { Card, EmptyState } from "@/components/manage/ui";
import { ImpactBadge, StatusBadge } from "@/components/status/badges";
import { UptimeAxis, UptimeBars } from "@/components/status/uptime-bars";
import { LocalTime } from "@/components/time";
import { type DayStatus, formatUptime } from "@/lib/domain/uptime";
import { formatDuration } from "@/lib/format";
import type {
	IncidentMetrics,
	ServiceUptimeView,
	UptimePeriod,
} from "@/lib/services/status";

/** The number of incidents that the metrics card lists. */
const METRICS_LIST_LIMIT = 5;

/** One headline number of the overview. */
export function StatTile({
	label,
	value,
	detail,
}: {
	label: string;
	value: ReactNode;
	detail: ReactNode;
}) {
	return (
		<section
			aria-label={label}
			className="rounded-card border border-border bg-surface p-5"
		>
			<p className="text-sm text-muted">{label}</p>
			<div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
			<div className="mt-2 text-sm text-muted">{detail}</div>
		</section>
	);
}

function Metric({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<div>
			<dt className="text-sm text-muted">{label}</dt>
			<dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
			<dd className="mt-1 text-xs text-muted">{detail}</dd>
		</div>
	);
}

/** Compares the incident count with the count of the period before. */
function compareCount(current: number, previous: number, days: number): string {
	const difference = current - previous;
	if (difference === 0) {
		return `Same as the previous ${days} days`;
	}
	return `${Math.abs(difference)} ${difference > 0 ? "more" : "fewer"} than the previous ${days} days`;
}

/**
 * The combined uptime of the visible services for each period, the daily
 * history, and the uptime of each service.
 */
export function UptimeCard({
	periods,
	days,
	services,
}: {
	periods: UptimePeriod[];
	days: DayStatus[];
	services: ServiceUptimeView[];
}) {
	return (
		<Card
			title="Uptime"
			description="All services on the status page. Partial outages count as 30% downtime."
		>
			{services.length === 0 ? (
				<EmptyState>
					No services yet.{" "}
					<Link href="/manage/services" className="underline">
						Add a service
					</Link>{" "}
					to track uptime.
				</EmptyState>
			) : (
				<div className="space-y-6">
					<dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
						{periods.map((period) => (
							<div key={period.days}>
								<dt className="text-sm text-muted">{period.days} days</dt>
								<dd className="mt-1 text-2xl font-semibold tabular-nums">
									{formatUptime(period.uptime)}
								</dd>
							</div>
						))}
					</dl>
					<div>
						<UptimeBars days={days} />
						<div className="mt-2 flex justify-between text-xs text-muted">
							<UptimeAxis days={days.length} />
						</div>
					</div>
					<div className="-mx-5 overflow-x-auto border-t border-border">
						<table className="w-full text-sm">
							<caption className="sr-only">Uptime by service</caption>
							<thead>
								<tr className="text-xs text-muted">
									<th scope="col" className="px-5 py-3 text-left font-medium">
										Service
									</th>
									<th scope="col" className="px-3 py-3 text-left font-medium">
										Status
									</th>
									{periods.map((period) => (
										<th
											key={period.days}
											scope="col"
											className="px-5 py-3 text-right font-medium whitespace-nowrap"
										>
											{period.days} days
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-border border-t border-border">
								{services.map(({ service, periods: uptime }) => (
									<tr key={service.id}>
										<th scope="row" className="px-5 py-3 text-left font-medium">
											{service.name}
											{service.group && (
												<span className="block text-xs font-normal text-muted">
													{service.group}
												</span>
											)}
										</th>
										<td className="px-3 py-3">
											<StatusBadge status={service.status} />
										</td>
										{uptime.map((period) => (
											<td
												key={period.days}
												className="px-5 py-3 text-right tabular-nums whitespace-nowrap"
											>
												{formatUptime(period.uptime)}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</Card>
	);
}

/** The incident count, the time to resolve and the incidents of the period. */
export function IncidentMetricsCard({
	metrics,
	now,
}: {
	metrics: IncidentMetrics;
	now: string;
}) {
	const count = metrics.incidents.length;
	const shown = metrics.incidents.slice(0, METRICS_LIST_LIMIT);
	return (
		<Card
			title={`Last ${metrics.days} days`}
			actions={
				<Link
					href="/manage/incidents"
					className="text-sm text-muted hover:text-fg"
				>
					All incidents →
				</Link>
			}
		>
			<dl className="grid gap-4 sm:grid-cols-3">
				<Metric
					label="Incidents"
					value={String(count)}
					detail={compareCount(count, metrics.previousCount, metrics.days)}
				/>
				<Metric
					label="Mean time to resolve"
					value={
						metrics.meanMs === null ? "None" : formatDuration(metrics.meanMs)
					}
					detail={`${metrics.resolved} resolved`}
				/>
				<Metric
					label="Longest incident"
					value={
						metrics.longestMs === null
							? "None"
							: formatDuration(metrics.longestMs)
					}
					detail="From start to resolution"
				/>
			</dl>
			<div className="mt-5 border-t border-border pt-2">
				{count === 0 ? (
					<p className="pt-3 text-sm text-muted">
						No incidents in the last {metrics.days} days.
					</p>
				) : (
					<ul className="divide-y divide-border">
						{shown.map((incident) => (
							<li
								key={incident.id}
								className="flex flex-wrap items-center justify-between gap-2 py-3"
							>
								<div className="min-w-0">
									<Link
										href={`/manage/incidents/${incident.id}`}
										className="font-medium break-words hover:underline"
									>
										{incident.title}
									</Link>
									<p className="text-xs text-muted">
										<LocalTime iso={incident.startedAt} /> ·{" "}
										{incident.resolvedAt
											? `Resolved in ${formatDuration(Date.parse(incident.resolvedAt) - Date.parse(incident.startedAt))}`
											: `Open for ${formatDuration(Date.parse(now) - Date.parse(incident.startedAt))}`}
									</p>
								</div>
								<ImpactBadge impact={incident.impact} />
							</li>
						))}
					</ul>
				)}
				{count > shown.length && (
					<p className="pt-3 text-xs text-muted">
						Showing {shown.length} of {count} incidents.
					</p>
				)}
			</div>
		</Card>
	);
}
