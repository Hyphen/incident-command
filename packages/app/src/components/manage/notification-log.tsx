import { LocalTime } from "@/components/time";
import { EVENT_STATUS_LABELS } from "@/lib/domain/status";
import type { NotificationLog } from "@/lib/domain/types";
import { LogEntryStatus } from "./notification-log-entry";
import { Card, EmptyState } from "./ui";

/**
 * The notification log of one incident.
 * Each record is one send. The newest record is first.
 */
export function NotificationLogCard({ log }: { log: NotificationLog }) {
	return (
		<Card
			title="Notification log"
			description="The log has one record for each post that notified subscribers. The portal keeps each record for 30 days."
		>
			{log.entries.length === 0 ? (
				<EmptyState>
					The log is empty. No post notified subscribers in the last 30 days.
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
			{log.truncated && (
				<p className="mt-4 text-sm text-muted">
					The log shows the newest 50 records.
				</p>
			)}
			<p className="mt-4 text-xs text-muted">
				A post has no record when the author did not notify subscribers, or when
				no subscriber can receive the notification.
			</p>
		</Card>
	);
}
