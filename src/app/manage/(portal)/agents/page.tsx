import type { Metadata } from "next";
import {
	createAgentAction,
	deleteAgentAction,
	disconnectAgentAction,
	revokeAgentAction,
} from "@/app/manage/actions";
import { ConfirmButton } from "@/components/manage/confirm-button";
import { CopyButton } from "@/components/manage/copy-button";
import { CreateAgentForm } from "@/components/manage/create-agent-form";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import { buttonClass, Card, EmptyState } from "@/components/manage/ui";
import { LocalTime } from "@/components/time";
import { requireMember } from "@/lib/auth";
import { hasRole, ROLE_LABELS } from "@/lib/domain/status";
import type { AgentConnection, PublicAgentToken } from "@/lib/domain/types";
import { publicMcpEndpoint } from "@/lib/mcp/oauth";
import { isAgentActive } from "@/lib/services/agents";

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

function Connections({
	connections,
	showMember,
}: {
	connections: AgentConnection[];
	showMember: boolean;
}) {
	if (connections.length === 0) {
		return <EmptyState>No connected agents yet.</EmptyState>;
	}
	return (
		<ul className="divide-y divide-border">
			{connections.map((connection) => (
				<li
					key={connection.id}
					className="flex flex-wrap items-center justify-between gap-3 py-3"
				>
					<div>
						<p className="font-medium break-words">{connection.clientName}</p>
						<p className="text-xs text-muted">
							{showMember && `${connection.memberName} · `}
							Connected <LocalTime iso={connection.createdAt} /> ·{" "}
							<LastUsed iso={connection.lastUsedAt} />
						</p>
					</div>
					<form action={disconnectAgentAction}>
						<input type="hidden" name="id" value={connection.id} />
						<ConfirmButton
							message={`Disconnect ${connection.clientName}? It will stop working immediately.`}
						>
							Disconnect
						</ConfirmButton>
					</form>
				</li>
			))}
		</ul>
	);
}

function Tokens({ tokens, now }: { tokens: PublicAgentToken[]; now: Date }) {
	if (tokens.length === 0) {
		return <EmptyState>No API tokens yet.</EmptyState>;
	}
	return (
		<ul className="divide-y divide-border">
			{tokens.map((token) => {
				const active = isAgentActive(token, now);
				return (
					<li
						key={token.id}
						className="flex flex-wrap items-center justify-between gap-3 py-3"
					>
						<div>
							<p className="font-medium">
								{token.name}{" "}
								<span
									className={`ml-1 text-xs ${active ? "text-operational" : "text-major"}`}
								>
									{active ? "active" : token.revokedAt ? "revoked" : "expired"}
								</span>
							</p>
							<p className="text-xs text-muted">
								<code className="font-mono">{token.tokenPrefix}…</code> ·{" "}
								{ROLE_LABELS[token.role]} · <LastUsed iso={token.lastUsedAt} />
								{token.expiresAt && (
									<>
										{" "}
										· Expires <LocalTime iso={token.expiresAt} />
									</>
								)}
							</p>
							{token.description && (
								<p className="text-sm text-muted">{token.description}</p>
							)}
						</div>
						<div className="flex gap-2">
							{active && (
								<form action={revokeAgentAction}>
									<input type="hidden" name="id" value={token.id} />
									<ConfirmButton
										message={`Revoke ${token.name}? It will stop working immediately.`}
										className={buttonClass.secondary}
									>
										Revoke
									</ConfirmButton>
								</form>
							)}
							<form action={deleteAgentAction}>
								<input type="hidden" name="id" value={token.id} />
								<ConfirmButton message={`Delete ${token.name}?`}>
									Delete
								</ConfirmButton>
							</form>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * Agents connect to the MCP endpoint with OAuth: a member signs in and
 * approves the agent, and the agent acts as that member. An admin can also
 * make API tokens for agents that cannot sign in.
 */
export default async function AgentsPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams>;
}) {
	const flash = await searchParams;
	const { actor, services, app } = await requireMember();
	const admin = hasRole(actor.role, "admin");
	const [settings, connections, tokens] = await Promise.all([
		services.settings.get(),
		services.oauth.list(actor),
		admin ? services.agents.list(actor) : undefined,
	]);
	const endpoint = await publicMcpEndpoint(settings.siteUrl);
	const claudeCommand = `claude mcp add --transport http incident-command ${endpoint}`;
	return (
		<ManagePage title="Agents" flash={flash} health={app.store.health}>
			<EndpointBanner endpoint={endpoint} />
			<Card
				title="Connected agents"
				description={
					admin
						? "Agents that members connected. Each agent acts as its member."
						: "Agents that you connected."
				}
			>
				<Connections connections={connections} showMember={admin} />
			</Card>
			{tokens && (
				<Card
					title="API tokens"
					description="For scripts and agents that cannot sign in. A token has its own role. The agent sends it in the Authorization header."
				>
					<div className="space-y-4">
						<Tokens tokens={tokens} now={new Date()} />
						<details className="rounded-lg border border-border">
							<summary className="cursor-pointer px-4 py-3 text-sm font-medium">
								Create a token
							</summary>
							<div className="space-y-4 border-t border-border p-4">
								<CreateAgentForm action={createAgentAction} />
								<p className="text-sm text-muted">Claude Code with a token:</p>
								<pre className={preClass}>
									{`${claudeCommand} --header "Authorization: Bearer <token>"`}
								</pre>
							</div>
						</details>
					</div>
				</Card>
			)}
		</ManagePage>
	);
}
