"use client";

import { useEffect, useState } from "react";
import {
	CHANNEL_NOUNS,
	DELIVERY_FAILURE_TEXT,
	DELIVERY_STATE_LABELS,
} from "@/lib/domain/delivery-text";
import type {
	NotificationJobView,
	NotificationLogEntry,
} from "@/lib/domain/types";
import { buttonClass } from "./ui";
import { useProgress } from "./use-progress";

const POLL_MS = 2000;

/** The state sentence for one record. */
function sentence(current: {
	state: "active" | "done";
	failed: number;
}): string {
	if (current.state === "active") {
		return "The server sends the notifications now.";
	}
	if (current.failed > 0) {
		return "Some notifications failed.";
	}
	return "The server sent all the notifications.";
}

/**
 * The state of one send. An active send updates until it is done.
 * The member opens the list to see each notification.
 */
export function LogEntryStatus({ entry }: { entry: NotificationLogEntry }) {
	const [open, setOpen] = useState(false);
	const [stop, setStop] = useState(false);
	const { data, error } = useProgress<{ job: NotificationJobView }>(
		!stop && (entry.state === "active" || open)
			? `/manage/progress/jobs/${entry.id}`
			: undefined,
		POLL_MS,
		(body) => body.job.state === "done",
	);
	useEffect(() => {
		if (data?.job.state === "done") {
			setStop(true);
		}
	}, [data]);
	const current = data?.job ?? entry;
	const done = current.sent + current.failed;
	const failed = current.state === "done" && current.failed > 0;
	return (
		<div className="space-y-2">
			<p className={failed ? "text-sm text-major" : "text-sm"}>
				{sentence(current)}
			</p>
			<p className="text-sm text-muted">
				Notifications complete: {done} of {current.total}. Sent: {current.sent}.
				Failed: {current.failed}.
			</p>
			{current.fallback && (
				<p className="text-sm text-muted">
					The queue was not available. The server sent these notifications
					without the queue.
				</p>
			)}
			<button
				type="button"
				aria-expanded={open}
				className={buttonClass.ghost}
				onClick={() => setOpen((value) => !value)}
			>
				{open ? "Hide the notifications" : "Show the notifications"}
			</button>
			{open && !data?.job && !error && (
				<p className="text-sm text-muted">The page loads the notifications.</p>
			)}
			{error && (open || entry.state === "active") && (
				<p role="alert" className="text-sm">
					The page cannot read the notifications. Reload the page.
				</p>
			)}
			{open && data?.job && (
				<>
					<ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
						{data.job.deliveries.map((row) => (
							<li key={row.id} className="space-y-1">
								<div className="flex items-center justify-between gap-3">
									<span>
										{row.label ??
											`${CHANNEL_NOUNS[row.channel]} ${row.order + 1}`}
									</span>
									<span className="text-muted">
										{DELIVERY_STATE_LABELS[row.state]}
									</span>
								</div>
								{row.error && (
									<p className="text-xs text-muted">
										{DELIVERY_FAILURE_TEXT[row.error]}
									</p>
								)}
							</li>
						))}
					</ul>
					{data.job.truncated && (
						<p className="text-xs text-muted">
							The list shows the first 200 notifications.
						</p>
					)}
				</>
			)}
		</div>
	);
}
