import type { Metadata } from "next";
import Link from "next/link";
import { ChannelForm } from "@/components/status/channel-form";
import { NoticeCard } from "@/components/status/notice";
import { PublicPage } from "@/components/status/page-shell";
import { getApp } from "@/lib/app";
import type { SubscriberType } from "@/lib/domain/types";
import { FEED_PATH } from "@/lib/feed";
import { resolveFlash } from "@/lib/flash";
import { subscribeAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribe to updates" };

/** A feed reader gets the updates without an email address. */
function FeedHint() {
	return (
		<p className="text-sm">
			To use a feed reader, follow the{" "}
			<a href={FEED_PATH} className="underline hover:text-fg">
				RSS feed
			</a>
			.
		</p>
	);
}

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

/** The hint under the field of each channel. */
const HINTS: Record<SubscriberType, string> = {
	email: "We email you a confirmation link.",
	sms: "Include the country code. We text you a confirmation link.",
	webhook:
		"Slack, Discord or any JSON endpoint. We post a confirmation link to it.",
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
	const [settings, channels, catalog] = await Promise.all([
		services.settings.get(),
		services.subscribers.channels(),
		services.catalog.list({ includeHidden: false }),
	]);
	const channel =
		channels.find((option) => option === requested) ?? channels[0];

	let body = (
		<NoticeCard title="Subscriptions are not available">
			<p>This status page does not offer updates right now.</p>
			<FeedHint />
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
				<ChannelForm
					action={subscribeAction}
					available={channels}
					initial={channel}
					submitLabel="Subscribe"
					hints={HINTS}
					services={catalog}
				/>
				<div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-4">
					<FeedHint />
					<p className="text-sm">
						To stop updates,{" "}
						<Link
							href="/subscribe/unsubscribe"
							className="underline hover:text-fg"
						>
							unsubscribe
						</Link>
						.
					</p>
				</div>
			</NoticeCard>
		);
	}

	// This page is the subscribe form, so the header has no subscribe button.
	return (
		<PublicPage settings={settings} canSubscribe={false} narrow>
			{body}
			<Link href="/" className="text-sm text-muted hover:text-fg">
				← Back to status
			</Link>
		</PublicPage>
	);
}
