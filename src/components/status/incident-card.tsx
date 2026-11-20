import Link from "next/link";
import { affectedNames, EVENT_STATUS_LABELS } from "@/lib/domain/status";
import type { Incident, Service } from "@/lib/domain/types";
import { LocalTime } from "../time";
import { EventStatusBadge, eventColorStatus, STATUS_BG } from "./badges";

/**
 * Card for an open incident or maintenance showing its latest update.
 * The title link covers the full card. A click on any part of the card opens
 * the incident page.
 */
export function IncidentCard({
	incident,
	services,
	regionName,
}: {
	incident: Incident;
	services: Service[];
	regionName?: string;
}) {
	const latest = incident.updates.at(-1);
	const names = affectedNames(incident, services);
	const color = eventColorStatus(
		incident.kind,
		incident.impact,
		incident.status,
	);
	return (
		<article
			data-kind={incident.kind}
			data-status={color}
			className="ic-incident group relative overflow-hidden rounded-card border border-border bg-surface transition-colors hover:bg-surface-muted has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-brand"
		>
			<div className={`absolute inset-y-0 left-0 w-1 ${STATUS_BG[color]}`} />
			<div className="p-5 pl-6">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<h2 className="font-semibold">
						<Link
							href={`/incidents/${incident.id}`}
							className="outline-none after:absolute after:inset-0 group-hover:underline"
						>
							{incident.title}
						</Link>
					</h2>
					<EventStatusBadge
						kind={incident.kind}
						impact={incident.impact}
						status={incident.status}
					/>
				</div>
				{incident.kind === "maintenance" &&
					incident.scheduledStart &&
					incident.scheduledEnd && (
						<p className="mt-1 text-sm text-muted">
							Scheduled <LocalTime iso={incident.scheduledStart} /> –{" "}
							<LocalTime iso={incident.scheduledEnd} />
						</p>
					)}
				{regionName && <p className="mt-1 text-sm text-muted">{regionName}</p>}
				{names.length > 0 && (
					<p className="mt-1 text-sm text-muted">Affects {names.join(", ")}</p>
				)}
				{latest && (
					<div className="mt-4 border-l-2 border-border pl-4">
						<p className="text-sm whitespace-pre-wrap">
							<span className="font-medium">
								{EVENT_STATUS_LABELS[latest.status]}
							</span>{" "}
							— {latest.message}
						</p>
						<p className="mt-1 text-xs text-muted">
							<LocalTime iso={latest.createdAt} />
						</p>
					</div>
				)}
			</div>
		</article>
	);
}
