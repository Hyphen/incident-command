"use server";

import { redirect } from "next/navigation";
import { getApp } from "@/lib/app";
import { isAppError } from "@/lib/errors";
import { flash, flashCodeForError } from "@/lib/flash";

/** Adds the `incident` query value to a path, when the form has an incident. */
function withIncident(path: string, incidentId: string): string {
	return incidentId
		? `${path}?incident=${encodeURIComponent(incidentId)}`
		: path;
}

/** Appends one query value to a path that may already have a query. */
function withQuery(path: string, query: string): string {
	return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

export async function subscribeAction(formData: FormData): Promise<void> {
	const { services } = await getApp();
	const incidentId = String(formData.get("incidentId") ?? "");
	const page = withIncident("/subscribe", incidentId);
	let outcome: string;
	try {
		outcome = await services.subscribers.subscribe({
			email: String(formData.get("email") ?? ""),
			incidentId,
		});
	} catch (error) {
		if (!isAppError(error)) {
			throw error;
		}
		redirect(flash(page, flashCodeForError(error)));
	}
	redirect(withQuery(page, `status=${outcome}`));
}

export async function unsubscribeAction(formData: FormData): Promise<void> {
	const { services } = await getApp();
	const incidentId = String(formData.get("incidentId") ?? "");
	await services.subscribers.unsubscribe(
		String(formData.get("token") ?? ""),
		incidentId || undefined,
	);
	redirect(
		withQuery(withIncident("/subscribe/unsubscribe", incidentId), "done=1"),
	);
}
