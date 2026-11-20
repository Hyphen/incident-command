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
import { RegionService } from "./regions";
import { SessionService } from "./sessions";
import { SettingsService } from "./settings";
import { StatusService } from "./status";
import { SubscriberService } from "./subscribers";

export interface Services {
	settings: SettingsService;
	notificationSettings: NotificationSettingsService;
	catalog: ServiceCatalog;
	regions: RegionService;
	incidents: IncidentService;
	drafts: DraftService;
	status: StatusService;
	members: MemberService;
	sessions: SessionService;
	agents: AgentService;
	activity: ActivityService;
	oauth: OAuthService;
	subscribers: SubscriberService;
	/** Idempotent first-boot tasks, such as seeding demo data. */
	bootstrap(): Promise<void>;
}

export function createServices(ctx: ServiceContext): Services {
	const settings = new SettingsService(ctx);
	const notificationSettings = new NotificationSettingsService(ctx);
	const catalog = new ServiceCatalog(ctx);
	const regions = new RegionService(ctx);
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
		regions,
	);
	const activity = new ActivityService(ctx);
	const agents = new AgentService(ctx, activity);
	const drafts = new DraftService(ctx, incidents, activity);
	const status = new StatusService(ctx, settings, catalog, incidents, regions);
	const sessions = new SessionService(ctx);
	const oauth = new OAuthService(ctx, agents, activity);
	const members = new MemberService(ctx, sessions, oauth);

	return {
		settings,
		notificationSettings,
		catalog,
		regions,
		incidents,
		drafts,
		status,
		members,
		sessions,
		agents,
		activity,
		oauth,
		subscribers,
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
