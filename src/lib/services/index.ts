import { seedDemo } from "../demo";
import { ActivityService } from "./activity";
import { AgentService } from "./agents";
import { ServiceCatalog } from "./catalog";
import type { ServiceContext } from "./context";
import { DraftService } from "./drafts";
import { IncidentService } from "./incidents";
import { MemberService } from "./members";
import { NotificationSettingsService } from "./notification-settings";
import { OAuthService } from "./oauth";
import { SessionService } from "./sessions";
import { SettingsService } from "./settings";
import { StatusService } from "./status";
import { SubscriberService } from "./subscribers";
import { TwoFactorService } from "./two-factor";

export interface Services {
	settings: SettingsService;
	notificationSettings: NotificationSettingsService;
	catalog: ServiceCatalog;
	incidents: IncidentService;
	drafts: DraftService;
	status: StatusService;
	members: MemberService;
	sessions: SessionService;
	agents: AgentService;
	activity: ActivityService;
	oauth: OAuthService;
	subscribers: SubscriberService;
	twoFactor: TwoFactorService;
	/** Idempotent first-boot tasks, such as seeding demo data. */
	bootstrap(): Promise<void>;
}

export function createServices(ctx: ServiceContext): Services {
	const settings = new SettingsService(ctx);
	const notificationSettings = new NotificationSettingsService(ctx);
	const catalog = new ServiceCatalog(ctx);
	const subscribers = new SubscriberService(
		ctx,
		settings,
		notificationSettings,
	);
	const incidents = new IncidentService(
		ctx,
		catalog,
		subscribers,
		settings,
		notificationSettings,
	);
	const activity = new ActivityService(ctx);
	const agents = new AgentService(ctx, activity);
	const drafts = new DraftService(ctx, incidents, activity);
	const status = new StatusService(ctx, settings, catalog, incidents);
	const sessions = new SessionService(ctx);
	const oauth = new OAuthService(ctx, agents, activity);
	const members = new MemberService(ctx, sessions, oauth);
	const twoFactor = new TwoFactorService(ctx, sessions);

	return {
		settings,
		notificationSettings,
		catalog,
		incidents,
		drafts,
		status,
		members,
		sessions,
		agents,
		activity,
		oauth,
		subscribers,
		twoFactor,
		async bootstrap() {
			await agents.migrate();
			if (ctx.config.seedDemo && (await ctx.store.count("services")) === 0) {
				await seedDemo(ctx);
			}
			await settings.warm();
		},
	};
}

export type { ServiceContext } from "./context";
