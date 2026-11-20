import Link from "next/link";
import { LocalTime } from "@/components/time";
import { DRAFT_LABELS } from "@/lib/domain/status";
import type { NotificationDraft } from "@/lib/domain/types";
import type { Services } from "@/lib/services";
import { draftPath } from "@/lib/services/drafts";

export interface DraftItem {
	draft: NotificationDraft;
	title: string;
}

/** Adds a title to each draft. A new event uses its title. An update uses the incident title. */
export async function draftItems(
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

/** A list of pending drafts. Each row is one link, and the row shows Review. */
export function DraftList({ items }: { items: DraftItem[] }) {
	return (
		<ul className="space-y-2">
			{items.map(({ draft, title }) => (
				<li key={draft.id}>
					<Link
						href={draftPath(draft.id)}
						className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border border-l-4 border-l-degraded bg-bg py-3 pr-4 pl-4 outline-none transition-colors hover:border-brand hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
					>
						<span className="min-w-0">
							<span className="block font-medium break-words">{title}</span>
							<span className="mt-0.5 block text-xs text-muted">
								{DRAFT_LABELS[draft.action][draft.kind]} · Drafted by{" "}
								{draft.createdBy.name} · <LocalTime iso={draft.createdAt} />
							</span>
						</span>
						<span className="inline-flex shrink-0 items-center rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg">
							Review
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}
