import type { Metadata } from "next";
import Link from "next/link";
import {
	IncidentMetricsCard,
	StatTile,
	UptimeCard,
} from "@/components/manage/overview";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { ButtonLink, Card, EmptyState } from "@/components/manage/ui";
import { EventStatusBadge, StatusBadge } from "@/components/status/badges";
import { LocalTime } from "@/components/time";
import { requireMember } from "@/lib/auth";
import { hasRole, OVERALL_STATUS_COPY } from "@/lib/domain/status";
import { formatUptime } from "@/lib/domain/uptime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams>;
}) {
	const flash = await searchParams;
	const { member, services, app } = await requireMember();
	const [overview, drafts] = await Promise.all([
		services.status.overview(),
		services.drafts.list({ pending: true }),
	]);
	const { summary, metrics } = overview;
	const open = [
		...summary.activeIncidents,
		...summary.activeMaintenance,
		...summary.upcomingMaintenance,
	];
	const canEdit = hasRole(member.role, "editor");
	const affected = summary.services.filter(
		(service) => service.status !== "operational",
	);
	return (
		<ManagePage
			title="Overview"
			flash={flash}
			health={app.store.health}
			actions={
				canEdit && (
					<div className="flex gap-2">
						<ButtonLink
							href="/manage/incidents/new?kind=maintenance"
							variant="secondary"
						>
							Schedule maintenance
						</ButtonLink>
						<ButtonLink href="/manage/incidents/new">
							Declare incident
						</ButtonLink>
					</div>
				)
			}
		>
			{drafts.length > 0 && (
				<p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-maintenance/40 bg-maintenance/10 px-4 py-3 text-sm">
					<span>
						{drafts.length === 1
							? "1 notification draft waits for review."
							: `${drafts.length} notification drafts wait for review.`}
					</span>
					<Link
						href="/manage/incidents"
						className="font-medium hover:underline"
					>
						Review drafts →
					</Link>
				</p>
			)}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatTile
					label="Current status"
					value={<StatusBadge status={summary.overall} />}
					detail={OVERALL_STATUS_COPY[summary.overall].title}
				/>
				<StatTile
					label="Uptime"
					value={formatUptime(summary.uptime.uptime)}
					detail={`Last ${summary.window.days} days`}
				/>
				<StatTile
					label="Open incidents"
					value={summary.activeIncidents.length}
					detail={`Maintenance: ${summary.activeMaintenance.length} active, ${summary.upcomingMaintenance.length} scheduled`}
				/>
				<StatTile
					label="Services affected"
					value={
						<>
							{affected.length}
							<span className="text-base font-normal text-muted">
								{" "}
								/ {summary.services.length}
							</span>
						</>
					}
					detail={
						affected.length === 0
							? "All services are operational"
							: affected.map((service) => service.name).join(", ")
					}
				/>
			</div>
			<Card title="Open incidents and maintenance">
				{open.length === 0 ? (
					<EmptyState>Nothing open. All quiet.</EmptyState>
				) : (
					<ul className="divide-y divide-border">
						{open.map((incident) => (
							<li
								key={incident.id}
								className="flex flex-wrap items-center justify-between gap-2 py-3"
							>
								<div>
									<Link
										href={`/manage/incidents/${incident.id}`}
										className="font-medium hover:underline"
									>
										{incident.title}
									</Link>
									<p className="text-xs text-muted">
										Updated <LocalTime iso={incident.updatedAt} />
									</p>
								</div>
								<EventStatusBadge
									kind={incident.kind}
									impact={incident.impact}
									status={incident.status}
								/>
							</li>
						))}
					</ul>
				)}
			</Card>
			<UptimeCard
				periods={overview.periods}
				days={summary.uptime.days}
				services={overview.services}
			/>
			<IncidentMetricsCard metrics={metrics} now={summary.generatedAt} />
		</ManagePage>
	);
}
