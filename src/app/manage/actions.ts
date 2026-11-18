"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type App, getApp } from "@/lib/app";
import {
	endSession,
	flash,
	loginPath,
	requireMemberForAction,
	returnPath,
	startSession,
} from "@/lib/auth";
import type { MoveDirection } from "@/lib/domain/schemas";
import type {
	DeliveryStrategy,
	EventStatus,
	IncidentImpact,
	IncidentKind,
	NotificationChannel,
	ProviderType,
	Role,
	ServiceStatus,
} from "@/lib/domain/types";
import { isAppError } from "@/lib/errors";
import {
	attempt,
	checkbox,
	dateTime,
	integer,
	list,
	nonEmpty,
	optionalText,
	prefixed,
	text,
} from "@/lib/manage/forms";
import { publicOrigin } from "@/lib/manage/origin";
import {
	authorizationParams,
	authorizePath,
	publicMcpEndpoint,
} from "@/lib/mcp/oauth";
import { draftPath } from "@/lib/services/drafts";
import { invitePath } from "@/lib/services/members";
import type { BrandAssetChange } from "@/lib/services/settings";

/**
 * Runs an operation for a `useActionState` form. An expected application
 * error becomes `{ error }`, so the form can show it.
 */
async function formState<T>(
	operation: () => Promise<T>,
): Promise<T | { error: string }> {
	try {
		return await operation();
	} catch (error) {
		if (isAppError(error)) {
			return { error: error.message };
		}
		throw error;
	}
}

// ---- session ------------------------------------------------------------------

export async function loginAction(form: FormData): Promise<void> {
	const app = await getApp();
	const member = await app.services.members.authenticate({
		email: text(form, "email"),
		password: text(form, "password"),
	});
	const next = text(form, "next");
	if (!member) {
		redirect(flash(loginPath(next), "invalid_credentials"));
	}
	await startSession(app, member.id);
	redirect(returnPath(next));
}

export async function logoutAction(): Promise<void> {
	await endSession(await getApp());
	redirect("/manage/login");
}

export async function setupAction(form: FormData): Promise<void> {
	const app = await getApp();
	const member = await attempt("/manage/setup", () =>
		app.services.members.setup(
			{
				name: text(form, "name"),
				email: text(form, "email"),
				password: text(form, "password"),
			},
			nonEmpty(form, "token"),
		),
	);
	await startSession(app, member.id);
	redirect(flash("/manage", "welcome_admin"));
}

export async function acceptInviteAction(form: FormData): Promise<void> {
	const app = await getApp();
	const token = text(form, "token");
	const member = await attempt(invitePath(token), () =>
		app.services.members.acceptInvite(token, {
			name: text(form, "name"),
			password: text(form, "password"),
		}),
	);
	await startSession(app, member.id);
	redirect(flash("/manage", "welcome_member"));
}

export async function changePasswordAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction();
	await attempt("/manage/account", () =>
		services.members.changePassword(
			actor,
			text(form, "currentPassword"),
			text(form, "newPassword"),
		),
	);
	redirect(flash("/manage/account", "password_updated"));
}

// ---- incidents ------------------------------------------------------------------

/**
 * The status of each single service, from the `serviceStatus:<id>` selects.
 * A form with a service picker sends `serviceIds`. In that form, only a
 * selected service keeps its status.
 */
function serviceStatuses(form: FormData) {
	const selected = form.has("serviceIds")
		? list(form, "serviceIds")
		: undefined;
	return Object.entries(prefixed(form, "serviceStatus:"))
		.filter(
			([serviceId, status]) =>
				status !== "" && (selected?.includes(serviceId) ?? true),
		)
		.map(([serviceId, status]) => ({
			serviceId,
			status: status as ServiceStatus,
		}));
}

