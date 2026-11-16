import type { Metadata } from "next";
import Link from "next/link";
import {
	disconnectAgentAction,
	revokeAgentTokenAction,
} from "@/app/manage/actions";
import { ConfirmButton } from "@/components/manage/confirm-button";
import { CopyButton } from "@/components/manage/copy-button";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { buttonClass, Card, EmptyState } from "@/components/manage/ui";
import { LocalTime } from "@/components/time";
import { requireMember } from "@/lib/auth";
import { activitySentence } from "@/lib/domain/activity-text";
import { can, permissionSummary } from "@/lib/domain/permissions";
import { publicMcpEndpoint } from "@/lib/mcp/oauth";
import type { PublicCredential } from "@/lib/services/agents";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agents" };

const preClass =
	"overflow-x-auto rounded-lg bg-surface-muted p-3 font-mono text-xs";

function LastUsed({ iso }: { iso: string | undefined }) {
	return iso ? (
		<>
			Last used <LocalTime iso={iso} />
		</>
	) : (
		"Never used"
	);
}

function tokenState(credential: PublicCredential): string {
	if (credential.type !== "token") {
		return "connected";
	}
	if (credential.active) {
		return "active";
	}
	return credential.revokedAt ? "revoked" : "expired";
}

function EndpointBanner({ endpoint }: { endpoint: string }) {
	return (
		<section
			aria-label="MCP endpoint"
			className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/40 bg-brand/10 px-5 py-4"
		>
			<div className="min-w-0">
				<p className="text-xs font-medium text-muted">
					MCP endpoint (Streamable HTTP)
				</p>
				<code className="block font-mono text-base break-all sm:text-lg">
					{endpoint}
				</code>
			</div>
			<CopyButton value={endpoint} />
		</section>
	);
}

/**
 * Agents call the MCP endpoint. Each agent has its own permissions.
 * A person connects an agent with OAuth, or an admin adds an API token.
 */
export default async function AgentsPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams>;
}) {
	const flash = await searchParams;
	const { actor, services, app } = await requireMember();
	const manage = can(actor, "agents.manage");
	const [settings, agents, activity] = await Promise.all([
		services.settings.get(),
		services.agents.list(actor),
		services.agents.recentActivity(actor, 20),
	]);
	const endpoint = await publicMcpEndpoint(settings.siteUrl);
	const claudeCommand = `claude mcp add --transport http incident-command ${endpoint}`;
	return (
		<ManagePage title="Agents" flash={flash} health={app.store.health}>
			<EndpointBanner endpoint={endpoint} />
			<Card
				title="Agents"
				description="An agent is a program that uses this status page through MCP. Each agent has its own permissions."
				actions={
					manage ? (
						<Link href="/manage/agents/new" className={buttonClass.primary}>
							New agent
						</Link>
					) : undefined
				}
			>
				{agents.length === 0 ? (
					<EmptyState>No agents yet.</EmptyState>
				) : (
					<ul className="divide-y divide-border">
						{agents.map((agent) => (
							<li
								key={agent.id}
								className="flex flex-wrap items-center justify-between gap-3 py-3"
							>
								<div className="min-w-0">
									<p className="font-medium">
										<Link
											href={`/manage/agents/${agent.id}`}
											className="hover:text-brand"
										>
											{agent.name}
										</Link>
									</p>
									<p className="text-xs text-muted">
										{permissionSummary(agent.permissions)} ·{" "}
										<LastUsed iso={agent.lastUsedAt} />
									</p>
									{agent.description && (
										<p className="text-sm text-muted">{agent.description}</p>
									)}
									<ul className="mt-1 space-y-1 text-xs text-muted">
										{agent.credentials.map((credential) => (
											<li key={credential.id}>
												{credential.type === "oauth"
													? `OAuth: ${credential.label}`
													: credential.label}
												{" · "}
												<span
													className={
														credential.active
															? "text-operational"
															: "text-major"
													}
												>
													{tokenState(credential)}
												</span>
											</li>
										))}
									</ul>
								</div>
								<div className="flex gap-2">
									{agent.credentials
										.filter(
											(credential) =>
												credential.type === "token" && credential.active,
										)
										.map((credential) => (
											<form key={credential.id} action={revokeAgentTokenAction}>
												<input type="hidden" name="id" value={credential.id} />
												<ConfirmButton
													message={`Revoke the token for ${agent.name}? It will stop working immediately.`}
													className={buttonClass.secondary}
												>
													Revoke
												</ConfirmButton>
											</form>
										))}
									{agent.credentials
										.filter(
											(credential) =>
												credential.type === "oauth" &&
												(manage || credential.memberId === actor.id),
										)
										.map((credential) => (
											<form key={credential.id} action={disconnectAgentAction}>
												<input type="hidden" name="id" value={credential.id} />
												<ConfirmButton
													message={`Disconnect ${agent.name}? It will stop working immediately.`}
												>
													Disconnect
												</ConfirmButton>
											</form>
										))}
								</div>
							</li>
						))}
					</ul>
				)}
				<p className="mt-4 text-sm text-muted">Claude Code with a token:</p>
				<pre className={preClass}>
					{`${claudeCommand} --header "Authorization: Bearer <token>"`}
				</pre>
			</Card>
			<Card title="Recent activity">
				{activity.length === 0 ? (
					<EmptyState>No activity yet.</EmptyState>
				) : (
					<ul className="divide-y divide-border">
						{activity.map((entry) => (
							<li key={entry.id} className="py-3 text-sm">
								<p>{activitySentence(entry)}</p>
								<p className="text-xs text-muted">
									<LocalTime iso={entry.createdAt} /> · {entry.outcome}
								</p>
							</li>
						))}
					</ul>
				)}
			</Card>
		</ManagePage>
	);
}
