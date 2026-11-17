import { SERVICE_STATUS_LABELS } from "@/lib/domain/status";
import { MINUTE_MS, type StatusPeriod } from "@/lib/domain/uptime";
import { formatDuration } from "@/lib/format";
import type { ServiceTimeline } from "@/lib/services/status";
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
 * The time range of a period. The first period started before the 24 hours,
 * and the last period continues, so each of them shows only one time.
 */
function PeriodRange({
	period,
	first,
	last,
}: {
	period: StatusPeriod;
	first: boolean;
	last: boolean;
}) {
	if (first && last) {
		return "All 24 hours";
	}
	if (first) {
		return (
			<>
				Until <LocalTime iso={period.end} timeOnly />
			</>
		);
	}
	if (last) {
		return (
			<>
				Since <LocalTime iso={period.start} timeOnly /> (
				{periodDuration(period)})
			</>
		);
	}
	return (
		<>
			<LocalTime iso={period.start} timeOnly /> –{" "}
			<LocalTime iso={period.end} timeOnly /> ({periodDuration(period)})
		</>
	);
}

function isDisruption(period: StatusPeriod): boolean {
	return period.status !== null && period.status !== "operational";
}

function ServiceRow({ service, periods }: ServiceTimeline) {
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
								/>
							</p>
						</div>
					</li>
				))}
			</ol>
			<div className="flex justify-between text-xs text-muted">
				<span>24 hours ago</span>
				<span>Now</span>
			</div>
			{firstDisruption < 0 ? (
				<p className="text-sm text-muted">
					No disruption in the last 24 hours.
				</p>
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
 * The status of each affected service for each minute of the last 24 hours.
 * The list below each bar shows when a disruption started and when the
 * service recovered.
 */
export function StatusTimeline({ services }: { services: ServiceTimeline[] }) {
	return (
		<section className="rounded-card border border-border bg-surface p-6">
			<h2 className="font-semibold">Status in the last 24 hours</h2>
			<p className="mt-1 text-sm text-muted">
				The status of each affected service for each minute.
			</p>
			<ul className="mt-6 space-y-6">
				{services.map((timeline) => (
					<ServiceRow key={timeline.service.id} {...timeline} />
				))}
			</ul>
		</section>
	);
}
