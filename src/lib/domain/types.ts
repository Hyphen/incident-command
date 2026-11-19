export const SERVICE_STATUSES = [
	"operational",
	"under_maintenance",
	"degraded_performance",
	"partial_outage",
	"major_outage",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const INCIDENT_KINDS = ["incident", "maintenance"] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_STATUSES = [
	"investigating",
	"identified",
	"monitoring",
	"resolved",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const MAINTENANCE_STATUSES = [
	"scheduled",
	"in_progress",
	"verifying",
	"completed",
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export type EventStatus = IncidentStatus | MaintenanceStatus;

export const INCIDENT_IMPACTS = ["none", "minor", "major", "critical"] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

export const ROLES = ["viewer", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const SUBSCRIBER_TYPES = ["webhook", "email", "sms"] as const;
export type SubscriberType = (typeof SUBSCRIBER_TYPES)[number];

/** A delivery channel. Each subscriber type has the channel with the same name. */
export type NotificationChannel = SubscriberType;
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] =
	SUBSCRIBER_TYPES;

/**
 * How a channel uses its providers. `active_passive` sends through the first
 * provider and uses the next provider only when a send fails (airhorn
 * fail-over). `load_balanced` sends each message through the next provider
 * in turn (airhorn round-robin).
 */
export const DELIVERY_STRATEGIES = ["active_passive", "load_balanced"] as const;
export type DeliveryStrategy = (typeof DELIVERY_STRATEGIES)[number];

/** The provider types that an admin can add to the email or text messaging channel. */
export const PROVIDER_TYPES = ["sendgrid", "ses", "twilio", "sns"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

/** A provider type, or `webhook`: the built-in webhook sender of the server. */
export type SenderType = ProviderType | "webhook";

export type DraftAction = "create" | "update";
export type DraftState = "pending" | "approved" | "discarded";

export type ActorType = "member" | "agent" | "system";

/** Who performed an action. Stored on incidents/updates for attribution. */
export interface AuthorRef {
	type: ActorType;
	id: string;
	name: string;
}

/** A credential that an agent uses to call the MCP server. */
export interface AgentCredential {
	type: "token" | "oauth";
	id: string;
}

/** A signed-in member, or the system actor. */
export type MemberActor = AuthorRef & {
	type: "member" | "system";
	role: Role;
};

/** An agent. Its permissions are the ones in effect for this credential. */
export type AgentActor = AuthorRef & {
	type: "agent";
	permissions: readonly string[];
	credential: AgentCredential;
};

/** The authenticated principal performing an operation. */
export type Actor = MemberActor | AgentActor;

export interface Settings {
	id: string;
	siteName: string;
	description: string;
	siteUrl?: string;
	supportUrl?: string;
	theme: string;
	customCss?: string;
	/** When false, the public pages do not show "Powered by Incident Command". */
	showPoweredBy: boolean;
	uptimeDays: number;
	/** Set when an admin uploads a logo. The image is at /brand/logo. */
	logoUpdatedAt?: string;
	/** Set when an admin uploads a favicon. The image is at /brand/favicon. */
	faviconUpdatedAt?: string;
	updatedAt: string;
}

/** The files an admin can upload for the brand. */
export const BRAND_ASSET_KINDS = ["logo", "favicon"] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

/** A logo or favicon file an admin uploaded. */
export interface BrandAsset {
	/** The kind of the file. */
	id: string;
	contentType: string;
	/** Base64-encoded image bytes. */
	data: string;
	updatedAt: string;
}

/** A delivery provider that an admin added to a channel. */
export interface NotificationProvider {
	id: string;
	type: ProviderType;
	/** A label that identifies the provider in the portal and in error logs. */
	name: string;
	/** The sender for this provider. It replaces the sender of the channel. */
	from?: string;
	/** Settings that are not secret, such as a region or an account SID. */
	options: Record<string, string>;
	/** Credentials, keyed by field. Each value is encrypted (see `SecretBox`). */
	secrets: Record<string, string>;
	createdAt: string;
	updatedAt: string;
}

/** The delivery settings of one channel. The document id is the channel. */
export interface NotificationChannelSettings {
	id: NotificationChannel;
	enabled: boolean;
	strategy: DeliveryStrategy;
	/** The default sender of the channel (an email address or a phone number). */
	from?: string;
	/** In order. With `active_passive`, the first provider is the active one. */
	providers: NotificationProvider[];
	/**
	 * The webhook channel only: when true, webhooks may post to private network
	 * addresses. Off by default, so a webhook URL cannot reach a host inside the
	 * network of the server.
	 */
	allowPrivateNetworks?: boolean;
	/** Incremented on every write; used for optimistic concurrency. */
	revision: number;
	updatedAt: string;
}

/** A provider without its credentials, safe to return from APIs and render. */
export interface PublicNotificationProvider
	extends Omit<NotificationProvider, "secrets"> {
	/** The secret fields that have a stored value. */
	savedSecrets: string[];
	/** False when the stored credentials do not decrypt with the configured keys. */
	credentialsReadable: boolean;
}

/** A provider that environment variables configure. */
export interface EnvironmentProvider {
	type: SenderType;
	name: string;
}

/** The delivery settings of a channel without credentials. */
export interface PublicNotificationChannel
	extends Omit<NotificationChannelSettings, "providers"> {
	providers: PublicNotificationProvider[];
	/** The channel uses these providers only when it has no providers of its own. */
	environmentProviders: EnvironmentProvider[];
	/** The sender that applies when neither the provider nor the channel has one. */
	defaultFrom?: string;
	/** True when the channel is on and has a provider that can send. */
	available: boolean;
}

export interface Service {
	id: string;
	name: string;
	description?: string;
	group?: string;
	status: ServiceStatus;
	order: number;
	hidden: boolean;
	createdAt: string;
	updatedAt: string;
}

/** The status for one affected service of an incident or maintenance. */
export interface ServiceStatusOverride {
	serviceId: string;
	status: ServiceStatus;
}

export interface ServiceStatusChange {
	id: string;
	serviceId: string;
	status: ServiceStatus;
	previousStatus: ServiceStatus;
	incidentId?: string;
	createdAt: string;
}

export interface IncidentUpdate {
	id: string;
	status: EventStatus;
	message: string;
	author: AuthorRef;
	createdAt: string;
}

export interface Incident {
	id: string;
	kind: IncidentKind;
	title: string;
	status: EventStatus;
	impact: IncidentImpact;
	serviceIds: string[];
	updates: IncidentUpdate[];
	scheduledStart?: string;
	scheduledEnd?: string;
	startedAt: string;
	resolvedAt?: string;
	/** Incremented on every write; used for optimistic concurrency. */
	revision?: number;
	createdBy: AuthorRef;
	createdAt: string;
	updatedAt: string;
}

export interface Member {
	id: string;
	email: string;
	name: string;
	role: Role;
	passwordHash: string;
	lastLoginAt?: string;
	createdAt: string;
	updatedAt: string;
}

/** A member without secrets, safe to return from APIs and render. */
export type PublicMember = Omit<Member, "passwordHash">;

/** A one-time link that lets a person create their own member account. */
export interface Invite {
	id: string;
	email: string;
	role: Role;
	tokenHash: string;
	invitedBy: AuthorRef;
	expiresAt: string;
	createdAt: string;
}

/** An invite without secrets, safe to return from APIs and render. */
export type PublicInvite = Omit<Invite, "tokenHash">;

export interface Session {
	id: string;
	memberId: string;
	expiresAt: string;
	createdAt: string;
}

/** An agent. API tokens and OAuth grants are credentials for this record. */
export interface Agent {
	id: string;
	name: string;
	description?: string;
	permissions: string[];
	ownerId?: string;
	/** Set when migration built this agent from an old token or OAuth grant. */
	migratedFrom?: "token" | "oauth";
	createdBy: AuthorRef;
	revision: number;
	createdAt: string;
	updatedAt: string;
}

/**
 * An API token for an agent. Tokens created before permissions also have
 * `name`, `description` and `role`.
 */
export interface AgentToken {
	id: string;
	agentId?: string;
	name?: string;
	description?: string;
	tokenHash: string;
	tokenPrefix: string;
	role?: Role;
	createdBy: AuthorRef;
	lastUsedAt?: string;
	expiresAt?: string;
	revokedAt?: string;
	createdAt: string;
}

export const AGENT_ACTIVITY_TYPES = [
	"tool_call",
	"agent_created",
	"agent_renamed",
	"permissions_changed",
	"token_created",
	"token_revoked",
	"oauth_connected",
	"oauth_disconnected",
	"owner_removed",
	"draft_approved",
	"draft_discarded",
] as const;
export type AgentActivityType = (typeof AGENT_ACTIVITY_TYPES)[number];

export type AgentActivityOutcome = "ok" | "denied" | "error";

/** One row in the activity log of an agent. It never holds a secret. */
export interface AgentActivity {
	id: string;
	agentId: string;
	type: AgentActivityType;
	actor: AuthorRef;
	credential?: AgentCredential;
	tool?: string;
	target?: { type: string; id: string; label?: string };
	outcome: AgentActivityOutcome;
	code?: string;
	permission?: string;
	added?: string[];
	removed?: string[];
	createdAt: string;
}

/**
 * An OAuth client that an agent registered with dynamic client registration
 * (RFC 7591). All clients are public clients: they have no secret and they
 * must use PKCE. The id is the `client_id`.
 */
export interface OAuthClient {
	id: string;
	/** The name that the agent reported. Nobody verified it. */
	name: string;
	redirectUris: string[];
	createdAt: string;
	/** The first time that a member approved the client. */
	authorizedAt?: string;
}

/** A one-time authorization code. The id is the SHA-256 hash of the code. */
export interface OAuthCode {
	id: string;
	/** The name that the member chose for this connection. */
	clientName?: string;
	clientId: string;
	memberId: string;
	redirectUri: string;
	/** The PKCE `S256` code challenge. */
	codeChallenge: string;
	/** The existing agent that the member chose. A new agent has no id yet. */
	agentId?: string;
	/** The RFC 8707 resource indicator of the authorization request. */
	resource?: string;
	expiresAt: string;
	createdAt: string;
}

/**
 * An agent that a member connected with OAuth. The agent acts as the member,
 * with the current role of the member. Only hashes of the tokens are stored.
 */
export interface OAuthGrant {
	id: string;
	clientId: string;
	clientName: string;
	memberId: string;
	resource?: string;
	accessTokenHash: string;
	accessTokenExpiresAt: string;
	refreshTokenHash: string;
	refreshTokenExpiresAt: string;
	/** The agent that this connection acts as. */
	agentId?: string;
	lastUsedAt?: string;
	createdAt: string;
}

/** A connected agent, safe to return from APIs and render. */
export interface AgentConnection {
	id: string;
	clientName: string;
	memberId: string;
	memberName: string;
	lastUsedAt?: string;
	/** The connection stops when the agent does not refresh its token before this time. */
	expiresAt: string;
	createdAt: string;
}

export interface Subscriber {
	id: string;
	type: SubscriberType;
	target: string;
	confirmed: boolean;
	token: string;
	confirmedAt?: string;
	createdAt: string;
}

/** The public text and fields of a notification draft. */
export interface DraftContent {
	/** The title of a new incident or maintenance. Not used by an update. */
	title?: string;
	/** The impact of a new incident. Not used by an update. */
	impact?: IncidentImpact;
	/** The affected services of a new incident or maintenance. Not used by an update. */
	serviceIds?: string[];
	/** The window of new maintenance. Not used by an update. */
	scheduledStart?: string;
	scheduledEnd?: string;
	/** The status after publication. An update without a status keeps the current status. */
	status?: EventStatus;
	/** The public message that subscribers receive. */
	message: string;
	/** Sets the affected services to this status instead of the automatic status. */
	serviceStatus?: ServiceStatus;
	/** Statuses for single affected services. Each one replaces `serviceStatus` for its service. */
	serviceStatuses?: ServiceStatusOverride[];
}

/**
 * A notification that waits for review by a person. Approval publishes it on
 * the status page and sends it to subscribers. A `create` draft declares a new
 * incident or maintenance. An `update` draft posts to an existing incident.
 */
export interface NotificationDraft {
	id: string;
	action: DraftAction;
	kind: IncidentKind;
	/** The incident that gets the update. A `create` draft gets it at approval. */
	incidentId?: string;
	content: DraftContent;
	state: DraftState;
	createdBy: AuthorRef;
	reviewedBy?: AuthorRef;
	reviewedAt?: string;
	publishedAt?: string;
	createdAt: string;
	updatedAt: string;
}
