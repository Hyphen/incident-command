import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/status/page-shell";
import { IncidentList } from "@/components/status/recent-incidents";
import { getApp } from "@/lib/app";
import { formatMonth } from "@/lib/format";
import { HISTORY_MARKDOWN_PATH } from "@/lib/llms";
import { publicAlternates } from "@/lib/site";

export const dynamic = "force-dynamic";

interface Props {
	searchParams: Promise<{ month?: string }>;
}

/** The Markdown alternate shows the same months as the page. */
export async function generateMetadata({
	searchParams,
}: Props): Promise<Metadata> {
	const { month } = await searchParams;
	const query = month ? `?month=${encodeURIComponent(month)}` : "";
	return {
		title: "Incident history",
		alternates: publicAlternates(`${HISTORY_MARKDOWN_PATH}${query}`),
	};
}

export default async function HistoryPage({ searchParams }: Props) {
	const { month } = await searchParams;
	const { services } = await getApp();
	const [history, settings, canSubscribe] = await Promise.all([
		services.status.history(month),
		services.settings.get(),
		services.subscribers.canSubscribe(),
	]);
	return (
		<PublicPage settings={settings} canSubscribe={canSubscribe}>
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
							href={`/history?month=${history.older}`}
							className="text-muted hover:text-fg"
						>
							← Older
						</Link>
					)}
					{history.newer && (
						<Link
							href={`/history?month=${history.newer}`}
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