export async function createIncidentAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	const kind = (text(form, "kind") || "incident") as IncidentKind;
	const incident = await attempt(`/manage/incidents/new?kind=${kind}`, () =>
		services.incidents.create(actor, {
			kind,
			title: text(form, "title"),
			message: text(form, "message"),
			impact: nonEmpty(form, "impact") as IncidentImpact | undefined,
			status: nonEmpty(form, "status") as EventStatus | undefined,
			serviceIds: list(form, "serviceIds"),
			serviceStatus: nonEmpty(form, "serviceStatus") as
				| ServiceStatus
				| undefined,
			serviceStatuses: serviceStatuses(form),
			scheduledStart: dateTime(form, "scheduledStart"),
			scheduledEnd: dateTime(form, "scheduledEnd"),
			notify: checkbox(form, "notify"),
		}),
	);
	redirect(
		flash(
			`/manage/incidents/${incident.id}`,
			kind === "incident" ? "incident_declared" : "maintenance_scheduled",
		),
	);
}

export async function postIncidentUpdateAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	const id = text(form, "id");
	await attempt(`/manage/incidents/${id}`, () =>
		services.incidents.postUpdate(actor, id, {
			status: nonEmpty(form, "status") as EventStatus | undefined,
			message: text(form, "message"),
			serviceStatus: nonEmpty(form, "serviceStatus") as
				| ServiceStatus
				| undefined,
			serviceStatuses: serviceStatuses(form),
			notify: checkbox(form, "notify"),
		}),
	);
	redirect(flash(`/manage/incidents/${id}`, "update_posted"));
}

export async function editIncidentAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	const id = text(form, "id");
	await attempt(`/manage/incidents/${id}`, () =>
		services.incidents.edit(actor, id, {
			title: text(form, "title"),
			impact: nonEmpty(form, "impact") as IncidentImpact | undefined,
			serviceIds: list(form, "serviceIds"),
			scheduledStart: dateTime(form, "scheduledStart"),
			scheduledEnd: dateTime(form, "scheduledEnd"),
		}),
	);
	redirect(flash(`/manage/incidents/${id}`, "incident_saved"));
}

export async function deleteIncidentAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	await attempt("/manage/incidents", () =>
		services.incidents.delete(actor, text(form, "id")),
	);
	redirect(flash("/manage/incidents", "incident_deleted"));
}

// ---- notification drafts ------------------------------------------------------------

/** The draft fields of the review form. Fields that the form does not show stay empty. */
function draftContent(form: FormData) {
	return {
		title: nonEmpty(form, "title"),
		impact: nonEmpty(form, "impact") as IncidentImpact | undefined,
		serviceIds: list(form, "serviceIds"),
		scheduledStart: dateTime(form, "scheduledStart"),
		scheduledEnd: dateTime(form, "scheduledEnd"),
		status: nonEmpty(form, "status") as EventStatus | undefined,
		message: text(form, "message"),
		serviceStatus: nonEmpty(form, "serviceStatus") as ServiceStatus | undefined,
		serviceStatuses: serviceStatuses(form),
	};
}

export async function saveDraftAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	const id = text(form, "id");
	await attempt(draftPath(id), () =>
		services.drafts.update(actor, id, draftContent(form)),
	);
	redirect(flash(draftPath(id), "draft_saved"));
}

export async function approveDraftAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	const id = text(form, "id");
	const { incident } = await attempt(draftPath(id), () =>
		services.drafts.approve(actor, id, draftContent(form)),
	);
	redirect(flash(`/manage/incidents/${incident.id}`, "draft_approved"));
}

export async function discardDraftAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	const id = text(form, "id");
	await attempt(draftPath(id), () => services.drafts.discard(actor, id));
	redirect(flash("/manage/drafts", "draft_discarded"));
}

// ---- services -------------------------------------------------------------------

export async function createServiceAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	await attempt("/manage/services", () =>
		services.catalog.create(actor, {
			name: text(form, "name"),
			description: text(form, "description"),
			group: text(form, "group"),
			hidden: checkbox(form, "hidden"),
		}),
	);
	redirect(flash("/manage/services", "service_created"));
}

