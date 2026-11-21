import type { Metadata } from "next";
import Link from "next/link";
import {
	deleteSubscriberAction,
	updateSubscriberServicesAction,
} from "@/app/manage/actions";
import { AddSubscriberForm } from "@/components/manage/add-subscriber-form";
import { ConfirmButton } from "@/components/manage/confirm-button";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { buttonClass, Card, EmptyState } from "@/components/manage/ui";
import { ServiceTags } from "@/components/service-tags";
import { SubmitButton } from "@/components/submit-button";
import { LocalTime } from "@/components/time";
import { requireMember } from "@/lib/auth";
import type { SubscriberType } from "@/lib/domain/types";
import { CHANNELS } from "@/lib/notifications/catalog";

const TYPE_LABELS: Record<SubscriberType, string> = {
	webhook: "Webhook",
	email: "Email",
	sms: "Text message",
};

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribers" };

export default async function SubscribersPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams>;
}) {
	const flash = await searchParams;
	const { actor, services, app } = await requireMember("admin");
	const [subscribers, available, catalog] = await Promise.all([
		services.subscribers.list(actor),
		services.notificationSettings.availability(),
		services.catalog.list(),
	]);
	const unavailable = (Object.keys(available) as SubscriberType[]).filter(
		(type) => !available[type],
	);
	return (
		<ManagePage title="Subscribers" flash={flash} health={app.store.health}>
			{unavailable.length > 0 && (
				<p className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm text-muted">
					These channels cannot send now:{" "}
					{unavailable.map((type) => CHANNELS[type].label).join(", ")}. Their
					subscribers get no notifications, and the public subscribe page does
					not offer them. Turn them on and add providers in{" "}
					<Link
						href="/manage/settings/notifications"
						className="underline hover:text-fg"
					>
						Settings → Notifications
					</Link>
					.
				</p>
			)}
			<Card
				title="Add a subscriber"
				description="Choose webhook, email or text message. Choose the services that send a notification."
			>
				<AddSubscriberForm available={available} services={catalog} />
			</Card>
			<Card title={`Subscribers (${subscribers.length})`}>
				{subscribers.length === 0 ? (
					<EmptyState>No subscribers yet.</EmptyState>
				) : (
					<ul className="divide-y divide-border">
						{subscribers.map((subscriber) => (
							<li key={subscriber.id} className="space-y-3 py-3">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="min-w-0">
										<p className="truncate font-medium">{subscriber.target}</p>
										<p className="text-xs text-muted">
											{TYPE_LABELS[subscriber.type]} ·{" "}
											{subscriber.confirmed
												? "Confirmed"
												: "Pending confirmation"}{" "}
											· Added <LocalTime iso={subscriber.createdAt} />
										</p>
									</div>
									<form action={deleteSubscriberAction}>
										<input type="hidden" name="id" value={subscriber.id} />
										<ConfirmButton message={`Remove ${subscriber.target}?`}>
											Remove
										</ConfirmButton>
									</form>
								</div>
								{catalog.length > 0 && (
									<form
										action={updateSubscriberServicesAction}
										className="space-y-3"
									>
										<input type="hidden" name="id" value={subscriber.id} />
										<ServiceTags
											services={catalog}
											selected={subscriber.serviceIds}
										/>
										<SubmitButton className={buttonClass.secondary}>
											Save services
										</SubmitButton>
									</form>
								)}
							</li>
						))}
					</ul>
				)}
			</Card>
		</ManagePage>
	);
}
