"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { SubscriberType } from "@/lib/domain/types";

/** The order of the channels on the public forms. */
const CHANNEL_ORDER: readonly SubscriberType[] = ["email", "sms", "webhook"];

/** The field of each channel. The browser checks the value before a submit. */
const CHANNEL_FIELDS: Record<
	SubscriberType,
	{
		title: string;
		label: string;
		inputType: "url" | "email" | "tel";
		placeholder: string;
		autoComplete: "url" | "email" | "tel";
		pattern?: string;
		patternTitle?: string;
	}
> = {
	email: {
		title: "Email",
		label: "Email address",
		inputType: "email",
		placeholder: "you@example.com",
		autoComplete: "email",
	},
	sms: {
		title: "Text message",
		label: "Phone number",
		inputType: "tel",
		placeholder: "+15551234567",
		autoComplete: "tel",
		// The server removes spaces, dashes, dots and parentheses before it checks E.164.
		pattern: "\\+[1-9][0-9 \\(\\)\\-\\.]{6,24}",
		patternTitle:
			"Use a phone number with the country code, such as +15551234567",
	},
	webhook: {
		title: "Webhook",
		label: "Webhook URL",
		inputType: "url",
		placeholder: "https://hooks.slack.com/services/…",
		autoComplete: "url",
		pattern: "https?://.+",
		patternTitle: "Use an http or https URL",
	},
};

/** The track of the channel choice. On a phone it has the full width. */
const trackClass =
	"flex rounded-full border border-border bg-bg p-1 sm:inline-flex";
const optionClass =
	"flex-auto truncate rounded-full px-2 py-1.5 text-center text-sm font-medium sm:px-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand";
const selectedClass = "cursor-pointer bg-brand text-brand-fg";
const idleClass = "cursor-pointer text-muted hover:text-fg";
const disabledClass = "cursor-not-allowed text-muted opacity-50";

/**
 * A public form for one address of a channel. The field follows the selected
 * channel. With more than one channel in `available`, the form shows a choice
 * of email, text message and webhook. A channel that is not in `available`
 * cannot be selected. With one channel, the form shows only its field.
 */
export function ChannelForm({
	action,
	available,
	initial,
	submitLabel,
	hints,
}: {
	action: (formData: FormData) => Promise<void>;
	available: readonly SubscriberType[];
	initial: SubscriberType;
	submitLabel: string;
	hints: Record<SubscriberType, string>;
}) {
	const [type, setType] = useState(initial);
	const field = CHANNEL_FIELDS[type];
	return (
		<form action={action} className="space-y-5 pt-2">
			{available.length > 1 ? (
				<fieldset>
					<legend className="sr-only">Channel</legend>
					<div className={trackClass}>
						{CHANNEL_ORDER.map((option) => {
							const disabled = !available.includes(option);
							const selected = type === option;
							return (
								<label
									key={option}
									title={disabled ? "Not available" : undefined}
									className={`${optionClass} ${
										disabled
											? disabledClass
											: selected
												? selectedClass
												: idleClass
									}`}
								>
									<input
										type="radio"
										name="type"
										value={option}
										checked={selected}
										disabled={disabled}
										onChange={() => setType(option)}
										className="sr-only"
									/>
									{CHANNEL_FIELDS[option].title}
								</label>
							);
						})}
					</div>
				</fieldset>
			) : (
				<input type="hidden" name="type" value={type} />
			)}
			<div
				key={type}
				className="grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto]"
			>
				<label
					htmlFor="channel-target"
					className="text-sm font-medium text-fg sm:col-span-2"
				>
					{field.label}
				</label>
				<input
					id="channel-target"
					name="target"
					type={field.inputType}
					required
					placeholder={field.placeholder}
					autoComplete={field.autoComplete}
					pattern={field.pattern}
					title={field.patternTitle}
					aria-describedby="channel-hint"
					className="min-w-0 rounded-full border border-border bg-bg px-4 py-2 text-fg"
				/>
				{/* On a phone, the hint stays below the field and above the button. */}
				<p id="channel-hint" className="text-xs text-muted sm:col-start-1">
					{hints[type]}
				</p>
				<SubmitButton className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50 sm:col-start-2 sm:row-start-2 sm:mt-0">
					{submitLabel}
				</SubmitButton>
			</div>
		</form>
	);
}
