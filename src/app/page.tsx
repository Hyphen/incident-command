import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OverallBanner } from "@/components/status/banner";
import { IncidentCard } from "@/components/status/incident-card";
import { PublicPage } from "@/components/status/page-shell";
import { IncidentList } from "@/components/status/recent-incidents";
import { RegionTabs } from "@/components/status/region-tabs";
import { SystemStatus } from "@/components/status/system-status";
import { getApp } from "@/lib/app";
import { regionNameFor } from "@/lib/domain/regions";
import { LLMS_PATH } from "@/lib/llms";
import { RECENT_DAYS } from "@/lib/services/status";
import { publicAlternates } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: publicAlternates(LLMS_PATH) };

export default async function StatusPage({
	searchParams,
}: {
	searchParams?: Promise<{ region?: string }>;
} = {}) {
	const { region: regionId } = searchParams ? await searchParams : {};
	const { services } = await getApp();
	const regions = await services.regions.list();
	const region = regionId
		? regions.find((item) => item.id === regionId)
		: undefined;
	if (regionId && !region) {
		notFound();
	}
	const [summary, canSubscribe] = await Promise.all([
		services.status.summary(region ? { regionId: region.id } : {}),
		services.subscribers.canSubscribe(),
	]);
	const active = [...summary.activeIncidents, ...summary.activeMaintenance];
	return (
		<PublicPage settings={summary.settings} canSubscribe={canSubscribe}>
			<RegionTabs
				regions={summary.regions}
				activeId={summary.region?.id}
				path="/"
			/>
			<OverallBanner status={summary.overall} />
			{summary.settings.description && (
				<p className="ic-description text-muted">
					{summary.settings.description}
				</p>
			)}

			{active.length > 0 && (
				<section aria-label="Active incidents" className="space-y-4">
					{active.map((incident) => (
						<IncidentCard
							key={incident.id}
							incident={incident}
							services={summary.services}
							regionName={regionNameFor(incident, summary.regions)}
						/>
					))}
				</section>
			)}

			{summary.upcomingMaintenance.length > 0 && (
				<section className="space-y-4">
					<h2 className="font-semibold">Upcoming maintenance</h2>
					{summary.upcomingMaintenance.map((incident) => (
						<IncidentCard
							key={incident.id}
							incident={incident}
							services={summary.services}
							regionName={regionNameFor(incident, summary.regions)}
						/>
					))}
				</section>
			)}

			<SystemStatus groups={summary.groups} window={summary.window} />

			<section>
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-semibold">Recent incidents</h2>
					<Link href="/history" className="text-sm text-muted hover:text-fg">
						View history →
					</Link>
				</div>
				<IncidentList
					incidents={summary.recentIncidents}
					regions={summary.regions}
					empty={`No incidents reported in the last ${RECENT_DAYS} days.`}
				/>
			</section>
		</PublicPage>
	);
}
