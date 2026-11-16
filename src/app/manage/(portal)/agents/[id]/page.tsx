import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	createAgentTokenAction,
	deleteAgentAction,
	disconnectAgentAction,
	revokeAgentTokenAction,
	updateAgentAction,
} from "@/app/manage/actions";
import { ConfirmButton } from "@/components/manage/confirm-button";
import { CreateTokenForm } from "@/components/manage/create-token-form";
import { PermissionFields } from "@/components/manage/permission-fields";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { buttonClass, Card, Field, inputClass } from "@/components/manage/ui";
import { SubmitButton } from "@/components/submit-button";
import { LocalTime } from "@/components/time";
import { requireMember } from "@/lib/auth";
import { activitySentence } from "@/lib/domain/activity-text";
import { can, PERMISSIONS } from "@/lib/domain/permissions";
import { isAppError } from "@/lib/errors";
import type { PublicCredential } from "@/lib/services/agents";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent" };

function tokenState(credential: PublicCredential): string {
	if (credential.active) {
		return "active";
	}
	return credential.revokedAt ? "revoked" : "expired";
}

export default async function AgentPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<FlashParams & { page?: string }>;
}) {
	const { id } = await params;
	const query = await searchParams;
	const page = Math.max(1, Number(query.page) || 1);
	const { actor, services, app } = await requireMember();
	const agent = await services.agents.get(actor, id).catch((error: unknown) => {
		if (isAppError(error) && error.code === "not_found") {
			notFound();
		}
		throw error;
	});
	const activity = await services.agents.activity(actor, id, {
		limit: 50,
		offset: (page - 1) * 50,
	});
	const manage = can(actor, "agents.manage");
	const path = `/manage/agents/${agent.id}`;
	return (
		<ManagePage title={agent.name} flash={query} health={app.store.health}>
			{agent.migratedFrom && (
				<p className="rounded-lg border border-degraded/40 bg-degraded/10 px-4 py-3 text-sm">
					This agent existed before permissions. It kept its access, but it
					cannot notify subscribers. Examine its permissions.
				</p>
			)}
			<Card title="Settings">
				<form action={updateAgentAction} className="space-y-4">
					<input type="hidden" name="id" value={agent.id} />
					<input type="hidden" name="revision" value={agent.revision} />
					{manage && <input type="hidden" name="editPermissions" value="true" />}
					<Field label="Name" htmlFor="agent-name">
						<input
							id="agent-name"
							name="name"
							required
							maxLength={120}
							defaultValue={agent.name}
							className={inputClass}
						/>
					</Field>
					<Field label="Description" htmlFor="agent-description">
						<input
							id="agent-description"
							name="description"
							maxLength={500}
							defaultValue={agent.description ?? ""}
							className={inputClass}
						/>
					</Field>
					{manage ? (
						<PermissionFields selected={agent.permissions} />
					) : (
						<ul className="space-y-1 text-sm">
							{agent.permissions.map((permission) => (
								<li key={permission}>{PERMISSIONS[permission]!.label}</li>
							))}
						</ul>
					)}
					<SubmitButton className={buttonClass.primary}>Save</SubmitButton>
				</form>
			</Card>
			<Card
				title="Credentials"
				description="Connect this agent with OAuth, or add an API token."
			>
				{agent.credentials.length === 0 ? (
					<p className="text-sm text-muted">No credentials yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{agent.credentials.map((credential) => (
							<li
								key={credential.id}
								className="flex flex-wrap items-center justify-between gap-3 py-3"
							>
								<div>
									<p className="font-medium">
										{credential.type === "oauth"
											? `OAuth: ${credential.label}`
											: credential.label}{" "}
										<span
											className={`text-xs ${credential.active ? "text-operational" : "text-major"}`}
										>
											{credential.type === "oauth"
												? "connected"
												: tokenState(credential)}
										</span>
									</p>
									<p className="text-xs text-muted">
										{credential.lastUsedAt ? (
											<>
												Last used <LocalTime iso={credential.lastUsedAt} />
											</>
										) : (
											"Never used"
										)}
										{credential.expiresAt && (
											<>
												{" "}
												· Expires <LocalTime iso={credential.expiresAt} />
											</>
										)}
									</p>
								</div>
								{credential.type === "token" &&
									credential.active &&
									manage && (
										<form action={revokeAgentTokenAction}>
											<input type="hidden" name="id" value={credential.id} />
											<input type="hidden" name="next" value={path} />
											<ConfirmButton
												message={`Revoke this token for ${agent.name}? It will stop working immediately.`}
												className={buttonClass.secondary}
											>
												Revoke
											</ConfirmButton>
										</form>
									)}
								{credential.type === "oauth" &&
									(manage || credential.memberId === actor.id) && (
										<form action={disconnectAgentAction}>
											<input type="hidden" name="id" value={credential.id} />
											<input type="hidden" name="next" value={path} />
											<ConfirmButton
												message={`Disconnect ${agent.name}? It will stop working immediately.`}
											>
												Disconnect
											</ConfirmButton>
										</form>
									)}
							</li>
						))}
					</ul>
				)}
				{manage && (
					<div className="mt-4 border-t border-border pt-4">
						<CreateTokenForm action={createAgentTokenAction} agentId={agent.id} />
					</div>
				)}
			</Card>
			<Card title="Activity">
				{activity.length === 0 ? (
					<p className="text-sm text-muted">No activity yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{activity.map((entry) => (
							<li key={entry.id} className="py-3 text-sm">
								<p>{activitySentence(entry)}</p>
								<p className="text-xs text-muted">
									<LocalTime iso={entry.createdAt} /> · {entry.actor.name} ·{" "}
									{entry.outcome}
								</p>
							</li>
						))}
					</ul>
				)}
				{activity.length === 50 && (
					<a
						href={`${path}?page=${page + 1}`}
						className="mt-3 inline-block text-sm text-brand"
					>
						Next
					</a>
				)}
			</Card>
			{manage && (
				<Card title="Delete agent">
					<form action={deleteAgentAction}>
						<input type="hidden" name="id" value={agent.id} />
						<ConfirmButton message={`Delete ${agent.name}?`}>
							Delete
						</ConfirmButton>
					</form>
				</Card>
			)}
		</ManagePage>
	);
}
