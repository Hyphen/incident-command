import { inspectLogo } from "../domain/logo";
import {
	type UpdateSettingsInput,
	updateSettingsSchema,
} from "../domain/schemas";
import type { Actor, BrandAsset, Settings } from "../domain/types";
import type { ReadOptions } from "../store/types";
import { iso, parse, requirePermission, type ServiceContext } from "./context";

export const SETTINGS_ID = "settings";
const LOGO_ASSET_ID = "logo";

export class SettingsService {
	private readonly ctx: ServiceContext;

	constructor(ctx: ServiceContext) {
		this.ctx = ctx;
	}

	defaults(): Settings {
		return {
			id: SETTINGS_ID,
			siteName: this.ctx.config.siteName,
			description: "",
			siteUrl: this.ctx.config.siteUrl,
			theme: "default",
			allowSubscriptions: true,
			uptimeDays: 90,
			updatedAt: new Date(0).toISOString(),
		};
	}

	async get(): Promise<Settings> {
		const stored = await this.ctx.store.get("settings", SETTINGS_ID);
		return { ...this.defaults(), ...stored };
	}

	/** The uploaded logo, or undefined when the admin did not upload one. */
	async getLogo(options?: ReadOptions): Promise<BrandAsset | undefined> {
		return this.ctx.store.get("brand_assets", LOGO_ASSET_ID, options);
	}

	async update(actor: Actor, input: UpdateSettingsInput): Promise<Settings> {
		requirePermission(actor, "settings.write");
		return this.apply(parse(updateSettingsSchema, input));
	}

	/**
	 * Saves branding fields. It checks those fields before it stores a logo.
	 * A file replaces the stored logo. The remove flag deletes the stored logo.
	 */
	async updateBranding(
		actor: Actor,
		input: UpdateSettingsInput,
		logo?: { bytes: Uint8Array } | { remove: true },
	): Promise<Settings> {
		requirePermission(actor, "settings.write");
		const patch = parse(updateSettingsSchema, input);
		if (!logo) {
			return this.apply(patch);
		}
		if ("bytes" in logo) {
			const logoUpdatedAt = await this.putLogo(logo.bytes);
			return this.apply({ ...patch, logoUpdatedAt });
		}
		await this.ctx.store.delete("brand_assets", LOGO_ASSET_ID);
		return this.apply({ ...patch, logoUpdatedAt: null });
	}

	/** Stores an uploaded logo and makes the public page use it. */
	async saveLogo(actor: Actor, bytes: Uint8Array): Promise<Settings> {
		requirePermission(actor, "settings.write");
		const logoUpdatedAt = await this.putLogo(bytes);
		return this.apply({ logoUpdatedAt });
	}

	/** Checks the file, then stores it. The caller checks permission first. */
	private async putLogo(bytes: Uint8Array): Promise<string> {
		const { contentType } = inspectLogo(bytes);
		const updatedAt = iso(this.ctx.now());
		const asset: BrandAsset = {
			id: LOGO_ASSET_ID,
			contentType,
			data: Buffer.from(bytes).toString("base64"),
			updatedAt,
		};
		const current = await this.ctx.store.get("brand_assets", LOGO_ASSET_ID, {
			consistent: true,
		});
		if (current) {
			await this.ctx.store.update("brand_assets", asset);
		} else {
			await this.ctx.store.insert("brand_assets", asset);
		}
		return updatedAt;
	}

	/** Deletes the uploaded logo. The page then uses the logo URL, when one is set. */
	async removeLogo(actor: Actor): Promise<Settings> {
		requirePermission(actor, "settings.write");
		await this.ctx.store.delete("brand_assets", LOGO_ASSET_ID);
		return this.apply({ logoUpdatedAt: null });
	}

	private async apply(patch: object): Promise<Settings> {
		const current = await this.ctx.store.get("settings", SETTINGS_ID, {
			consistent: true,
		});
		const next: Record<string, unknown> = {
			...this.defaults(),
			...current,
			updatedAt: iso(this.ctx.now()),
		};
		for (const [key, value] of Object.entries(patch)) {
			if (value === null) {
				delete next[key];
			} else if (value !== undefined) {
				next[key] = value;
			}
		}
		const settings = next as unknown as Settings;
		if (current) {
			await this.ctx.store.update("settings", settings);
		} else {
			await this.ctx.store.insert("settings", settings);
		}
		return settings;
	}
}
