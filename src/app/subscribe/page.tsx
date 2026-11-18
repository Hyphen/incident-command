import type { Metadata } from "next";
import Link from "next/link";
import { NoticeCard } from "@/components/status/notice";
import { PublicPage } from "@/components/status/page-shell";
import { SubscribeForm } from "@/components/status/subscribe-form";
import { getApp } from "@/lib/app";
import type { SubscriberType } from "@/lib/domain/types";
import { resolveFlash } from "@/lib/flash";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribe to updates" };

/** The text after a confirmation was sent through each channel. */
const SENT: Record<SubscriberType, { title: string; text: string }> = {
	email: {
		title: "Check your inbox",
		text: "We sent you a confirmation link. Click it to start receiving updates.",
	},
	sms: {
		title: "Check your phone",
		text: "We texted you a confirmation link. Open it to start receiving updates.",
	},
	webhook: {
		title: "Check your webhook",
		text: "We posted a confirmation link to your webhook. Open it to start receiving updates.",
	},
};

const TARGET_NAMES: Record<SubscriberType, string> = {
	email: "email address",
	sms: "phone number",
	webhook: "webhook URL",
};

interface Props {
	searchParams: Promise<{ status?: string; error?: string; channel?: string }>;
}

export default async function SubscribePage({ searchParams }: Props) {
	const { status, error: errorToken, channel: requested } = await searchParams;
	const { error } = resolveFlash({ error: errorToken });
	const { services } = await getApp();
	const [settings, channels] = await Promise.all([
		services.settings.get(),
		services.subscribers.channels(),
	]);
	const channel =
		channels.find((option) => option === requested) ?? channels[0];

	let body = (
		<NoticeCard title="Subscriptions are not available">
			<p>This status page does not offer updates right now.</p>
		</NoticeCard>
	);
	if (channel && status === "confirmation_sent") {
		body = (
			<NoticeCard title={SENT[channel].title}>
				<p>{SENT[channel].text}</p>
			</NoticeCard>
		);
	} else if (channel && status === "already_subscribed") {
		body = (
			<NoticeCard title="You're already subscribed">
				<p>That {TARGET_NAMES[channel]} already receives updates.</p>
			</NoticeCard>
		);
	} else if (channel) {
		body = (
			<NoticeCard title={`Get ${settings.siteName} updates`}>
				<p>
					We'll notify you when we create, update or resolve an incident or
					schedule maintenance.
				</p>
				{error && (
					<p
						role="alert"
						className="rounded-lg border border-major/40 px-3 py-2 text-sm text-major"
					>
						{error}
					</p>
				)}
				<SubscribeForm channels={channels} initial={channel} />
			</NoticeCard>
		);
	}

	return (
		<PublicPage settings={settings} canSubscribe={false}>
			{body}
			<Link href="/" className="text-sm text-muted hover:text-fg">
				← Back to status
			</Link>
		</PublicPage>
	);
}
