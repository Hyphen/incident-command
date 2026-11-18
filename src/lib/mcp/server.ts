import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { publicFaviconSrc, publicLogoSrc } from "../brand";
import { designGuide } from "../design";
import { decodeBrandAsset } from "../domain/brand-asset";
import { can, PERMISSIONS, type Permission } from "../domain/permissions";
import {
	eventStatusSchema,
	impactSchema,
	kindSchema,
	roleSchema,
	serviceStatusSchema,
} from "../domain/schemas";
import {
	type AgentActor,
	BRAND_ASSET_KINDS,
	DELIVERY_STRATEGIES,
	type Incident,
	type Settings,
	SUBSCRIBER_TYPES,
} from "../domain/types";
import { formatUptime } from "../domain/uptime";
import { isAppError, isPermissionDenied } from "../errors";
import type { Services } from "../services";
import { authorRef } from "../services/context";
import { draftPath } from "../services/drafts";
import { invitePath } from "../services/members";

export const MCP_SERVER_NAME = "incident-command";
export const MCP_SERVER_VERSION = "0.1.0";

const BASE_INSTRUCTIONS = `You are connected to an incident command service that powers a public status page.
- Use get_status first to understand the current state.
- Declare incidents with create_incident, keep customers informed with post_incident_update
  (statuses: investigating -> identified -> monitoring -> resolved), and close with resolve_incident.
- Affected services move to a status derived from the incident impact (minor=degraded_performance,
  major=partial_outage, critical=major_outage) unless serviceStatus is given; resolving restores them.
- To give affected services different statuses, use serviceStatuses, for example
  [{"serviceId": "svc_api", "status": "major_outage"}, {"serviceId": "svc_web", "status": "degraded_performance"}].
  It works with create_incident, post_incident_update and draft_notification. Each entry replaces
  serviceStatus and the automatic status for that service only. An entry applies even when a different
  open incident affects the service. When you resolve, do not list a service that must go back to
  operational: resolution restores it, but keeps it as it is while a different open incident affects it.
- Schedule planned work with schedule_maintenance (statuses: scheduled -> in_progress -> verifying -> completed).
- When a person must review a notification first, use draft_notification and give that person the reviewUrl.
  Nothing is published or sent until the person approves the draft. Check the result with get_notification_draft.
- Everything you post is public on the status page and may notify subscribers. Write for customers.`;

const DESIGN_INSTRUCTIONS = `
- To change the design of the status page, call get_design_guide first. It lists the theme presets,
  the design tokens and the CSS selectors. Then use update_settings (theme, brandColor, customCss)
  and upload_brand_asset (logo, favicon).`;

function instructionsFor(actor: AgentActor): string {
	const draft = can(actor, "incidents.publish")
		? ""
		: "\n- Use draft_notification. A person approves each draft.";
	const design = can(actor, "settings.write") ? DESIGN_INSTRUCTIONS : "";
	return `${BASE_INSTRUCTIONS}${draft}${design}`;
}

const id = z.string().min(1).describe("The record id");
function notifyField(actor: AgentActor) {
	const blocked = !can(actor, "notifications.send");
	return z
		.boolean()
		.optional()
		.describe(
			blocked
				? "This agent cannot notify subscribers. Set notify to false. To notify subscribers, use draft_notification."
				: "Notify subscribers (default true)",
		);
}
const isoDate = z
	.string()
	.describe("ISO 8601 timestamp with timezone, e.g. 2026-11-03T02:00:00Z");
const serviceStatus = serviceStatusSchema
	.optional()
	.describe(
		"The status for all affected services. It replaces the automatic status.",
	);
const serviceStatuses = z
	.array(
		z.object({
			serviceId: z
				.string()
				.describe("An affected service of the incident or maintenance"),
			status: serviceStatusSchema,
		}),
	)
	.optional()
	.describe(
		"Statuses for single affected services. Each entry replaces serviceStatus and the automatic status for its service. Other affected services keep the automatic status or serviceStatus.",
	);

type ToolHandler<A> = (args: A) => Promise<unknown>;

