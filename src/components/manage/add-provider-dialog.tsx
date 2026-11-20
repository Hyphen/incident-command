"use client";

import { useCallback, useState } from "react";
import { addNotificationProviderAction } from "@/app/manage/actions";
import { SubmitButton } from "@/components/submit-button";
import type { NotificationChannel, ProviderType } from "@/lib/domain/types";
import { type ChannelDefinition, PROVIDERS } from "@/lib/notifications/catalog";
import { ProviderFields } from "./provider-fields";
import { buttonClass } from "./ui";

/** Opens a dialog that adds one provider to a channel. */
export function AddProviderDialog({
	channelId,
	definition,
	canStoreSecrets,
}: {
	channelId: NotificationChannel;
	definition: ChannelDefinition;
	canStoreSecrets: boolean;
}) {
	const initial = definition.providers[0] as ProviderType;
	const [type, setType] = useState(initial);
	const [formKey, setFormKey] = useState(0);
	const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
	const onDialog = useCallback((node: HTMLDialogElement | null) => {
		setDialog(node);
	}, []);
	const provider = PROVIDERS[type];
	const titleId = `${channelId}-add-provider-title`;
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
	const reset = () => {
		setType(initial);
		setFormKey((key) => key + 1);
	};

	return (
		<>
			<button
				type="button"
				className={buttonClass.primary}
				onClick={openDialog}
				disabled={dialog === null}
			>
				Add provider <span className="sr-only">for {definition.label}</span>
			</button>
			<dialog
				ref={onDialog}
				aria-labelledby={titleId}
				aria-modal="true"
				closedby="any"
				className="ic-dialog"
				onClose={reset}
			>
				<form
					key={formKey}
					action={addNotificationProviderAction}
					className="space-y-4 p-5"
				>
					<div className="flex items-start justify-between gap-3">
						<h4 id={titleId} className="text-base font-semibold">
							Add a provider
						</h4>
						<button
							type="button"
							className={buttonClass.ghost}
							onClick={closeDialog}
						>
							Close
						</button>
					</div>
					<fieldset className="space-y-1.5">
						<legend className="text-sm font-medium">Provider</legend>
						<div className="grid gap-3 sm:grid-cols-2">
							{definition.providers.map((providerType) => {
								const option = PROVIDERS[providerType];
								const selected = type === providerType;
								return (
									<label
										key={providerType}
										className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
											selected
												? "border-brand bg-brand/10"
												: "border-border bg-bg hover:bg-surface-muted"
										}`}
									>
										<input
											type="radio"
											name={`${channelId}-provider-choice`}
											value={providerType}
											checked={selected}
											onChange={() => setType(providerType)}
											className="mt-0.5 size-4 shrink-0 accent-brand"
										/>
										<span className="min-w-0">
											<span className="block font-medium">{option.label}</span>
											<span className="block text-xs text-muted">
												{option.description}
											</span>
										</span>
									</label>
								);
							})}
						</div>
					</fieldset>
					<input type="hidden" name="channel" value={channelId} />
					<input type="hidden" name="type" value={type} />
					<ProviderFields
						key={type}
						idPrefix={`${channelId}-add-${type}`}
						channel={definition}
						definition={provider}
						canStoreSecrets={canStoreSecrets}
					/>
					<div className="flex flex-wrap items-center justify-end gap-2">
						<button
							type="button"
							className={buttonClass.secondary}
							onClick={closeDialog}
						>
							Cancel
						</button>
						<SubmitButton className={buttonClass.primary}>
							Add {provider.label}
						</SubmitButton>
					</div>
				</form>
			</dialog>
		</>
	);
}