export async function updateServiceAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	await attempt("/manage/services", () =>
		services.catalog.update(actor, text(form, "id"), {
			name: text(form, "name"),
			description: text(form, "description"),
			group: text(form, "group"),
			order: integer(form, "order"),
			hidden: checkbox(form, "hidden"),
		}),
	);
	redirect(flash("/manage/services", "service_saved"));
}

export async function setServiceStatusAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	await attempt("/manage/services", () =>
		services.catalog.setStatus(
			actor,
			text(form, "id"),
			text(form, "status") as ServiceStatus,
		),
	);
	redirect(flash("/manage/services", "status_updated"));
}

export async function deleteServiceAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("editor");
	await attempt("/manage/services", () =>
		services.catalog.delete(actor, text(form, "id")),
	);
	redirect(flash("/manage/services", "service_deleted"));
}

// ---- members ----------------------------------------------------------------------

export interface InviteMemberState {
	url?: string;
	email?: string;
	error?: string;
}

/** Used with `useActionState` so the invite link is shown once and never persisted. */
export async function inviteMemberAction(
	_previous: InviteMemberState,
	form: FormData,
): Promise<InviteMemberState> {
	const { actor, services, app } = await requireMemberForAction("admin");
	return formState(async () => {
		const { token, invite } = await services.members.invite(actor, {
			email: text(form, "email"),
			role: text(form, "role") as Role,
		});
		revalidatePath("/manage/members");
		return { url: await inviteUrl(app, token), email: invite.email };
	});
}

/** Makes a new link for an open invite. The previous link stops working. */
export async function renewInviteLinkAction(
	id: string,
): Promise<{ url: string } | { error: string }> {
	const { actor, services, app } = await requireMemberForAction("admin");
	return formState(async () => {
		const { token } = await services.members.renewInvite(actor, id);
		return { url: await inviteUrl(app, token) };
	});
}

async function inviteUrl(app: App, token: string): Promise<string> {
	const settings = await app.services.settings.get();
	const origin = await publicOrigin(settings.siteUrl ?? app.config.siteUrl);
	return `${origin}${invitePath(token)}`;
}

export async function revokeInviteAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt("/manage/members", () =>
		services.members.revokeInvite(actor, text(form, "id")),
	);
	redirect(flash("/manage/members", "invite_revoked"));
}

export async function updateMemberAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt("/manage/members", () =>
		services.members.update(actor, text(form, "id"), {
			role: nonEmpty(form, "role") as Role | undefined,
			password: nonEmpty(form, "password"),
		}),
	);
	// The portal layout shows the role of the member who is signed in.
	revalidatePath("/manage", "layout");
	redirect(flash("/manage/members", "member_updated"));
}

export async function deleteMemberAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt("/manage/members", () =>
		services.members.delete(actor, text(form, "id")),
	);
	redirect(flash("/manage/members", "member_removed"));
}

// ---- agents -----------------------------------------------------------------------

export interface CreateTokenState {
	token?: string;
	name?: string;
	error?: string;
}

export async function createAgentAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	const agent = await attempt("/manage/agents/new", () =>
		services.agents.create(actor, {
			name: text(form, "name"),
			description: text(form, "description"),
			permissions: list(form, "permissions"),
		}),
	);
	revalidatePath("/manage/agents");
	redirect(flash(`/manage/agents/${agent.id}`, "agent_created"));
}

export async function updateAgentAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction();
	const id = text(form, "id");
	const path = `/manage/agents/${encodeURIComponent(id)}`;
	await attempt(path, () =>
		services.agents.update(actor, id, {
			name: text(form, "name"),
			description: text(form, "description"),
			permissions:
				text(form, "editPermissions") === "true"
					? list(form, "permissions")
					: undefined,
			revision: integer(form, "revision") ?? -1,
		}),
	);
	revalidatePath(path);
	redirect(flash(path, "agent_saved"));
}

