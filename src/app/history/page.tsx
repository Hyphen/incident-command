import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/status/page-shell";
import { IncidentList } from "@/components/status/recent-incidents";
import { RegionTabs, regionHref } from "@/components/status/region-tabs";
import { getApp } from "@/lib/app";
import { formatMonth } from "@/lib/format";
import { HISTORY_MARKDOWN_PATH } from "@/lib/llms";
import { publicAlternates } from "@/lib/site";

export const dynamic = "force-dynamic";

interface Props {
	searchParams: Promise<{ month?: string; region?: string }>;
}

/** The Markdown alternate shows the same months and region as the page. */
export async function generateMetadata({
	searchParams,
}: Props): Promise<Metadata> {
	const { month, region } = await searchParams;
	const params = new URLSearchParams();
	if (month) {
		params.set("month", month);
	}
	if (region) {
		params.set("region", region);
	}
	const query = params.toString();
	return {
		title: "Incident history",
		alternates: publicAlternates(
			`${HISTORY_MARKDOWN_PATH}${query ? `?${query}` : ""}`,
		),
	};
}

export default async function HistoryPage({ searchParams }: Props) {
	const { month, region: regionId } = await searchParams;
	const { services } = await getApp();
	const regions = await services.regions.list();
	const region = regionId
		? regions.find((item) => item.id === regionId)
		: undefined;
	if (regionId && !region) {
		notFound();
	}
	const [history, settings, canSubscribe] = await Promise.all([
		services.status.history(month, 3, region?.id),
		services.settings.get(),
		services.subscribers.canSubscribe(),
	]);
	const search = month ? { month } : undefined;
	return (
		<PublicPage settings={settings} canSubscribe={canSubscribe}>
			<RegionTabs
				regions={regions}
				activeId={region?.id}
				path="/history"
				search={search}
			/>
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold tracking-tight">
					Incident history
				</h1>
				<Link href="/" className="text-sm text-muted hover:text-fg">
					Current status
				</Link>
			</div>
			{history.months.map((entry) => (
				<section key={entry.key} className="space-y-3">
					<h2 className="font-semibold">{formatMonth(entry.key)}</h2>
					<IncidentList
						incidents={entry.incidents}
						regions={regions}
						empty="No incidents reported."
					/>
				</section>
			))}
			{(history.older || history.newer) && (
				<nav
					className="flex justify-between text-sm"
					aria-label="History pagination"
				>
					{history.older && (
						<Link
							href={regionHref("/history", region?.id, {
								month: history.older,
							})}
							className="text-muted hover:text-fg"
						>
							← Older
						</Link>
					)}
					{history.newer && (
						<Link
							href={regionHref("/history", region?.id, {
								month: history.newer,
							})}
							className="ml-auto text-muted hover:text-fg"
						>
							Newer →
						</Link>
					)}
				</nav>
			)}
		</PublicPage>
	);
}
