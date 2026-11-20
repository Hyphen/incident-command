import type { Metadata } from "next";
import Link from "next/link";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { Card, EmptyState } from "@/components/manage/ui";
import { LocalTime } from "@/components/time";
import { requireMember } from "@/lib/auth";
import { DRAFT_LABELS, DRAFT_STATE_LABELS } from "@/lib/domain/status";
import type { NotificationDraft } from "@/lib/domain/types";
import type { Services } from "@/lib/services";
import { draftPath } from "@/lib/services/drafts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notification drafts" };

interface DraftItem {
	draft: NotificationDraft;
	title: string;
}

/** Adds a title to each draft: the new event title, or the title of the incident to update. */
async function withTitles(
	services: Services,
	drafts: NotificationDraft[],
): Promise<DraftItem[]> {
	return Promise.all(
		drafts.map(async (draft) => ({
			draft,
			title:
				draft.content.title ??
				(await services.incidents.find(draft.incidentId as string))?.title ??
				"Deleted incident",
		})),
	);
}

/**
 * Lists drafts. Each row is one link. A pending row shows Review.
 * A reviewed row shows its state.
 */
function DraftList({ items, empty }: { items: DraftItem[]; empty: string }) {
	if (items.length === 0) {
		return <EmptyState>{empty}</EmptyState>;
	}
	return (
		<ul className="space-y-2">
			{items.map(({ draft, title }) => {
				const pending = draft.state === "pending";
				return (
					<li key={draft.id}>
						<Link
							href={draftPath(draft.id)}
							className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border border-l-4 bg-bg py-3 pr-4 pl-4 outline-none transition-colors hover:border-brand hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${pending ? "border-l-degraded" : "border-l-border"}`}
						>
							<span className="min-w-0">
								<span className="block font-medium break-words">{title}</span>
								<span className="mt-0.5 block text-xs text-muted">
									{DRAFT_LABELS[draft.action][draft.kind]} · Drafted by{" "}
									{draft.createdBy.name} · <LocalTime iso={draft.createdAt} />
								</span>
							</span>
							{pending ? (
								<span className="inline-flex shrink-0 items-center rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg">
									Review
								</span>
							) : (
								<span className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
									{DRAFT_STATE_LABELS[draft.state]}
									{draft.reviewedBy && ` by ${draft.reviewedBy.name}`}
								</span>
							)}
						</Link>
					</li>
				);
			})}
		</ul>
	);
}

export default async function DraftsPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams>;
}) {
	const flash = await searchParams;
	const { services, app } = await requireMember();
	const [pending, reviewed] = await Promise.all([
		services.drafts.list({ pending: true }),
		services.drafts.list({ pending: false, limit: 50 }),
	]);
	const [pendingItems, reviewedItems] = await Promise.all([
		withTitles(services, pending),
		withTitles(services, reviewed),
	]);
	return (
		<ManagePage
			title="Notification drafts"
			flash={flash}
			health={app.store.health}
		>
			<Card title="Waiting for review">
				<p className="mb-4 text-sm text-muted">
					Agents write drafts with the draft_notification MCP tool. Nothing is
					published or sent until an editor approves a draft.
				</p>
				<DraftList items={pendingItems} empty="No drafts wait for review." />
			</Card>
			<Card title="Reviewed" description="The 50 most recent.">
				<DraftList items={reviewedItems} empty="No reviewed drafts yet." />
			</Card>
		</ManagePage>
	);
}
