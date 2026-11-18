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

const optionClass =
	"rounded-full border px-4 py-1.5 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand";
const selectedClass = "cursor-pointer border-brand bg-brand text-brand-fg";
const idleClass = "cursor-pointer border-border text-muted hover:text-fg";
const disabledClass = "cursor-not-allowed border-border text-muted opacity-50";

/**
 * A public form for one address of a channel. It shows a choice of email,
 * text message and webhook. A channel that is not in `available` cannot be
 * selected. The field follows the selected channel.
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
		<form action={action} className="space-y-4">
			<fieldset className="flex flex-wrap gap-2">
				<legend className="sr-only">Channel</legend>
				{CHANNEL_ORDER.map((option) => {
					const disabled = !available.includes(option);
					const selected = type === option;
					return (
						<label
							key={option}
							title={disabled ? "Not available" : undefined}
							className={`${optionClass} ${
								disabled ? disabledClass : selected ? selectedClass : idleClass
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
			</fieldset>
			<div key={type} className="space-y-1.5">
				<label htmlFor="channel-target" className="sr-only">
					{field.label}
				</label>
				<div className="flex flex-col gap-3 sm:flex-row">
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
						className="min-w-0 flex-1 rounded-full border border-border bg-bg px-4 py-2 text-fg"
					/>
					<SubmitButton className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50">
						{submitLabel}
					</SubmitButton>
				</div>
				<p id="channel-hint" className="px-4 text-xs text-muted">
					{hints[type]}
				</p>
			</div>
		</form>
	);
}
