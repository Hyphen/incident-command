"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SendResult } from "@/app/manage/actions";
import {
	CHANNEL_NOUNS,
	DELIVERY_STATE_LABELS,
} from "@/lib/domain/delivery-text";
import type { NotificationJobView } from "@/lib/domain/types";
import { SubmitButton } from "../submit-button";
import { ProgressBar } from "./progress-bar";
import { useProgress } from "./use-progress";

function SendProgressDialog({
	dialogRef,
	jobId,
	href,
	prepare,
}: {
	dialogRef: (node: HTMLDialogElement | null) => void;
	jobId?: string;
	href?: string;
	prepare: boolean;
}) {
	const { data, error } = useProgress<{ job: NotificationJobView }>(
		jobId ? `/manage/progress/jobs/${jobId}` : undefined,
		1000,
		(body) => body.job.state === "done",
	);
	const job = data?.job;
	const done = job ? job.sent + job.failed : 0;
	const tone = job?.failed
		? "major"
		: job?.state === "done"
			? "operational"
			: "brand";
	return (
		<dialog
			ref={dialogRef}
			aria-labelledby="send-progress-title"
			aria-modal="true"
			closedby="none"
			className="ic-dialog"
			onCancel={(event) => event.preventDefault()}
		>
			<div className="space-y-4 p-5">
				<h4 id="send-progress-title" className="text-base font-semibold">
					Notification status
				</h4>
				{prepare && !job && (
					<p className="text-sm text-muted">
						The server prepares the notifications.
					</p>
				)}
				{job && (
					<>
						<p className="text-sm">
							Notifications complete: {done} of {job.total}.
						</p>
						<ProgressBar value={done} max={job.total} tone={tone} />
						<ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
							{job.deliveries.map((row) => (
								<li
									key={row.id}
									className="flex items-center justify-between gap-3"
								>
									<span>
										{row.label ??
											`${CHANNEL_NOUNS[row.channel]} ${row.order + 1}`}
									</span>
									<span className="text-muted">
										{DELIVERY_STATE_LABELS[row.state]}
									</span>
								</li>
							))}
						</ul>
						{job.truncated && (
							<p className="text-xs text-muted">
								The list shows the first 200 notifications.
							</p>
						)}
						{job.state === "active" && (
							<p className="text-sm text-muted">
								You can leave this page. The server continues to send the
								notifications.
							</p>
						)}
						{job.state === "done" && job.failed === 0 && (
							<p className="text-sm">All notifications were sent.</p>
						)}
						{job.state === "done" && job.failed > 0 && (
							<p className="text-sm">
								Some notifications failed. Sent: {job.sent}. Failed:{" "}
								{job.failed}.
							</p>
						)}
					</>
				)}
				{error && (
					<p role="alert" className="text-sm">
						The page cannot read the status. The server continues to send the
						notifications.
					</p>
				)}
				{(job?.state === "done" || error) && href && (
					<a href={href} className="text-sm underline">
						Continue
					</a>
				)}
			</div>
		</dialog>
	);
}

/**
 * Submits a notify form. With no queue, a window shows each notification.
 * With a queue, the form action opens the incident dashboard.
 */
export function SendButton({
	modal,
	progressAction,
	formAction,
	className,
	children,
}: {
	modal: boolean;
	progressAction: (form: FormData) => Promise<SendResult>;
	formAction?: (form: FormData) => void | Promise<void>;
	className: string;
	children: ReactNode;
}) {
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
	const [jobId, setJobId] = useState<string | undefined>();
	const [href, setHref] = useState<string | undefined>();
	const [prepare, setPrepare] = useState(false);
	const [failure, setFailure] = useState<{ error: unknown }>();

	useEffect(() => {
		const form = buttonRef.current?.form;
		if (!form || !modal || dialog === null) {
			return;
		}
		const onSubmit = (event: SubmitEvent) => {
			if (event.submitter !== buttonRef.current) {
				return;
			}
			event.preventDefault();
			setJobId(undefined);
			setHref(undefined);
			setPrepare(true);
			dialog.showModal();
			const data = new FormData(form);
			void progressAction(data).then(
				(result) => {
					setJobId(result.jobId);
					setHref(result.href);
				},
				(error: unknown) => {
					dialog.close();
					setFailure({ error });
				},
			);
		};
		form.addEventListener("submit", onSubmit);
		return () => form.removeEventListener("submit", onSubmit);
	}, [modal, progressAction, dialog]);

	// A form action gives its failure to the page. This call must do the same.
	// Next.js opens the page of a redirect, and the error page shows other failures.
	if (failure) {
		throw failure.error;
	}

	if (!modal) {
		return (
			<SubmitButton className={className} formAction={formAction}>
				{children}
			</SubmitButton>
		);
	}

	return (
		<>
			<button
				ref={buttonRef}
				type="submit"
				className={className}
				formAction={formAction}
			>
				{children}
			</button>
			<SendProgressDialog
				dialogRef={setDialog}
				jobId={jobId}
				href={href}
				prepare={prepare}
			/>
		</>
	);
}
