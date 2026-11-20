import Link from "next/link";
import { LocalTime } from "@/components/time";
import { DRAFT_LABELS, DRAFT_STATE_LABELS } from "@/lib/domain/status";
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

/** A list of notification drafts. Each row links to the review page. */
export function DraftList({ items }: { items: DraftItem[] }) {
	return (
		<ul className="divide-y divide-border">
			{items.map(({ draft, title }) => (
				<li
					key={draft.id}
					className="flex flex-wrap items-center justify-between gap-2 py-3"
				>
					<div className="min-w-0">
						<Link
							href={draftPath(draft.id)}
							className="font-medium break-words hover:underline"
						>
							{title}
						</Link>
						<p className="text-xs text-muted">
							{DRAFT_LABELS[draft.action][draft.kind]} · Drafted by{" "}
							{draft.createdBy.name} · <LocalTime iso={draft.createdAt} />
						</p>
					</div>
					<span className="text-xs text-muted">
						{DRAFT_STATE_LABELS[draft.state]}
					</span>
				</li>
			))}
		</ul>
	);
}
