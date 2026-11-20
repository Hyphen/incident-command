import type { CSSProperties } from "react";
import { NO_DATA_STATUS } from "@/lib/design";
import { SERVICE_STATUS_LABELS } from "@/lib/domain/status";
import { type DayStatus, formatUptime } from "@/lib/domain/uptime";
import { formatDay } from "@/lib/format";
import { STATUS_BG } from "./badges";

/** Days older than this are hidden on small screens. */
export const MOBILE_DAYS = 30;

/**
 * The tooltip sits on the center of its day and stays inside the row.
 * `w-56` is 14rem. The shift uses half of that width.
 * A phone uses the last 30 days. A wide screen uses every day.
 */
const TOOLTIP_POSITION =
	"left-[clamp(0px,calc(var(--tip)_-_7rem),max(0px,calc(100%_-_14rem)))] sm:left-[clamp(0px,calc(var(--tip-sm)_-_7rem),max(0px,calc(100%_-_14rem)))]";

/** The center of one day, as a percentage of the row. */
function dayCenter(index: number, total: number): string {
	return `${((index + 0.5) / total) * 100}%`;
}

function tooltipStyle(index: number, total: number): CSSProperties {
	const visible = Math.min(MOBILE_DAYS, total);
	const shown = index - (total - visible);
	return {
		"--tip": shown < 0 ? "0%" : dayCenter(shown, visible),
		"--tip-sm": dayCenter(index, total),
	} as CSSProperties;
}

/**
 * The start and end labels under the uptime bars. Small screens show only
 * the last `MOBILE_DAYS` days.
 */
export function UptimeAxis({ days }: { days: number }) {
	return (
		<>
			<span className="hidden sm:inline">{days} days ago</span>
			<span className="sm:hidden">{Math.min(days, MOBILE_DAYS)} days ago</span>
			<span>Today</span>
		</>
	);
}

export function UptimeBars({ days }: { days: DayStatus[] }) {
	return (
		<ol
			className="ic-uptime relative flex h-8 items-stretch gap-[2px]"
			aria-label="Daily status history"
		>
			{days.map((day, index) => {
				const color = day.status ? STATUS_BG[day.status] : "bg-nodata";
				const label = day.status
					? SERVICE_STATUS_LABELS[day.status]
					: "No data";
				return (
					<li
						key={day.date}
						aria-label={`${formatDay(day.date)}: ${label}`}
						data-status={day.status ?? NO_DATA_STATUS}
						className={`ic-uptime-day group flex-1 ${index < days.length - MOBILE_DAYS ? "hidden sm:block" : ""}`}
					>
						<div
							className={`ic-uptime-bar h-full rounded-[2px] ${color} transition-opacity group-hover:opacity-70`}
						/>
						<div
							className={`pointer-events-none absolute bottom-full z-20 mb-2 hidden w-56 max-w-full rounded-lg border border-border bg-surface p-3 text-left text-xs shadow-lg group-hover:block ${TOOLTIP_POSITION}`}
							style={tooltipStyle(index, days.length)}
						>
							<p className="font-semibold">{formatDay(day.date)}</p>
							<p className="mt-1 text-muted">
								{label}
								{day.uptime !== null && ` · ${formatUptime(day.uptime)} uptime`}
							</p>
							{day.incidents.length > 0 && (
								<ul className="mt-2 space-y-1 border-t border-border pt-2">
									{day.incidents.map((incident) => (
										<li key={incident.id}>{incident.title}</li>
									))}
								</ul>
							)}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
