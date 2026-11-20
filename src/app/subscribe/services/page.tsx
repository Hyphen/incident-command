import type { Metadata } from "next";
import Link from "next/link";
import { ServiceTags } from "@/components/service-tags";
import { NoticeCard } from "@/components/status/notice";
import { PublicPage } from "@/components/status/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getApp } from "@/lib/app";
import { resolveFlash } from "@/lib/flash";
import { updateServicesAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose services" };

const buttonClass =
	"inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50";

export default async function ServicesPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string; notice?: string; error?: string }>;
}) {
	const {
		token = "",
		notice: noticeCode,
		error: errorCode,
	} = await searchParams;
	const { notice, error } = resolveFlash({
		notice: noticeCode,
		error: errorCode,
	});
	const { services } = await getApp();
	const [settings, canSubscribe, subscriber, catalog] = await Promise.all([
		services.settings.get(),
		services.subscribers.canSubscribe(),
		services.subscribers.own(token),
		services.catalog.list({ includeHidden: false }),
	]);
	return (
		<PublicPage settings={settings} canSubscribe={canSubscribe} narrow>
			{subscriber ? (
				<NoticeCard title="Choose services">
					<p>
						Select the services that send a notification to {subscriber.target}.
					</p>
					{notice && (
						<p
							role="status"
							className="rounded-lg border border-operational/40 px-3 py-2 text-sm"
						>
							{notice}
						</p>
					)}
					{error && (
						<p
							role="alert"
							className="rounded-lg border border-major/40 px-3 py-2 text-sm text-major"
						>
							{error}
						</p>
					)}
					<form action={updateServicesAction} className="space-y-4">
						<input type="hidden" name="token" value={token} />
						<ServiceTags services={catalog} selected={subscriber.serviceIds} />
						{catalog.length === 0 && (
							<p>There are no services to choose yet. You get every notice.</p>
						)}
						<SubmitButton className={buttonClass}>Save services</SubmitButton>
					</form>
				</NoticeCard>
			) : (
				<NoticeCard title="This link is invalid">
					<p>The link is invalid or the subscription was removed.</p>
				</NoticeCard>
			)}
			<Link href="/" className="text-sm text-muted hover:text-fg">
				← Back to status
			</Link>
		</PublicPage>
	);
}