/** Used with `useActionState` so the token is shown once and never persisted. */
export async function createAgentTokenAction(
	_previous: CreateTokenState,
	form: FormData,
): Promise<CreateTokenState> {
	const { actor, services } = await requireMemberForAction("admin");
	return formState(async () => {
		const agentId = text(form, "agentId");
		const { token, agent } = await services.agents.createToken(actor, agentId, {
			expiresInDays: integer(form, "expiresInDays"),
		});
		revalidatePath(`/manage/agents/${agentId}`);
		return { token, name: agent.name };
	});
}

/** Keeps a return path only when that path is an agents page on this site. */
function agentReturnPath(value: string): string {
	if (/^\/manage\/agents(?:\/[a-z0-9_]+)?$/.test(value)) {
		return value;
	}
	return "/manage/agents";
}

export async function revokeAgentTokenAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	const next = agentReturnPath(text(form, "next"));
	await attempt(next, () =>
		services.agents.revokeToken(actor, text(form, "id")),
	);
	redirect(flash(next, "token_revoked"));
}

export async function deleteAgentAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt("/manage/agents", () =>
		services.agents.delete(actor, text(form, "id")),
	);
	redirect(flash("/manage/agents", "agent_deleted"));
}

// ---- connected agents -------------------------------------------------------------

/** Reads an authorization request that the consent page posts. */
async function authorizationRequest(form: FormData) {
	const { actor, services } = await requireMemberForAction();
	const { siteUrl } = await services.settings.get();
	return {
		actor,
		services,
		params: authorizationParams((key) => form.get(key)),
		resource: await publicMcpEndpoint(siteUrl),
	};
}

/** The member allows the agent. The agent gets an authorization code. */
export async function approveAgentAction(form: FormData): Promise<void> {
	const { actor, services, params, resource } =
		await authorizationRequest(form);
	redirect(
		await attempt(authorizePath(params), () =>
			services.oauth.approve(
				actor,
				params,
				resource,
				text(form, "choice") === "existing"
					? { agentId: text(form, "agentId") }
					: { name: text(form, "name") },
			),
		),
	);
}

/** The member denies the agent. The agent gets an `access_denied` error. */
export async function denyAgentAction(form: FormData): Promise<void> {
	const { services, params, resource } = await authorizationRequest(form);
	redirect(
		await attempt(authorizePath(params), () =>
			services.oauth.deny(params, resource),
		),
	);
}

export async function disconnectAgentAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction();
	const next = agentReturnPath(text(form, "next"));
	await attempt(next, () => services.oauth.disconnect(actor, text(form, "id")));
	redirect(flash(next, "agent_disconnected"));
}

// ---- subscribers --------------------------------------------------------------------

export async function addSubscriberAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	const target = text(form, "target");
	await attempt("/manage/subscribers", () => {
		switch (text(form, "type")) {
			case "email":
				return services.subscribers.addEmail(actor, { email: target });
			case "sms":
				return services.subscribers.addSms(actor, { phone: target });
			default:
				return services.subscribers.addWebhook(actor, { url: target });
		}
	});
	redirect(flash("/manage/subscribers", "subscriber_added"));
}

export async function deleteSubscriberAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt("/manage/subscribers", () =>
		services.subscribers.remove(actor, text(form, "id")),
	);
	redirect(flash("/manage/subscribers", "subscriber_removed"));
}

// ---- settings -----------------------------------------------------------------------

const GENERAL_PATH = "/manage/settings";
const BRANDING_PATH = "/manage/settings/branding";
const NOTIFICATIONS_PATH = "/manage/settings/notifications";

export async function updateGeneralSettingsAction(
	form: FormData,
): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt(GENERAL_PATH, () =>
		services.settings.update(actor, {
			siteName: text(form, "siteName"),
			description: text(form, "description"),
			siteUrl: optionalText(form, "siteUrl"),
			supportUrl: optionalText(form, "supportUrl"),
			uptimeDays: integer(form, "uptimeDays"),
		}),
	);
	// The root layout and the portal layout show the settings.
	revalidatePath("/", "layout");
	redirect(flash(GENERAL_PATH, "settings_saved"));
}

