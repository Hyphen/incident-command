import type { PublicNotificationProvider } from "@/lib/domain/types";
import type {
	ChannelDefinition,
	ProviderDefinition,
} from "@/lib/notifications/catalog";
import { Field, inputClass } from "./ui";

/** The settings fields of a provider, for the add form and the edit form. */
export function ProviderFields({
	idPrefix,
	channel,
	definition,
	provider,
	canStoreSecrets,
}: {
	idPrefix: string;
	channel: ChannelDefinition;
	definition: ProviderDefinition;
	provider?: PublicNotificationProvider;
	canStoreSecrets: boolean;
}) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<Field label="Name" htmlFor={`${idPrefix}-name`}>
				<input
					id={`${idPrefix}-name`}
					name="name"
					required
					maxLength={80}
					defaultValue={provider?.name ?? definition.label}
					className={inputClass}
				/>
			</Field>
			{channel.sender && (
				<Field
					label={channel.sender.label}
					htmlFor={`${idPrefix}-from`}
					hint="Optional. Leave empty to use the sender of the channel."
				>
					<input
						id={`${idPrefix}-from`}
						name="from"
						maxLength={200}
						defaultValue={provider?.from}
						placeholder={channel.sender.placeholder}
						className={inputClass}
					/>
				</Field>
			)}
			{definition.fields.map((field) => {
				const id = `${idPrefix}-${field.key}`;
				const saved = provider?.savedSecrets.includes(field.key) ?? false;
				if (!field.secret) {
					return (
						<Field
							key={field.key}
							label={field.label}
							htmlFor={id}
							hint={field.hint}
						>
							<input
								id={id}
								name={`field_${field.key}`}
								required={field.required}
								pattern={field.pattern}
								defaultValue={provider?.options[field.key]}
								placeholder={field.placeholder}
								className={inputClass}
							/>
						</Field>
					);
				}
				return (
					<Field
						key={field.key}
						label={field.label}
						htmlFor={id}
						hint={
							canStoreSecrets
								? field.hint
								: "Set ENCRYPTION_KEY on the server to save credentials."
						}
					>
						<input
							id={id}
							name={`field_${field.key}`}
							type="password"
							autoComplete="new-password"
							required={field.required && !saved && canStoreSecrets}
							disabled={!canStoreSecrets}
							placeholder={
								saved ? "Saved. Leave empty to keep it." : field.placeholder
							}
							className={inputClass}
						/>
						{saved && !field.required && (
							<label className="flex items-center gap-2 text-xs text-muted">
								<input
									type="checkbox"
									name="clear"
									value={field.key}
									className="size-3.5 accent-brand"
								/>
								Remove the saved {field.label.toLowerCase()}
							</label>
						)}
					</Field>
				);
			})}
		</div>
	);
}
