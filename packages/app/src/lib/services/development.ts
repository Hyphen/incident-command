import type { Actor } from "../domain/types";
import { ForbiddenError } from "../errors";
import type { CollectionName } from "../store/types";
import { iso, requirePermission, type ServiceContext } from "./context";

/** The error when the server does not run in development mode. */
export const DEVELOPMENT_MODE_REQUIRED =
	"This action is available only in development mode.";

/**
 * The incidents and the records that refer to them. "Clear incidents"
 * deletes all documents in these collections.
 */
const INCIDENT_COLLECTIONS = [
	"incidents",
	"notification_drafts",
	"notification_jobs",
	"notification_deliveries",
	"service_status_changes",
] as const satisfies readonly CollectionName[];

/** Tools for a development server (`NODE_ENV` or `DEPLOYMENT` is `development`). */
export class DevelopmentService {
	private readonly ctx: ServiceContext;

	constructor(ctx: ServiceContext) {
		this.ctx = ctx;
	}

	/** True when the server runs in development mode. */
	get enabled(): boolean {
		return this.ctx.config.developmentMode;
	}

	/**
	 * Deletes all incidents and maintenance, the drafts, the notification sends
	 * and the uptime history. Then it sets each service to operational.
	 * Services, regions, members, subscribers, agents and settings stay.
	 */
	async clearIncidents(actor: Actor): Promise<void> {
		requirePermission(actor, "settings.general.write");
		if (!this.enabled) {
			throw new ForbiddenError(DEVELOPMENT_MODE_REQUIRED);
		}
		for (const collection of INCIDENT_COLLECTIONS) {
			await this.ctx.store.deleteMany(collection, {});
		}
		const updatedAt = iso(this.ctx.now());
		const services = await this.ctx.store.find(
			"services",
			{ where: [{ field: "status", op: "ne", value: "operational" }] },
			{ consistent: true },
		);
		for (const service of services) {
			await this.ctx.store.update("services", {
				...service,
				status: "operational",
				updatedAt,
			});
		}
	}
}
