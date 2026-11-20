import Link from "next/link";
import { regionNameFor } from "@/lib/domain/regions";
import type { Incident, Region } from "@/lib/domain/types";
import { formatDay } from "@/lib/format";
import { EventStatusBadge } from "./badges";

export function groupByDay(incidents: Incident[]): [string, Incident[]][] {
	const groups = new Map<string, Incident[]>();
	for (const incident of incidents) {
		const key = incident.createdAt.slice(0, 10);
		groups.set(key, [...(groups.get(key) ?? []), incident]);
	}
	return [...groups.entries()];
}

/**
 * Incidents grouped by day, with the latest update of each incident.
 * The title link of an incident covers its full row. A click on any part of
 * the row opens the incident page.
 */
export function IncidentList({
	incidents,
	empty,
	regions = [],
}: {
	incidents: Incident[];
	empty: string;
	regions?: readonly Region[];
}) {
	if (incidents.length === 0) {
		return (
			<p className="rounded-card border border-dashed border-border px-5 py-6 text-center text-sm text-muted">
				{empty}
			</p>
		);
	}
	return (
		<div className="space-y-6">
			{groupByDay(incidents).map(([day, items]) => (
				<div key={day}>
					<h3 className="mb-2 text-sm font-semibold text-muted">
						{formatDay(day)}
					</h3>
					<ul className="ic-incident-list divide-y divide-border rounded-card border border-border bg-surface">
						{items.map((incident) => {
							const regionName = regionNameFor(incident, regions);
							return (
								<li
									key={incident.id}
									className="ic-incident-item group relative px-5 py-4 transition-colors first:rounded-t-card last:rounded-b-card hover:bg-surface-muted has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-brand"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<Link
											href={`/incidents/${incident.id}`}
											className="font-medium outline-none after:absolute after:inset-0 group-hover:underline"
										>
											{incident.title}
										</Link>
										<EventStatusBadge
											kind={incident.kind}
											impact={incident.impact}
											status={incident.status}
										/>
									</div>
									<p className="mt-1 line-clamp-2 text-sm text-muted">
										{incident.updates.at(-1)?.message}
									</p>
									{regionName && (
										<p className="mt-1 text-xs text-muted">{regionName}</p>
									)}
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</div>
	);
}
