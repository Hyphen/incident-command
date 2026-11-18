import type { Metadata } from "next";
import Link from "next/link";
import { ChannelForm } from "@/components/status/channel-form";
import { NoticeCard } from "@/components/status/notice";
import { PublicPage } from "@/components/status/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getApp } from "@/lib/app";
import type { SubscriberType } from "@/lib/domain/types";
import { resolveFlash } from "@/lib/flash";
import { unsubscribeAction, unsubscribeAddressAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe" };

/** A visitor can leave each channel, also a channel that is off now. */
const ALL_CHANNELS: readonly SubscriberType[] = ["email", "sms", "webhook"];

const HINTS: Record<SubscriberType, string> = {
	email: "The email address that gets updates.",
	sms: "The phone number that gets updates, with the country code.",
	webhook: "The webhook URL that gets updates.",
};

const buttonClass =
	"inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50";

export default async function UnsubscribePage({
	searchParams,
}: {
	searchParams: Promise<{
		token?: string;
		done?: string;
		error?: string;
		channel?: string;
	}>;
}) {
	const { token, done, error: errorToken, channel } = await searchParams;
	const { error } = resolveFlash({ error: errorToken });
	const { services } = await getApp();
	const [settings, canSubscribe] = await Promise.all([
		services.settings.get(),
		services.subscribers.canSubscribe(),
	]);
	const initial = ALL_CHANNELS.find((option) => option === channel) ?? "email";

	let body = (
		<NoticeCard title="Unsubscribe from updates">
			<p>
				Choose the channel and enter the address that gets {settings.siteName}{" "}
				updates.
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
				action={unsubscribeAddressAction}
				available={ALL_CHANNELS}
				initial={initial}
				submitLabel="Unsubscribe"
				hints={HINTS}
			/>
		</NoticeCard>
	);
	if (done) {
		body = (
			<NoticeCard title="You've been unsubscribed">
				<p>You will no longer receive {settings.siteName} updates.</p>
			</NoticeCard>
		);
	} else if (token) {
		// The link in an email holds the token of the subscriber.
		body = (
			<NoticeCard title="Unsubscribe from updates">
				<p>
					Stop receiving incident and maintenance emails from{" "}
					{settings.siteName}.
				</p>
				<form action={unsubscribeAction}>
					<input type="hidden" name="token" value={token} />
					<SubmitButton className={buttonClass}>Unsubscribe</SubmitButton>
				</form>
			</NoticeCard>
		);
	}

	return (
		<PublicPage settings={settings} canSubscribe={canSubscribe}>
			{body}
			<Link href="/" className="text-sm text-muted hover:text-fg">
				← Back to status
			</Link>
		</PublicPage>
	);
}
