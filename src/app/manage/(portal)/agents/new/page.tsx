import type { Metadata } from "next";
import { createAgentAction } from "@/app/manage/actions";
import { PermissionFields } from "@/components/manage/permission-fields";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { buttonClass, Card, Field, inputClass } from "@/components/manage/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireMember } from "@/lib/auth";
import { DEFAULT_AGENT_PERMISSIONS } from "@/lib/domain/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New agent" };

export default async function NewAgentPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams>;
}) {
	const flash = await searchParams;
	const { app } = await requireMember("admin");
	return (
		<ManagePage title="New agent" flash={flash} health={app.store.health}>
			<Card
				title="Agent"
				description="A new agent can read the status page and write drafts. A person approves each draft before it is published or sent."
			>
				<form action={createAgentAction} className="space-y-4">
					<Field label="Name" htmlFor="agent-name">
						<input
							id="agent-name"
							name="name"
							required
							maxLength={120}
							placeholder="On-call agent"
							className={inputClass}
						/>
					</Field>
					<Field label="Description" htmlFor="agent-description">
						<input
							id="agent-description"
							name="description"
							maxLength={500}
							className={inputClass}
						/>
					</Field>
					<PermissionFields selected={DEFAULT_AGENT_PERMISSIONS} />
					<SubmitButton className={buttonClass.primary}>
						Create agent
					</SubmitButton>
				</form>
			</Card>
		</ManagePage>
	);
}
