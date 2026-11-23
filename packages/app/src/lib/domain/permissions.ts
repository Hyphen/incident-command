import { PermissionDeniedError, ValidationError } from "../errors";
import { hasRole } from "./status";
import type { Actor, Role } from "./types";

/** One grantable or person-only permission. */
export interface PermissionSpec {
	/** The member role that already has this permission. */
	role: Role;
	/** An agent can hold this permission. */
	agent: boolean;
	group: string;
	label: string;
	hint?: string;
}

export const PERMISSIONS = {
	"status.read": {
		role: "viewer",
		agent: true,
		group: "Status",
		label: "Read status",
	},
	"drafts.read": {
		role: "viewer",
		agent: true,
		group: "Notifications",
		label: "Read drafts",
	},
	"drafts.write": {
		role: "editor",
		agent: true,
		group: "Notifications",
		label: "Write drafts",
	},
	"incidents.publish": {
		role: "editor",
		agent: true,
		group: "Notifications",
		label: "Publish incidents and maintenance",
	},
	"notifications.send": {
		role: "editor",
		agent: true,
		group: "Notifications",
		label: "Notify subscribers",
		hint: "Sends email, text messages and webhooks when the agent publishes. A person approves a draft when the agent does not have this permission.",
	},
	"drafts.review": {
		role: "editor",
		agent: false,
		group: "Notifications",
		label: "Review drafts",
	},
	"incidents.edit": {
		role: "editor",
		agent: true,
		group: "Incidents",
		label: "Edit incidents",
	},
	"incidents.delete": {
		role: "editor",
		agent: true,
		group: "Incidents",
		label: "Delete incidents",
	},
	"services.write": {
		role: "editor",
		agent: true,
		group: "Services",
		label: "Edit services",
	},
	"services.set_status": {
		role: "editor",
		agent: true,
		group: "Services",
		label: "Set service status",
	},
	"services.delete": {
		role: "editor",
		agent: true,
		group: "Services",
		label: "Delete services",
	},
	"members.read": {
		role: "admin",
		agent: true,
		group: "Members",
		label: "Read members",
	},
	"members.manage": {
		role: "admin",
		agent: true,
		group: "Members",
		label: "Manage members",
		hint: "An agent with this permission can give itself full control.",
	},
	"subscribers.read": {
		role: "admin",
		agent: true,
		group: "Subscribers",
		label: "Read subscribers",
	},
	"subscribers.manage": {
		role: "admin",
		agent: true,
		group: "Subscribers",
		label: "Manage subscribers",
	},
	"settings.general.read": {
		role: "admin",
		agent: true,
		group: "General settings",
		label: "Read general settings",
	},
	"settings.general.write": {
		role: "admin",
		agent: true,
		group: "General settings",
		label: "Change general settings",
		hint: "Changes the name, the links, the uptime window and the two-factor requirement.",
	},
	"settings.branding.read": {
		role: "admin",
		agent: true,
		group: "Branding",
		label: "Read branding",
	},
	"settings.branding.write": {
		role: "admin",
		agent: true,
		group: "Branding",
		label: "Change branding",
		hint: "The public status page shows a new design immediately, before a person reviews it.",
	},
	"channels.read": {
		role: "admin",
		agent: true,
		group: "Notification settings",
		label: "Read notification settings",
	},
	"channels.write": {
		role: "admin",
		agent: true,
		group: "Notification settings",
		label: "Change notification settings",
	},
	"channels.providers": {
		role: "admin",
		agent: false,
		group: "Notification settings",
		label: "Change notification providers",
	},
	"agents.read": {
		role: "admin",
		agent: true,
		group: "Agents",
		label: "Read agents",
	},
	"agents.manage": {
		role: "admin",
		agent: true,
		group: "Agents",
		label: "Manage agents",
		hint: "An agent with this permission can give itself full control.",
	},
} as const satisfies Record<string, PermissionSpec>;

export type Permission = keyof typeof PERMISSIONS;

/** Returns the label of one permission. */
export function permissionLabel(permission: Permission): string {
	return (PERMISSIONS[permission] as PermissionSpec).label;
}

/** Returns the labels of the given permissions. */
export function permissionSummary(permissions: readonly Permission[]): string {
	if (permissions.length === 0) {
		return "No permissions";
	}
	return permissions
		.map((permission) => permissionLabel(permission))
		.join(", ");
}

export const PERMISSION_LIST = Object.keys(PERMISSIONS) as Permission[];

/** Permissions that an agent can hold, in catalog order. */
export const AGENT_PERMISSIONS = PERMISSION_LIST.filter(
	(permission) => PERMISSIONS[permission].agent,
);

/** A new agent can read the status page and write drafts. */
export const DEFAULT_AGENT_PERMISSIONS = [
	"status.read",
	"drafts.read",
	"drafts.write",
] as const satisfies readonly Permission[];

const AGENT_PERMISSION_SET = new Set<string>(AGENT_PERMISSIONS);

/** Drops unknown and person-only values. Keeps catalog order. */
export function normalizePermissions(values: readonly string[]): Permission[] {
	const selected = new Set(values);
	return AGENT_PERMISSIONS.filter((permission) => selected.has(permission));
}

/** The grantable permissions that a member of this role has. */
export function permissionsForRole(role: Role): Permission[] {
	return AGENT_PERMISSIONS.filter((permission) =>
		hasRole(role, PERMISSIONS[permission].role),
	);
}

/** Stored agent permissions that the member role still allows. */
export function permissionsInEffect(
	stored: readonly string[],
	role: Role,
): Permission[] {
	const selected = new Set(normalizePermissions(stored));
	return permissionsForRole(role).filter((permission) =>
		selected.has(permission),
	);
}

/** The old role, without the permission to notify subscribers. */
export function legacyRolePermissions(role: Role): Permission[] {
	return permissionsForRole(role).filter(
		(permission) => permission !== "notifications.send",
	);
}

export function permissionGroups(): {
	group: string;
	permissions: Permission[];
}[] {
	const groups: { group: string; permissions: Permission[] }[] = [];
	for (const permission of AGENT_PERMISSIONS) {
		const group = PERMISSIONS[permission].group;
		const current = groups.at(-1);
		if (current?.group === group) {
			current.permissions.push(permission);
		} else {
			groups.push({ group, permissions: [permission] });
		}
	}
	return groups;
}

export function can(actor: Actor, permission: Permission): boolean {
	if (actor.type === "agent") {
		return actor.permissions.includes(permission);
	}
	return hasRole(actor.role, PERMISSIONS[permission].role);
}

/** The permissions an actor may store on an agent. */
export function grantablePermissions(
	actor: Actor,
	values: readonly string[],
): Permission[] {
	for (const value of values) {
		if (!AGENT_PERMISSION_SET.has(value)) {
			throw new ValidationError(`Unknown permission: ${value}`);
		}
	}
	const permissions = normalizePermissions(values);
	if (
		permissions.includes("notifications.send") &&
		!permissions.includes("incidents.publish")
	) {
		throw new ValidationError(
			"Notify subscribers requires permission to publish incidents and maintenance.",
		);
	}
	for (const permission of permissions) {
		if (!can(actor, permission)) {
			const spec = PERMISSIONS[permission];
			throw new PermissionDeniedError(
				`This agent does not have the permission "${spec.label}" (${permission}).`,
				permission,
			);
		}
	}
	return permissions;
}