function result(data: unknown): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(data, null, 2),
			},
		],
	};
}

function failure(error: unknown): CallToolResult {
	if (!isAppError(error)) {
		console.error("[mcp] tool failed", error);
	}
	return {
		isError: true,
		content: [
			{
				type: "text",
				text: isAppError(error)
					? `${error.code}: ${error.message}`
					: "internal_error: Something went wrong",
			},
		],
	};
}

function incidentSummary(incident: Incident) {
	const latest = incident.updates.at(-1);
	return {
		id: incident.id,
		kind: incident.kind,
		title: incident.title,
		status: incident.status,
		impact: incident.impact,
		serviceIds: incident.serviceIds,
		startedAt: incident.startedAt,
		resolvedAt: incident.resolvedAt,
		scheduledStart: incident.scheduledStart,
		scheduledEnd: incident.scheduledEnd,
		latestUpdate: latest?.message,
		updatedAt: incident.updatedAt,
	};
}

export interface McpServerHandle {
	server: McpServer;
	/** Tools this actor cannot call, with the permission each one needs. */
	denied: ReadonlyMap<string, Permission>;
}

interface ActivityTarget {
	type: string;
	id: string;
	label?: string;
}

/**
 * Builds an MCP server exposing tools for the given actor. Tools are only
 * registered when the actor's permissions allow them. `origin` is the request
 * origin. Invite links use it when no site URL is set.
 */
