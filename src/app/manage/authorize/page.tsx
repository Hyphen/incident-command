import type { Metadata } from "next";
import { AuthLayout } from "@/components/manage/shell";
import { buttonClass, Field, Flash, inputClass } from "@/components/manage/ui";
import { SubmitButton } from "@/components/submit-button";
import { getApp } from "@/lib/app";
import { requireMember } from "@/lib/auth";
import {
	can,
	permissionSummary,
	permissionsInEffect,
} from "@/lib/domain/permissions";
import { ROLE_LABELS } from "@/lib/domain/status";
import { resolveFlash } from "@/lib/flash";
import {
	authorizationParams,
	authorizePath,
	publicMcpEndpoint,
} from "@/lib/mcp/oauth";
import { approveAgentAction, denyAgentAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect an agent" };

/** The origin that the browser goes to after the decision, for example `http://localhost:8080`. */
function destination(redirectUri: string): string {
	const url = new URL(redirectUri);
	return `${url.protocol}//${url.host}`;
}

/**
 * The OAuth authorization endpoint. An agent sends the member here. After
 * sign-in, the member allows or denies the agent.
 */
export default async function AuthorizePage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const query = await searchParams;
	const params = authorizationParams((key) => query[key]);
	const { services } = await getApp();
	const settings = await services.settings.get();
	const check = await services.oauth.check(
		params,
		await publicMcpEndpoint(settings.siteUrl),
	);
	// Anybody can register a client. Thus the page does not send a visitor to
	// the redirect URI of a request that is not valid.
	if (check.kind !== "consent") {
		return (
			<AuthLayout settings={settings} title="Cannot connect the agent">
				<p className="text-sm text-muted">{check.message}</p>
			</AuthLayout>
		);
	}
	const { actor, member } = await requireMember(
		"viewer",
		authorizePath(params),
	);
	const [choices, preferred] = await Promise.all([
		services.agents.choices(actor),
		services.oauth.preferredAgentId(member.id, check.client.id),
	]);
	const known = choices.some((agent) => agent.id === preferred);
	// A repeated parameter is an array. The first value applies.
	const { error } = resolveFlash({ error: [query.error].flat().at(0) });
	return (
		<AuthLayout settings={settings} title="Connect an agent">
			<form action={approveAgentAction} className="space-y-4 text-sm">
				<Flash error={error} />
				<p>
					<strong className="font-semibold break-words">
						{check.client.name}
					</strong>{" "}
					wants to connect to {settings.siteName} as you.
				</p>
				{choices.length > 0 && (
					<fieldset className="space-y-2">
						<legend className="text-sm font-medium">Agent</legend>
						<label className="flex items-center gap-2">
							<input
								type="radio"
								name="choice"
								value="new"
								defaultChecked={!known}
							/>
							New agent
						</label>
						<label className="flex items-center gap-2">
							<input
								type="radio"
								name="choice"
								value="existing"
								defaultChecked={known}
							/>
							Existing agent
						</label>
						<select
							name="agentId"
							defaultValue={known ? preferred : choices[0]?.id}
							className={inputClass}
						>
							{choices.map((agent) => (
								<option key={agent.id} value={agent.id}>
									{`${agent.name} — ${permissionSummary(
										permissionsInEffect(agent.permissions, member.role),
									)}`}
								</option>
							))}
						</select>
						<p className="text-muted">
							Your role limits what the agent can do through this connection.
						</p>
					</fieldset>
				)}
				{choices.length === 0 && (
					<input type="hidden" name="choice" value="new" />
				)}
				<Field
					label="Agent name"
					htmlFor="agent-name"
					hint="Use this name when you create a new agent."
				>
					<input
						id="agent-name"
						name="name"
						defaultValue={check.client.name}
						required={choices.length === 0}
						maxLength={120}
						className={inputClass}
					/>
				</Field>
				<p className="text-muted">
					A new agent can read the status page and write drafts. It cannot
					publish or notify subscribers. An admin can change its permissions.
					You are signed in as {member.email} ({ROLE_LABELS[member.role]}).
					{can(actor, "agents.manage")
						? " You can attach this connection to any agent."
						: ""}
				</p>
				<p className="text-muted">
					The agent supplied the client name above. Allow it only if you started
					this connection. Next, you go to{" "}
					<code className="font-mono text-xs break-words text-fg">
						{destination(check.request.redirectUri)}
					</code>
					.
				</p>
				{Object.entries(params).map(([name, value]) => (
					<input key={name} type="hidden" name={name} value={value} />
				))}
				<div className="flex gap-3">
					<SubmitButton className={`${buttonClass.primary} flex-1`}>
						Allow
					</SubmitButton>
					<SubmitButton
						formAction={denyAgentAction}
						formNoValidate
						className={`${buttonClass.secondary} flex-1`}
					>
						Cancel
					</SubmitButton>
				</div>
			</form>
		</AuthLayout>
	);
}
