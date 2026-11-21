"use client";

import { useCallback, useState } from "react";
import { deleteIncidentAction } from "@/app/manage/actions";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, Field, inputClass } from "./ui";

/** Opens a dialog that deletes an incident from the public view. */
export function DeleteIncidentDialog({ incidentId }: { incidentId: string }) {
	const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
	const onDialog = useCallback((node: HTMLDialogElement | null) => {
		setDialog(node);
	}, []);
	const titleId = "delete-incident-dialog-title";
	const closeDialog =
		dialog === null
			? undefined
			: () => {
					dialog.close();
				};
	const openDialog =
		dialog === null
			? undefined
			: () => {
					dialog.showModal();
				};
	// The action redirects to another page, and the dialog state stays.
	// Close the dialog when the action ends. A failed delete stays on this page.
	const submit =
		dialog === null
			? deleteIncidentAction
			: async (formData: FormData) => {
					try {
						await deleteIncidentAction(formData);
					} finally {
						dialog.close();
					}
				};

	return (
		<>
			<button
				type="button"
				className={buttonClass.danger}
				onClick={openDialog}
				disabled={dialog === null}
			>
				Delete incident
			</button>
			<dialog
				ref={onDialog}
				aria-labelledby={titleId}
				aria-modal="true"
				closedby="any"
				className="ic-dialog"
			>
				<form action={submit} className="space-y-4 p-5">
					<h4 id={titleId} className="text-base font-semibold">
						Delete this incident from the public view
					</h4>
					<p className="text-sm">
						This action removes the incident from the public view only. The
						portal keeps the incident and its posts.
					</p>
					<p className="text-sm">
						The portal records who deleted the incident and why. A member can
						read that record later.
					</p>
					<Field
						label="Reason"
						htmlFor="delete-reason"
						hint="Tell the other members why you delete this incident. Use 1000 characters or fewer."
					>
						<textarea
							id="delete-reason"
							name="reason"
							required
							maxLength={1000}
							rows={4}
							className={inputClass}
						/>
					</Field>
					<input type="hidden" name="id" value={incidentId} />
					<div className="flex flex-wrap items-center justify-end gap-2">
						<button
							type="button"
							className={buttonClass.secondary}
							onClick={closeDialog}
						>
							Cancel
						</button>
						<SubmitButton className={buttonClass.danger}>
							Delete from the public view
						</SubmitButton>
					</div>
				</form>
			</dialog>
		</>
	);
}