export function createMcpServer(
	services: Services,
	actor: AgentActor,
	origin: string,
): McpServerHandle {
	const server = new McpServer(
		{ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
		{ instructions: instructionsFor(actor) },
	);
	const denied = new Map<string, Permission>();
	const notify = notifyField(actor);

	/** A full portal URL. It uses the site URL, or the request origin when no site URL is set. */
	async function portalUrl(path: string): Promise<string> {
		const { siteUrl } = await services.settings.get();
		return `${siteUrl ?? origin}${path}`;
	}

	/** The settings, with the full URL of the logo and of the favicon when a file is stored. */
	async function settingsView(settings: Settings) {
		const logo = publicLogoSrc(settings);
		const favicon = publicFaviconSrc(settings);
		return {
			...settings,
			...(logo ? { logoUrl: await portalUrl(logo) } : {}),
			...(favicon ? { faviconUrl: await portalUrl(favicon) } : {}),
		};
	}

	function tool<S extends z.ZodRawShape>(
		permission: Permission | null,
		name: string,
		config: {
			title: string;
			description: string;
			inputSchema: S;
			readOnly?: boolean;
			target?: (
				args: z.infer<z.ZodObject<S>>,
				value: unknown,
			) => ActivityTarget | undefined;
		},
		handler: ToolHandler<z.infer<z.ZodObject<S>>>,
	): void {
		if (permission && !can(actor, permission)) {
			denied.set(name, permission);
			return;
		}
		server.registerTool(
			name,
			{
				title: config.title,
				description: config.description,
				inputSchema: config.inputSchema,
				annotations: {
					readOnlyHint: config.readOnly ?? false,
					destructiveHint:
						name.startsWith("delete") ||
						name.startsWith("remove") ||
						name.startsWith("revoke"),
				},
			},
			(async (args: z.infer<z.ZodObject<S>>) => {
				try {
					const value = await handler(args);
					if (!config.readOnly) {
						await services.activity.record({
							agentId: actor.id,
							type: "tool_call",
							actor: authorRef(actor),
							credential: actor.credential,
							tool: name,
							target: safeTarget(args, value, config.target),
							outcome: "ok",
						});
					}
					return result(value);
				} catch (error) {
					await services.activity.record({
						agentId: actor.id,
						type: "tool_call",
						actor: authorRef(actor),
						credential: actor.credential,
						tool: name,
						outcome: isPermissionDenied(error) ? "denied" : "error",
						...(isAppError(error) ? { code: error.code } : {}),
						...(isPermissionDenied(error)
							? { permission: error.permission }
							: {}),
					});
					return failure(error);
				}
			}) as never,
		);
	}

	// ---- read ---------------------------------------------------------------

	tool(
		null,
		"whoami",
		{
			title: "Who am I",
			description:
				"Returns the agent identity, permissions and credential type for this connection.",
			inputSchema: {},
			readOnly: true,
		},
		async () => ({
			id: actor.id,
			name: actor.name,
			type: "agent" as const,
			permissions: actor.permissions,
			credential: actor.credential.type,
		}),
	);

	tool(
		"status.read",
		"get_status",
		{
			title: "Get status",
			description:
				"Current overall status, every visible service with its status and uptime, open incidents and maintenance.",
			inputSchema: {},
			readOnly: true,
		},
		async () => {
			const summary = await services.status.summary();
			return {
				page: summary.settings.siteName,
				overall: summary.overall,
				services: summary.services.map((service) => ({
					id: service.id,
					name: service.name,
					group: service.group,
					status: service.status,
					uptime: formatUptime(service.uptime),
				})),
				activeIncidents: summary.activeIncidents.map(incidentSummary),
				activeMaintenance: summary.activeMaintenance.map(incidentSummary),
				upcomingMaintenance: summary.upcomingMaintenance.map(incidentSummary),
				uptimeWindowDays: summary.window.days,
			};
		},
	);

	tool(
		"status.read",
		"list_services",
		{
			title: "List services",
			description: "All services, including hidden ones, in display order.",
			inputSchema: {},
			readOnly: true,
		},
		async () => services.catalog.list(),
	);

	tool(
		"status.read",
		"list_incidents",
		{
			title: "List incidents",
			description: "Incidents and maintenance, newest first.",
			inputSchema: {
				kind: kindSchema.optional().describe("incident or maintenance"),
				open: z
					.boolean()
					.optional()
					.describe("true for open only, false for closed only"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(100)
					.optional()
					.describe("Default 20"),
			},
			readOnly: true,
		},
		async ({ kind, open, limit }) =>
			(await services.incidents.list({ kind, open, limit: limit ?? 20 })).map(
				incidentSummary,
			),
	);

	tool(
		"status.read",
		"get_incident",
		{
			title: "Get incident",
			description: "An incident or maintenance with its full update timeline.",
			inputSchema: { id },
			readOnly: true,
		},
		async (args) => services.incidents.get(args.id),
	);

	// ---- services -----------------------------------------------------------

	tool(
		"services.write",
		"create_service",
		{
			title: "Create service",
			description:
				"Adds a service (a system customers care about) to the status page.",
			inputSchema: {
				name: z.string(),
				description: z.string().optional(),
				group: z
					.string()
					.optional()
					.describe("Optional group name used to cluster services"),
				status: serviceStatusSchema.optional(),
				hidden: z.boolean().optional().describe("Hide from the public page"),
			},
		},
		async (args) => services.catalog.create(actor, args),
	);

	tool(
		"services.write",
		"update_service",
		{
			title: "Update service",
			description:
				"Edits a service. Pass null or an empty string to clear description or group.",
			inputSchema: {
				id,
				name: z.string().optional(),
				description: z.string().nullable().optional(),
				group: z.string().nullable().optional(),
				status: serviceStatusSchema.optional(),
				hidden: z.boolean().optional(),
				order: z.number().int().optional(),
			},
		},
		async ({ id: serviceId, ...patch }) =>
			services.catalog.update(actor, serviceId, patch),
	);

	tool(
		"services.set_status",
		"set_service_status",
		{
			title: "Set service status",
			description:
				"Changes a service's status without posting an incident. Status changes feed uptime history.",
			inputSchema: { id, status: serviceStatusSchema },
		},
		async (args) => services.catalog.setStatus(actor, args.id, args.status),
	);

	tool(
		"services.delete",
		"delete_service",
		{
			title: "Delete service",
			description: "Permanently deletes a service and its status history.",
			inputSchema: { id },
		},
		async (args) => {
			await services.catalog.delete(actor, args.id);
			return { deleted: args.id };
		},
	);

	// ---- incidents ------------------------------------------------------------

	tool(
		"incidents.publish",
		"create_incident",
		{
			title: "Create incident",
			description:
				"Declares a public incident with an initial update. Affected services change status based on impact.",
			inputSchema: {
				title: z.string().describe("Short customer-facing title"),
				message: z.string().describe("First public update"),
				impact: impactSchema
					.optional()
					.describe("none | minor | major | critical (default minor)"),
				serviceIds: z.array(z.string()).optional(),
				serviceStatus,
				serviceStatuses,
				status: eventStatusSchema
					.optional()
					.describe(
						"investigating (default) | identified | monitoring | resolved",
					),
				notify,
			},
		},
		async (args) =>
			services.incidents.create(actor, { ...args, kind: "incident" }),
	);

	tool(
		"incidents.publish",
		"post_incident_update",
		{
			title: "Post incident update",
			description:
				"Adds a timeline update to an incident or maintenance. It can also change the status and the status of each affected service.",
			inputSchema: {
				id,
				message: z.string(),
				status: eventStatusSchema.optional(),
				serviceStatus,
				serviceStatuses,
				notify,
			},
		},
		async ({ id: incidentId, ...input }) =>
			services.incidents.postUpdate(actor, incidentId, input),
	);

	tool(
		"incidents.publish",
		"resolve_incident",
		{
			title: "Resolve incident",
			description:
				"Resolves an incident (or completes maintenance) and restores affected services.",
			inputSchema: { id, message: z.string().optional(), notify },
		},
		async (args) =>
			services.incidents.resolve(actor, args.id, args.message, args.notify),
	);

	tool(
		"incidents.edit",
		"edit_incident",
		{
			title: "Edit incident",
			description:
				"Edits incident metadata (title, impact, services, maintenance window) without posting an update.",
			inputSchema: {
				id,
				title: z.string().optional(),
				impact: impactSchema.optional(),
				serviceIds: z.array(z.string()).optional(),
				scheduledStart: isoDate.optional(),
				scheduledEnd: isoDate.optional(),
			},
		},
		async ({ id: incidentId, ...patch }) =>
			services.incidents.edit(actor, incidentId, patch),
	);

	tool(
		"incidents.delete",
		"delete_incident",
		{
			title: "Delete incident",
			description: "Permanently deletes an incident or maintenance.",
			inputSchema: { id },
		},
		async (args) => {
			await services.incidents.delete(actor, args.id);
			return { deleted: args.id };
		},
	);

	tool(
		"incidents.publish",
		"schedule_maintenance",
		{
			title: "Schedule maintenance",
			description:
				"Announces planned maintenance. Move it through in_progress and completed with post_incident_update.",
			inputSchema: {
				title: z.string(),
				message: z.string(),
				scheduledStart: isoDate,
				scheduledEnd: isoDate,
				serviceIds: z.array(z.string()).optional(),
				notify,
			},
		},
		async (args) =>
			services.incidents.create(actor, { ...args, kind: "maintenance" }),
	);

	// ---- notification drafts --------------------------------------------------

	tool(
		"drafts.write",
		"draft_notification",
		{
			title: "Draft notification",
			description:
				"Saves a notification for a person to review. Nothing is published or sent until a person approves it. Give the reviewUrl to that person. With incidentId, the draft is an update to that incident. Without incidentId, the draft declares a new incident or maintenance. On approval, the update is published on the status page and subscribers are notified.",
			inputSchema: {
				incidentId: z
					.string()
					.min(1)
					.optional()
					.describe(
						"The incident that gets the update. Omit to declare a new incident or maintenance.",
					),
				kind: kindSchema
					.optional()
					.describe("New events only: incident (default) or maintenance"),
				title: z
					.string()
					.optional()
					.describe("New events only: short customer-facing title"),
				message: z
					.string()
					.describe("The public message that subscribers receive"),
				status: eventStatusSchema
					.optional()
					.describe(
						"The status after approval. An update without a status keeps the current status.",
					),
				impact: impactSchema
					.optional()
					.describe(
						"New incidents only: none | minor | major | critical (default minor)",
					),
				serviceIds: z
					.array(z.string())
					.optional()
					.describe("New events only: affected services"),
				serviceStatus,
				serviceStatuses,
				scheduledStart: isoDate
					.optional()
					.describe("New maintenance only: start of the window (ISO 8601)"),
				scheduledEnd: isoDate
					.optional()
					.describe("New maintenance only: end of the window (ISO 8601)"),
			},
		},
		async (args) => {
			const draft = await services.drafts.create(actor, args);
			return { reviewUrl: await portalUrl(draftPath(draft.id)), draft };
		},
	);

	tool(
		"drafts.read",
		"get_notification_draft",
		{
			title: "Get notification draft",
			description:
				"A notification draft and its review state: pending, approved or discarded. After approval, incidentId is the incident that has the published update.",
			inputSchema: { id },
			readOnly: true,
		},
		async (args) => {
			const draft = await services.drafts.get(args.id);
			return { reviewUrl: await portalUrl(draftPath(draft.id)), draft };
		},
	);

	// ---- admin ----------------------------------------------------------------

	tool(
		"members.read",
		"list_members",
		{
			title: "List members",
			description: "People who can sign in to the manage portal.",
			inputSchema: {},
			readOnly: true,
		},
		async () => services.members.list(actor),
	);

	tool(
		"members.manage",
		"invite_member",
		{
			title: "Invite member",
			description:
				"Creates a one-time link that a person uses to create their own portal account. Give the inviteUrl to that person. The link expires after 7 days. A new invite for the same email replaces the old link.",
			inputSchema: {
				email: z.string(),
				role: roleSchema.optional(),
			},
		},
		async (args) => {
			const { token, invite } = await services.members.invite(actor, args);
			return { inviteUrl: await portalUrl(invitePath(token)), invite };
		},
	);

	tool(
		"members.read",
		"list_invites",
		{
			title: "List invites",
			description: "Invites that nobody used yet, with their expiry times.",
			inputSchema: {},
			readOnly: true,
		},
		async () => services.members.listInvites(actor),
	);

	tool(
		"members.manage",
		"revoke_invite",
		{
			title: "Revoke invite",
			description: "Removes an invite. Its link stops working immediately.",
			inputSchema: { id },
		},
		async (args) => {
			await services.members.revokeInvite(actor, args.id);
			return { revoked: args.id };
		},
	);

	tool(
		"members.manage",
		"update_member",
		{
			title: "Update member",
			description: "Changes a member's name, email, role or password.",
			inputSchema: {
				id,
				name: z.string().optional(),
				email: z.string().optional(),
				role: roleSchema.optional(),
				password: z.string().optional(),
			},
		},
		async ({ id: memberId, ...patch }) =>
			services.members.update(actor, memberId, patch),
	);

	tool(
		"members.manage",
		"remove_member",
		{
			title: "Remove member",
			description: "Removes a portal member and signs them out.",
			inputSchema: { id },
		},
		async (args) => {
			await services.members.delete(actor, args.id);
			return { deleted: args.id };
		},
	);

	tool(
		"agents.read",
		"list_agents",
		{
			title: "List agents",
			description:
				"Agents, their permissions and their credentials. Secrets are never returned.",
			inputSchema: {},
			readOnly: true,
		},
		async () => services.agents.list(actor),
	);

	tool(
		"agents.manage",
		"create_agent",
		{
			title: "Create agent",
			description:
				"Creates an agent. Omit permissions to use the default: read status, read drafts and write drafts.",
			inputSchema: {
				name: z.string(),
				description: z.string().optional(),
				permissions: z.array(z.string()).optional(),
			},
		},
		async (args) => services.agents.create(actor, args),
	);

	tool(
		"agents.manage",
		"update_agent",
		{
			title: "Update agent",
			description:
				"Changes the name, description or permissions of an agent. Pass the current revision.",
			inputSchema: {
				id,
				name: z.string().optional(),
				description: z.string().nullable().optional(),
				permissions: z.array(z.string()).optional(),
				revision: z.number().int(),
			},
		},
		async ({ id: agentId, ...patch }) =>
			services.agents.update(actor, agentId, patch),
	);

	tool(
		"agents.manage",
		"delete_agent",
		{
			title: "Delete agent",
			description: "Deletes an agent and its credentials.",
			inputSchema: { id },
		},
		async (args) => {
			await services.agents.delete(actor, args.id);
			return { deleted: args.id };
		},
	);

	tool(
		"agents.manage",
		"create_agent_token",
		{
			title: "Create agent token",
			description:
				"Creates a bearer token for an agent. The token is shown only once.",
			inputSchema: {
				agentId: z.string().describe("The agent that receives the token"),
				expiresInDays: z.number().int().optional(),
			},
			target: (_args, value) => ({
				type: "token",
				id: (value as { credentialId: string }).credentialId,
			}),
		},
		async (args) =>
			services.agents.createToken(actor, args.agentId, {
				expiresInDays: args.expiresInDays,
			}),
	);

	tool(
		"agents.manage",
		"revoke_agent_token",
		{
			title: "Revoke agent token",
			description: "Immediately revokes an agent token.",
			inputSchema: { id },
		},
		async (args) => services.agents.revokeToken(actor, args.id),
	);

	tool(
		"agents.read",
		"list_agent_activity",
		{
			title: "List agent activity",
			description: "Recent activity for one agent, newest first.",
			inputSchema: {
				agentId: z.string(),
				limit: z.number().int().min(1).max(100).optional(),
			},
			readOnly: true,
		},
		async (args) =>
			services.agents.activity(actor, args.agentId, {
				limit: args.limit ?? 50,
			}),
	);

	tool(
		"settings.read",
		"get_settings",
		{
			title: "Get settings",
			description:
				"Status page settings and branding. logoUrl and faviconUrl show when a file is stored.",
			inputSchema: {},
			readOnly: true,
		},
		async () => settingsView(await services.settings.get()),
	);

	// The guide holds no settings. Only an agent that can change the design needs it.
	tool(
		"settings.write",
		"get_design_guide",
		{
			title: "Get design guide",
			description:
				"The reference for a custom design of the status page: the theme presets, the design tokens, the CSS selectors for customCss, the rules, the limits and an example. Read it before you change the design.",
			inputSchema: {},
			readOnly: true,
		},
		async () => designGuide(),
	);

	tool(
		"settings.write",
		"update_settings",
		{
			title: "Update settings",
			description:
				"Updates status page settings and branding. Pass null or an empty string to clear optional values. customCss replaces the stored stylesheet. Call get_design_guide for the tokens and the selectors that customCss can use. Use upload_brand_asset for the logo and the favicon.",
			inputSchema: {
				siteName: z.string().optional(),
				description: z.string().optional(),
				siteUrl: z.string().nullable().optional(),
				supportUrl: z.string().nullable().optional(),
				theme: z
					.string()
					.optional()
					.describe(
						"Theme preset: default, carbon, terminal, ocean, sunset or mono",
					),
				brandColor: z
					.string()
					.nullable()
					.optional()
					.describe("Hex color such as #4f46e5"),
				customCss: z
					.string()
					.nullable()
					.optional()
					.describe(
						"A stylesheet that each page loads after the theme. It replaces the stored stylesheet.",
					),
				allowSubscriptions: z.boolean().optional(),
				uptimeDays: z.number().int().optional(),
			},
		},
		async (args) => settingsView(await services.settings.update(actor, args)),
	);

	tool(
		"settings.write",
		"upload_brand_asset",
		{
			title: "Upload brand asset",
			description:
				"Stores the logo or the favicon of the status page. It replaces the stored file. The maximum size of a file is 512 KB. A logo is a PNG, JPEG, WebP, GIF or SVG file. A favicon can also be an ICO file. An SVG file cannot contain a script or an event handler.",
			inputSchema: {
				kind: z.enum(BRAND_ASSET_KINDS),
				data: z
					.string()
					.describe(
						"The file as base64 text, as a base64 data URL, or as the source text of an SVG image",
					),
			},
			target: ({ kind }) => ({ type: "brand_asset", id: kind }),
		},
		async ({ kind, data }) =>
			settingsView(
				await services.settings.updateBranding(
					actor,
					{},
					{ [kind]: { bytes: decodeBrandAsset(data) } },
				),
			),
	);

	tool(
		"settings.write",
		"remove_brand_asset",
		{
			title: "Remove brand asset",
			description:
				"Removes the stored logo or favicon. The header then shows the site name, or the browser shows its default icon.",
			inputSchema: { kind: z.enum(BRAND_ASSET_KINDS) },
			target: ({ kind }) => ({ type: "brand_asset", id: kind }),
		},
		async ({ kind }) =>
			settingsView(
				await services.settings.updateBranding(
					actor,
					{},
					{ [kind]: { remove: true } },
				),
			),
	);

	tool(
		"channels.read",
		"get_notification_settings",
		{
			title: "Get notification settings",
			description:
				"The webhook, email and text messaging channels: on or off, the delivery strategy, the sender and the providers. Credentials are never returned.",
			inputSchema: {},
			readOnly: true,
		},
		async () => services.notificationSettings.list(actor),
	);

	tool(
		"channels.write",
		"update_notification_channel",
		{
			title: "Update notification channel",
			description:
				"Turns a channel on or off, sets its delivery strategy (active_passive or load_balanced) or sets its sender. Add providers and their credentials in the portal.",
			inputSchema: {
				channel: z.enum(SUBSCRIBER_TYPES),
				enabled: z.boolean().optional(),
				strategy: z.enum(DELIVERY_STRATEGIES).optional(),
				from: z
					.string()
					.nullable()
					.optional()
					.describe(
						"Email address or phone number. Pass null or an empty string to clear it.",
					),
			},
		},
		async ({ channel, ...input }) =>
			services.notificationSettings.updateChannel(actor, channel, input),
	);

	tool(
		"subscribers.read",
		"list_subscribers",
		{
			title: "List subscribers",
			description: "Webhook, email and text message subscribers.",
			inputSchema: {},
			readOnly: true,
		},
		async () => services.subscribers.list(actor),
	);

	tool(
		"subscribers.manage",
		"add_subscriber",
		{
			title: "Add subscriber",
			description:
				"Adds a confirmed email subscriber, a webhook (Slack, Discord or any JSON endpoint) or a phone number for text messages.",
			inputSchema: {
				type: z.enum(SUBSCRIBER_TYPES),
				target: z
					.string()
					.describe("Email address, https URL or E.164 phone number"),
			},
		},
		async (args) => {
			switch (args.type) {
				case "email":
					return services.subscribers.addEmail(actor, { email: args.target });
				case "sms":
					return services.subscribers.addSms(actor, { phone: args.target });
				default:
					return services.subscribers.addWebhook(actor, { url: args.target });
			}
		},
	);

	tool(
		"subscribers.manage",
		"remove_subscriber",
		{
			title: "Remove subscriber",
			description: "Removes a subscriber.",
			inputSchema: { id },
		},
		async (args) => {
			await services.subscribers.remove(actor, args.id);
			return { deleted: args.id };
		},
	);

	return { server, denied };
}

function safeTarget(
	args: unknown,
	value: unknown,
	custom?: (args: never, value: unknown) => ActivityTarget | undefined,
): ActivityTarget | undefined {
	const picked = custom?.(args as never, value);
	if (picked) {
		return picked;
	}
	if (isRecord(args) && typeof args.id === "string") {
		return { type: "record", id: args.id };
	}
	if (isRecord(value) && typeof value.id === "string") {
		const label = typeof value.title === "string" ? value.title : undefined;
		return { type: "record", id: value.id, ...(label ? { label } : {}) };
	}
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Text for a tool call that the actor is not allowed to make. */
export function deniedToolMessage(permission: Permission): string {
	const spec = PERMISSIONS[permission];
	return `forbidden: This agent does not have the permission "${spec.label}" (${permission}).`;
}
