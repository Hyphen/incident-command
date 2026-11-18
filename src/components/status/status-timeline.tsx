import { SERVICE_STATUS_LABELS } from "@/lib/domain/status";
import { MINUTE_MS, type StatusPeriod } from "@/lib/domain/uptime";
import { formatDuration } from "@/lib/format";
import type { IncidentTimeline, ServiceTimeline } from "@/lib/services/status";
import { LocalTime } from "../time";
import { STATUS_BG, StatusBadge } from "./badges";

function periodLabel(period: StatusPeriod): string {
	return period.status ? SERVICE_STATUS_LABELS[period.status] : "No data";
}

function periodColor(period: StatusPeriod): string {
	return period.status ? STATUS_BG[period.status] : "bg-nodata";
}

function periodDuration(period: StatusPeriod): string {
	return formatDuration(period.minutes * MINUTE_MS);
}

/**
 * The time range of a period. The first period started before the window, so
 * it shows only its end. The last period shows only its start. It shows its
 * duration only when the window ends now, because the period can continue
 * after a window that ended.
 */
function PeriodRange({
	period,
	first,
	last,
	untilNow,
}: {
	period: StatusPeriod;
	first: boolean;
	last: boolean;
	untilNow: boolean;
}) {
	if (first && last) {
		return "The full period";
	}
	if (first) {
		return (
			<>
				Until <LocalTime iso={period.end} short />
			</>
		);
	}
	if (last && untilNow) {
		return (
			<>
				Since <LocalTime iso={period.start} short /> ({periodDuration(period)})
			</>
		);
	}
	if (last) {
		return (
			<>
				From <LocalTime iso={period.start} short />
			</>
		);
	}
	return (
		<>
			<LocalTime iso={period.start} short /> –{" "}
			<LocalTime iso={period.end} short /> ({periodDuration(period)})
		</>
	);
}

function isDisruption(period: StatusPeriod): boolean {
	return period.status !== null && period.status !== "operational";
}

function ServiceRow({
	service,
	periods,
	start,
	end,
	untilNow,
}: ServiceTimeline & Omit<IncidentTimeline, "services">) {
	const firstDisruption = periods.findIndex(isDisruption);
	return (
		<li className="space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="text-sm font-medium">{service.name}</h3>
				<StatusBadge status={service.status} />
			</div>
			<ol
				className="flex h-8 items-stretch"
				aria-label={`${service.name}: status for each minute`}
			>
				{periods.map((period, index) => (
					<li
						key={period.start}
						aria-label={`${periodLabel(period)}: ${periodDuration(period)}`}
						style={{ flexGrow: period.minutes }}
						className="group relative min-w-[2px] basis-0"
					>
						<div
							className={`h-full group-first:rounded-l-[2px] group-last:rounded-r-[2px] group-hover:opacity-70 ${periodColor(period)}`}
						/>
						<div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border border-border bg-surface p-3 text-left text-xs shadow-lg group-hover:block">
							<p className="font-semibold">{periodLabel(period)}</p>
							<p className="mt-1 text-muted">
								<PeriodRange
									period={period}
									first={index === 0}
									last={index === periods.length - 1}
									untilNow={untilNow}
								/>
							</p>
						</div>
					</li>
				))}
			</ol>
			<div className="flex justify-between text-xs text-muted">
				<LocalTime iso={start} />
				{untilNow ? <span>Now</span> : <LocalTime iso={end} />}
			</div>
			{firstDisruption < 0 ? (
				<p className="text-sm text-muted">No disruption in this period.</p>
			) : (
				<ul
					className="space-y-1 text-sm"
					aria-label={`${service.name}: disruptions`}
				>
					{periods.map(
						(period, index) =>
							index >= firstDisruption && (
								<li
									key={period.start}
									className="flex flex-wrap items-baseline gap-x-2"
								>
									<span
										className={`inline-block size-2 shrink-0 self-center rounded-full ${periodColor(period)}`}
										aria-hidden
									/>
									<span className="font-medium">{periodLabel(period)}</span>
									<span className="text-muted">
										<PeriodRange
											period={period}
											first={index === 0}
											last={index === periods.length - 1}
											untilNow={untilNow}
										/>
									</span>
								</li>
							),
					)}
				</ul>
			)}
		</li>
	);
}

/**
 * The status of each affected service for each minute of the incident, with
 * 2 hours before the incident and 2 hours after it. The list below each bar
 * shows when a disruption started and when the service recovered.
 */
export function StatusTimeline({ services, ...window }: IncidentTimeline) {
	return (
		<section className="rounded-card border border-border bg-surface p-6">
			<h2 className="font-semibold">Status of the affected services</h2>
			<p className="mt-1 text-sm text-muted">
				{window.untilNow
					? "The status for each minute, from 2 hours before the start until now."
					: "The status for each minute, from 2 hours before the start to 2 hours after the end."}
			</p>
			<ul className="mt-6 space-y-6">
				{services.map((timeline) => (
					<ServiceRow key={timeline.service.id} {...timeline} {...window} />
				))}
			</ul>
		</section>
	);
}
