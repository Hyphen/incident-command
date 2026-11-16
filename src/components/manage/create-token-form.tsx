"use client";

import { useActionState } from "react";
import type { CreateTokenState } from "@/app/manage/actions";
import { OneTimeSecret } from "./one-time-secret";
import { buttonClass, Field, Flash, inputClass } from "./ui";

type Action = (
	state: CreateTokenState,
	form: FormData,
) => Promise<CreateTokenState>;

/** Creates an API token and shows it one time. */
export function CreateTokenForm({
	action,
	agentId,
}: {
	action: Action;
	agentId: string;
}) {
	const [state, formAction, pending] = useActionState(action, {});
	return (
		<div className="space-y-4">
			{state.token && (
				<OneTimeSecret
					key={state.token}
					label={`Token for ${state.name}. Copy the token now. It is shown one time.`}
					value={state.token}
				/>
			)}
			<Flash error={state.error} />
			<form action={formAction} className="space-y-4">
				<input type="hidden" name="agentId" value={agentId} />
				<Field
					label="Expires in (days)"
					htmlFor="agent-expires"
					hint="Leave empty for no expiry."
				>
					<input
						id="agent-expires"
						name="expiresInDays"
						type="number"
						min={1}
						className={inputClass}
					/>
				</Field>
				<button type="submit" disabled={pending} className={buttonClass.primary}>
					{pending ? "Creating…" : "Create token"}
				</button>
			</form>
		</div>
	);
}
