import type { Metadata } from "next";
import Link from "next/link";
import { NoticeCard } from "@/components/status/notice";
import { PublicPage } from "@/components/status/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getApp } from "@/lib/app";
import { unsubscribeAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe" };

export default async function UnsubscribePage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string; done?: string; incident?: string }>;
}) {
	const { token, done, incident: incidentId } = await searchParams;
	const { services } = await getApp();
	const [settings, incident] = await Promise.all([
		services.settings.get(),
		incidentId ? services.incidents.find(incidentId) : undefined,
	]);
	return (
		<PublicPage settings={settings} canSubscribe={false}>
			{done ? (
				<NoticeCard title="You've been unsubscribed">
					<p>
						You will no longer receive{" "}
						{incident
							? `updates for ${incident.title}`
							: `${settings.siteName} updates`}
						.
					</p>
				</NoticeCard>
			) : (
				<NoticeCard title="Unsubscribe from updates">
					<p>
						{incident
							? `Stop receiving emails about ${incident.title}.`
							: `Stop receiving incident and maintenance emails from ${settings.siteName}.`}
					</p>
					<form action={unsubscribeAction}>
						<input type="hidden" name="token" value={token ?? ""} />
						{incidentId && (
							<input type="hidden" name="incidentId" value={incidentId} />
						)}
						<SubmitButton className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50">
							Unsubscribe
						</SubmitButton>
					</form>
				</NoticeCard>
			)}
			<Link href="/" className="text-sm text-muted hover:text-fg">
				← Back to status
			</Link>
		</PublicPage>
	);
}
