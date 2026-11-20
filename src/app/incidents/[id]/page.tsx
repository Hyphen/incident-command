import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventStatusBadge, ImpactBadge } from "@/components/status/badges";
import { PublicPage } from "@/components/status/page-shell";
import { StatusTimeline } from "@/components/status/status-timeline";
import { Timeline } from "@/components/status/timeline";
import { LocalTime } from "@/components/time";
import { getApp } from "@/lib/app";
import { regionNameFor } from "@/lib/domain/regions";
import { affectedNames } from "@/lib/domain/status";
import { formatDuration } from "@/lib/format";
import { incidentMarkdownPath } from "@/lib/llms";
import { publicAlternates } from "@/lib/site";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const { services } = await getApp();
	const incident = await services.incidents.find(id);
	if (!incident) {
		return { title: "Incident not found" };
	}
	return {
		title: incident.title,
		alternates: publicAlternates(incidentMarkdownPath(incident.id)),
	};
}

export default async function IncidentPage({ params }: Props) {
	const { id } = await params;
	const { services } = await getApp();
	const incident = await services.incidents.find(id);
	if (!incident) {
		notFound();
	}
	const [settings, catalog, canSubscribe, timeline, regions] =
		await Promise.all([
			services.settings.get(),
			services.catalog.list({ includeHidden: false }),
			services.subscribers.canSubscribe(),
			services.status.incidentTimeline(incident),
			services.regions.list(),
		]);
	const names = affectedNames(incident, catalog);
	const regionName = regionNameFor(incident, regions);
	const backHref =
		incident.regionId &&
		regions.some((region) => region.id === incident.regionId)
			? `/?region=${incident.regionId}`
			: "/";
	return (
		<PublicPage settings={settings} canSubscribe={canSubscribe}>
			<Link href={backHref} className="text-sm text-muted hover:text-fg">
				← Back to status
			</Link>
			<article className="space-y-6">
				<header className="space-y-3">
					<p className="text-sm font-medium text-muted">
						{incident.kind === "maintenance"
							? "Scheduled maintenance"
							: "Incident"}
					</p>
					<h1 className="text-2xl font-semibold tracking-tight">
						{incident.title}
					</h1>
					<div className="flex flex-wrap gap-2">
						<EventStatusBadge
							kind={incident.kind}
							impact={incident.impact}
							status={incident.status}
						/>
						{incident.kind === "incident" && (
							<ImpactBadge impact={incident.impact} />
						)}
					</div>
					<dl className="grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-[auto_1fr]">
						{regionName && (
							<>
								<dt>Region</dt>
								<dd>{regionName}</dd>
							</>
						)}
						{incident.kind === "maintenance" &&
						incident.scheduledStart &&
						incident.scheduledEnd ? (
							<>
								<dt>Window</dt>
								<dd>
									<LocalTime iso={incident.scheduledStart} /> –{" "}
									<LocalTime iso={incident.scheduledEnd} />
								</dd>
							</>
						) : (
							<>
								<dt>Started</dt>
								<dd>
									<LocalTime iso={incident.startedAt} />
								</dd>
							</>
						)}
						{incident.resolvedAt && (
							<>
								<dt>
									{incident.kind === "maintenance" ? "Completed" : "Resolved"}
								</dt>
								<dd>
									<LocalTime iso={incident.resolvedAt} /> (
									{formatDuration(
										new Date(incident.resolvedAt).getTime() -
											new Date(incident.startedAt).getTime(),
									)}
									)
								</dd>
							</>
						)}
						{names.length > 0 && (
							<>
								<dt>Affected</dt>
								<dd>{names.join(", ")}</dd>
							</>
						)}
					</dl>
				</header>
				{timeline.services.length > 0 && <StatusTimeline {...timeline} />}
				<section className="rounded-card border border-border bg-surface p-6">
					<h2 className="mb-6 font-semibold">Updates</h2>
					<div className="max-w-prose">
						<Timeline incident={incident} />
					</div>
				</section>
			</article>
		</PublicPage>
	);
}
