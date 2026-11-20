"use server";

import { redirect } from "next/navigation";
import { getApp } from "@/lib/app";
import { isAppError } from "@/lib/errors";
import { flash, flashCodeForError } from "@/lib/flash";
import { list } from "@/lib/manage/forms";

export async function subscribeAction(formData: FormData): Promise<void> {
	const { services } = await getApp();
	const type = String(formData.get("type") ?? "");
	// After the redirect, the page opens the same channel again.
	const page = type
		? `/subscribe?channel=${encodeURIComponent(type)}`
		: "/subscribe";
	let outcome: string;
	try {
		outcome = await services.subscribers.subscribe({
			type,
			target: String(formData.get("target") ?? ""),
			...(formData.has("serviceIds")
				? { serviceIds: list(formData, "serviceIds") }
				: {}),
		});
	} catch (error) {
		if (!isAppError(error)) {
			throw error;
		}
		redirect(flash(page, flashCodeForError(error)));
	}
	redirect(`${page}&status=${outcome}`);
}

/** Removes the subscriber of the address that the visitor entered. */
export async function unsubscribeAddressAction(
	formData: FormData,
): Promise<void> {
	const { services } = await getApp();
	const type = String(formData.get("type") ?? "");
	try {
		await services.subscribers.unsubscribeAddress({
			type,
			target: String(formData.get("target") ?? ""),
		});
	} catch (error) {
		if (!isAppError(error)) {
			throw error;
		}
		const page = type
			? `/subscribe/unsubscribe?channel=${encodeURIComponent(type)}`
			: "/subscribe/unsubscribe";
		redirect(flash(page, flashCodeForError(error)));
	}
	redirect("/subscribe/unsubscribe?done=1");
}

/** Saves the services that notify the subscriber of this token. */
export async function updateServicesAction(formData: FormData): Promise<void> {
	const { services } = await getApp();
	const token = String(formData.get("token") ?? "");
	const page = `/subscribe/services?token=${encodeURIComponent(token)}`;
	let saved = false;
	try {
		saved = await services.subscribers.updateOwnServices(
			token,
			list(formData, "serviceIds"),
		);
	} catch (error) {
		if (!isAppError(error)) {
			throw error;
		}
		redirect(flash(page, flashCodeForError(error)));
	}
	redirect(saved ? flash(page, "services_saved") : "/subscribe/services");
}

export async function unsubscribeAction(formData: FormData): Promise<void> {
	const { services } = await getApp();
	await services.subscribers.unsubscribe(String(formData.get("token") ?? ""));
	redirect("/subscribe/unsubscribe?done=1");
}
