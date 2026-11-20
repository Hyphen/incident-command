import { LocalTime } from "@/components/time";
import { EVENT_STATUS_LABELS } from "@/lib/domain/status";
import type {
	AuthorRef,
	Incident,
	IncidentUpdate,
	NotificationDraft,
} from "@/lib/domain/types";

interface PostSource {
	updateId: string;
	approver: string;
	writer?: string;
}

/** The person who approved a published draft, and the person who wrote it. */
function sourceOf(draft: NotificationDraft): PostSource | undefined {
	if (draft.updateId === undefined) {
		return undefined;
	}
	const reviewer = draft.reviewedBy as AuthorRef;
	return {
		updateId: draft.updateId,
		approver: reviewer.name,
		...(draft.createdBy.id === reviewer.id
			? {}
			: { writer: draft.createdBy.name }),
	};
}

function credit(post: IncidentUpdate, source: PostSource | undefined): string {
	if (source) {
		const approval = `${source.approver} approved this post and sent it.`;
		return source.writer === undefined
			? approval
			: `${source.writer} wrote this post. ${approval}`;
	}
	if (post.notified === false) {
		return `${post.author.name} posted this and did not send it.`;
	}
	if (post.notified === true) {
		return `${post.author.name} posted this and sent it.`;
	}
	return `${post.author.name} posted this.`;
}

/**
 * Incident posts, newest first. Each post names the person who posted it,
 * or the person who wrote the draft and the person who approved it.
 */
export function PostList({
	incident,
	drafts,
	limit,
}: {
	incident: Incident;
	drafts: NotificationDraft[];
	/** Shows only this many posts, the newest first. */
	limit?: number;
}) {
	const sources = new Map<string, PostSource>();
	for (const draft of drafts) {
		const source = sourceOf(draft);
		if (source) {
			sources.set(source.updateId, source);
		}
	}
	const posts = [...incident.updates].reverse();
	const shown = limit === undefined ? posts : posts.slice(0, limit);
	return (
		<div>
			<ul className="divide-y divide-border">
				{shown.map((post) => (
					<li key={post.id} className="py-3">
						<p className="text-sm font-semibold">
							{EVENT_STATUS_LABELS[post.status]}
						</p>
						<p className="mt-1 whitespace-pre-wrap">{post.message}</p>
						<p className="mt-1 text-xs text-muted">
							<LocalTime iso={post.createdAt} />
						</p>
						<p className="text-xs text-muted">
							{credit(post, sources.get(post.id))}
						</p>
					</li>
				))}
			</ul>
			{limit !== undefined && posts.length > limit && (
				<p className="mt-4 text-sm text-muted">
					These are the latest {limit} of {posts.length} posts.
				</p>
			)}
		</div>
	);
}
