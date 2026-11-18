"use client";

import { useState } from "react";
import { subscribeAction } from "@/app/subscribe/actions";
import { SubmitButton } from "@/components/submit-button";
import type { SubscriberType } from "@/lib/domain/types";

/** The field of each channel on the public subscribe form. */
const SUBSCRIBE_CHANNELS: Record<
	SubscriberType,
	{
		title: string;
		label: string;
		inputType: "url" | "email" | "tel";
		placeholder: string;
		autoComplete: "url" | "email" | "tel";
		hint: string;
	}
> = {
	email: {
		title: "Email",
		label: "Email address",
		inputType: "email",
		placeholder: "you@example.com",
		autoComplete: "email",
		hint: "We email you a confirmation link.",
	},
	sms: {
		title: "Text message",
		label: "Phone number",
		inputType: "tel",
		placeholder: "+15551234567",
		autoComplete: "tel",
		hint: "Include the country code. We text you a confirmation link.",
	},
	webhook: {
		title: "Webhook",
		label: "Webhook URL",
		inputType: "url",
		placeholder: "https://hooks.slack.com/services/…",
		autoComplete: "url",
		hint: "Slack, Discord or any JSON endpoint. We post a confirmation link to it.",
	},
};

const optionClass =
	"cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand";
const selectedClass = "border-brand bg-brand text-brand-fg";
const idleClass = "border-border text-muted hover:text-fg";

/**
 * The public subscribe form. It shows a choice of channel only when more
 * than one channel can send. The field follows the selected channel.
 */
export function SubscribeForm({
	channels,
	initial,
}: {
	channels: readonly SubscriberType[];
	initial: SubscriberType;
}) {
	const [type, setType] = useState(initial);
	const channel = SUBSCRIBE_CHANNELS[type];
	return (
		<form action={subscribeAction} className="space-y-4">
			{channels.length > 1 ? (
				<fieldset className="flex flex-wrap gap-2">
					<legend className="sr-only">Channel</legend>
					{channels.map((option) => (
						<label
							key={option}
							className={`${optionClass} ${type === option ? selectedClass : idleClass}`}
						>
							<input
								type="radio"
								name="type"
								value={option}
								checked={type === option}
								onChange={() => setType(option)}
								className="sr-only"
							/>
							{SUBSCRIBE_CHANNELS[option].title}
						</label>
					))}
				</fieldset>
			) : (
				<input type="hidden" name="type" value={type} />
			)}
			<div key={type} className="space-y-1.5">
				<label htmlFor="subscribe-target" className="sr-only">
					{channel.label}
				</label>
				<div className="flex flex-col gap-3 sm:flex-row">
					<input
						id="subscribe-target"
						name="target"
						type={channel.inputType}
						required
						placeholder={channel.placeholder}
						autoComplete={channel.autoComplete}
						aria-describedby="subscribe-hint"
						className="min-w-0 flex-1 rounded-full border border-border bg-bg px-4 py-2 text-fg"
					/>
					<SubmitButton className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2 font-medium text-brand-fg hover:opacity-90 disabled:opacity-50">
						Subscribe
					</SubmitButton>
				</div>
				<p id="subscribe-hint" className="px-4 text-xs text-muted">
					{channel.hint}
				</p>
			</div>
		</form>
	);
}
