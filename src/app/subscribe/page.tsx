import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoticeCard } from "@/components/status/notice";
import { PublicPage } from "@/components/status/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { getApp } from "@/lib/app";
import { resolveFlash } from "@/lib/flash";
import { subscribeAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribe to updates" };

interface Props {
	searchParams: Promise<{ status?: string; error?: string; incident?: string }>;
}

export default async function SubscribePage({ searchParams }: Props) {
	const {
		status,
		error: errorToken,
		incident: incidentId,
	} = await searchParams;
	const { error } = resolveFlash({ error: errorToken });
	const { services } = await getApp();
	const [settings, canSubscribe, incident] = await Promise.all([
		services.settings.get(),
		services.subscribers.canSubscribe(),
		incidentId ? services.incidents.find(incidentId) : undefined,
	]);
	if (incidentId && !incident) {
		notFound();
	}
	const maintenance = incident?.kind === "maintenance";

	let body = (
		<NoticeCard
			title={
				incident
					? `Get updates for ${incident.title}`
					: `Get ${settings.siteName} updates`
			}
		>
			<p>
				{incident
					? `We'll email you only when we update or ${maintenance ? "complete this maintenance" : "resolve this incident"}.`
					: "We'll email you when we create, update or resolve an incident or schedule maintenance."}
			</p>
			{error && (
				<p
					role="alert"
					className="rounded-lg border border-major/40 px-3 py-2 text-sm text-major"
				>
					{error}
				</p>
			)}
			<form
				action={subscribeAction}
				className="flex flex-col gap-3 sm:flex-row"
			>
				{incident && (
					<input type="hidden" name="incidentId" value={incident.id} />
				)}
				<label htmlFor="email" className="sr-only">
					Email address
				</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					placeholder="you@example.com"
					className="min-w-0 flex-1 rounded-full border border-border bg-bg px-4 py-2 text-fg"
				/>
				<SubmitButton className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50">
					Subscribe
				</SubmitButton>
			</form>
		</NoticeCard>
	);
	if (!canSubscribe) {
		body = (
			<NoticeCard title="Subscriptions are not available">
				<p>This status page does not offer email updates right now.</p>
			</NoticeCard>
		);
	} else if (status === "confirmation_sent") {
		body = (
			<NoticeCard title="Check your inbox">
				<p>
					We sent you a confirmation link. Click it to start receiving updates
					{incident ? ` for ${incident.title}` : ""}.
				</p>
			</NoticeCard>
		);
	} else if (status === "already_subscribed") {
		body = (
			<NoticeCard title="You're already subscribed">
				<p>
					That address already receives{" "}
					{incident ? `updates for ${incident.title}` : "updates"}.
				</p>
			</NoticeCard>
		);
	}

	return (
		<PublicPage settings={settings} canSubscribe={false}>
			{body}
			{incident ? (
				<Link
					href={`/incidents/${incident.id}`}
					className="text-sm text-muted hover:text-fg"
				>
					← Back to {maintenance ? "maintenance" : "incident"}
				</Link>
			) : (
				<Link href="/" className="text-sm text-muted hover:text-fg">
					← Back to status
				</Link>
			)}
		</PublicPage>
	);
}
