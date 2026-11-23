import { LocalTime } from "@/components/time";
import { EVENT_STATUS_LABELS } from "@/lib/domain/status";
import type { NotificationLog } from "@/lib/domain/types";
import { LogEntryStatus } from "./notification-log-entry";
import { buttonClass, Card, EmptyState, Field, inputClass } from "./ui";

/**
 * The notification log of one incident.
 * Each record is one send. The newest record is first.
 */
export function NotificationLogCard({
	incidentId,
	log,
}: {
	incidentId: string;
	log: NotificationLog;
}) {
	const pageCount = Math.ceil(log.total / log.pageSize);
	const showPages = pageCount > 1 || log.page > 1;
	return (
		<Card
			title="Notification log"
			description="The log has one record for each post that notified subscribers. The portal keeps each record for 30 days."
		>
			<form
				action={`/manage/incidents/${incidentId}`}
				method="get"
				className="mb-4 flex flex-wrap items-end gap-3"
			>
				<input type="hidden" name="tab" value="notifications" />
				<div className="min-w-48 flex-1">
					<Field
						label="Search"
						htmlFor="notification-log-search"
						hint="The search matches the title, the status, or the author."
					>
						<input
							id="notification-log-search"
							name="q"
							type="search"
							defaultValue={log.query}
							maxLength={200}
							className={inputClass}
						/>
					</Field>
				</div>
				<button type="submit" className={buttonClass.secondary}>
					Search
				</button>
				{log.query ? (
					<a href={logHref(incidentId, 1, "")} className={buttonClass.ghost}>
						Clear the search
					</a>
				) : null}
			</form>
			{log.entries.length === 0 ? (
				<EmptyState>
					{log.query
						? "No record matches the search."
						: log.page > 1
							? "This page has no records."
							: "The log is empty. No post notified subscribers in the last 30 days."}
				</EmptyState>
			) : (
				<ul className="divide-y divide-border">
					{log.entries.map((entry) => (
						<li key={entry.id} className="space-y-2 py-3">
							{entry.post ? (
								<>
									<p className="text-sm font-semibold">
										{EVENT_STATUS_LABELS[entry.post.status]}
									</p>
									<p className="text-sm">{entry.post.title}</p>
								</>
							) : (
								<p className="text-sm">
									The portal cannot find the post of this record.
								</p>
							)}
							<p className="text-xs text-muted">
								<LocalTime iso={entry.createdAt} />
								{entry.post ? ` · ${entry.post.author.name}` : null}
							</p>
							<LogEntryStatus entry={entry} />
						</li>
					))}
				</ul>
			)}
			{showPages && (
				<nav
					aria-label="Pages"
					className="mt-4 flex flex-wrap items-center gap-3 text-sm"
				>
					{log.page > 1 && (
						<a
							href={logHref(incidentId, log.page - 1, log.query)}
							className="text-brand"
						>
							Previous page
						</a>
					)}
					{pageCount > 0 && (
						<span>
							Page {log.page} of {pageCount}.
						</span>
					)}
					{log.page * log.pageSize < log.total && (
						<a
							href={logHref(incidentId, log.page + 1, log.query)}
							className="text-brand"
						>
							Next page
						</a>
					)}
				</nav>
			)}
			<p className="mt-4 text-xs text-muted">
				A post has no record when the author did not notify subscribers, or when
				no subscriber can receive the notification.
			</p>
		</Card>
	);
}

function logHref(incidentId: string, page: number, query: string): string {
	const params = new URLSearchParams();
	params.set("tab", "notifications");
	if (query) {
		params.set("q", query);
	}
	if (page > 1) {
		params.set("page", String(page));
	}
	return `/manage/incidents/${incidentId}?${params.toString()}`;
}
