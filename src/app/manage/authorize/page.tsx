import type { Metadata } from "next";
import { AuthLayout } from "@/components/manage/shell";
import { buttonClass, Field, Flash, inputClass } from "@/components/manage/ui";
import { SubmitButton } from "@/components/submit-button";
import { getApp } from "@/lib/app";
import { requireMember } from "@/lib/auth";
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
			<AuthLayout siteName={settings.siteName} title="Cannot connect the agent">
				<p className="text-sm text-muted">{check.message}</p>
			</AuthLayout>
		);
	}
	const { member } = await requireMember("viewer", authorizePath(params));
	// A repeated parameter is an array. The first value applies.
	const { error } = resolveFlash({ error: [query.error].flat().at(0) });
	return (
		<AuthLayout siteName={settings.siteName} title="Connect an agent">
			<form action={approveAgentAction} className="space-y-4 text-sm">
				<Flash error={error} />
				<p>
					<strong className="font-semibold break-words">
						{check.client.name}
					</strong>{" "}
					wants to connect to {settings.siteName} as you.
				</p>
				<Field
					label="Agent name"
					htmlFor="agent-name"
					hint="Choose a name for this connection."
				>
					<input
						id="agent-name"
						name="name"
						defaultValue={check.client.name}
						required
						maxLength={120}
						className={inputClass}
					/>
				</Field>
				<p className="text-muted">
					The agent can do everything that you can do with the MCP tools. You
					are signed in as {member.email} ({ROLE_LABELS[member.role]}). The
					agent stays connected until you disconnect it on the Agents page.
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