/** The change that the branding form asks for one file. A new file wins over the remove flag. */
async function brandAssetChange(
	form: FormData,
	field: string,
	removeField: string,
): Promise<BrandAssetChange | undefined> {
	const file = form.get(field);
	if (file instanceof File && file.size > 0) {
		return { bytes: new Uint8Array(await file.arrayBuffer()) };
	}
	return checkbox(form, removeField) ? { remove: true } : undefined;
}

export async function updateBrandingAction(form: FormData): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt(BRANDING_PATH, async () => {
		await services.settings.updateBranding(
			actor,
			{
				theme: text(form, "theme"),
				brandColor: optionalText(form, "brandColor"),
				customCss: optionalText(form, "customCss"),
				showPoweredBy: checkbox(form, "showPoweredBy"),
			},
			{
				logo: await brandAssetChange(form, "logo", "removeLogo"),
				favicon: await brandAssetChange(form, "favicon", "removeFavicon"),
			},
		);
	});
	// The root layout and the portal layout show the settings.
	revalidatePath("/", "layout");
	redirect(flash(BRANDING_PATH, "branding_saved"));
}

// ---- notification channels -------------------------------------------------------------

/** The channel of a notification form. The service validates the value. */
function channelOf(form: FormData): NotificationChannel {
	return text(form, "channel") as NotificationChannel;
}

export async function updateNotificationChannelAction(
	form: FormData,
): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	const channel = channelOf(form);
	await attempt(NOTIFICATIONS_PATH, () =>
		services.notificationSettings.updateChannel(actor, channel, {
			revision: integer(form, "revision"),
			enabled: checkbox(form, "enabled"),
			// The webhook form has no strategy field.
			strategy: optionalText(form, "strategy") as DeliveryStrategy | undefined,
			from: optionalText(form, "from"),
			// Only the webhook card has this box.
			...(channel === "webhook"
				? { allowPrivateNetworks: checkbox(form, "allowPrivateNetworks") }
				: {}),
		}),
	);
	redirect(flash(NOTIFICATIONS_PATH, "notification_channel_saved"));
}

export async function addNotificationProviderAction(
	form: FormData,
): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt(NOTIFICATIONS_PATH, () =>
		services.notificationSettings.addProvider(actor, channelOf(form), {
			type: text(form, "type") as ProviderType,
			name: text(form, "name"),
			from: optionalText(form, "from"),
			values: prefixed(form, "field_"),
		}),
	);
	redirect(flash(NOTIFICATIONS_PATH, "notification_provider_added"));
}

export async function updateNotificationProviderAction(
	form: FormData,
): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt(NOTIFICATIONS_PATH, () =>
		services.notificationSettings.updateProvider(
			actor,
			channelOf(form),
			text(form, "id"),
			{
				revision: integer(form, "revision"),
				name: text(form, "name"),
				from: optionalText(form, "from"),
				values: prefixed(form, "field_"),
				clear: list(form, "clear"),
			},
		),
	);
	redirect(flash(NOTIFICATIONS_PATH, "notification_provider_saved"));
}

export async function moveNotificationProviderAction(
	form: FormData,
): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt(NOTIFICATIONS_PATH, () =>
		services.notificationSettings.moveProvider(
			actor,
			channelOf(form),
			text(form, "id"),
			text(form, "direction") as MoveDirection,
		),
	);
	redirect(flash(NOTIFICATIONS_PATH, "notification_provider_moved"));
}

export async function removeNotificationProviderAction(
	form: FormData,
): Promise<void> {
	const { actor, services } = await requireMemberForAction("admin");
	await attempt(NOTIFICATIONS_PATH, () =>
		services.notificationSettings.removeProvider(
			actor,
			channelOf(form),
			text(form, "id"),
		),
	);
	redirect(flash(NOTIFICATIONS_PATH, "notification_provider_removed"));
}
