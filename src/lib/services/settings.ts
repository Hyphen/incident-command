import { inspectBrandAsset } from "../domain/brand-asset";
import {
	type UpdateSettingsInput,
	updateSettingsSchema,
} from "../domain/schemas";
import {
	type Actor,
	BRAND_ASSET_KINDS,
	type BrandAsset,
	type BrandAssetKind,
	type Settings,
} from "../domain/types";
import type { ReadOptions } from "../store/types";
import { iso, parse, requirePermission, type ServiceContext } from "./context";

export const SETTINGS_ID = "settings";

/** A new file for the logo or favicon, or a request to remove the stored file. */
export type BrandAssetChange = { bytes: Uint8Array } | { remove: true };
export type BrandAssetChanges = Partial<
	Record<BrandAssetKind, BrandAssetChange>
>;

/** The settings field that holds the version of each stored file. */
const VERSION_FIELD = {
	logo: "logoUpdatedAt",
	favicon: "faviconUpdatedAt",
} as const satisfies Record<BrandAssetKind, keyof Settings>;

/** Settings that older versions stored. These settings are gone. */
const REMOVED_SETTINGS = ["allowSubscriptions", "brandColor"];

/** The stored settings without the removed settings. */
function withoutRemovedSettings(stored: object | undefined): Partial<Settings> {
	const current: Record<string, unknown> = { ...stored };
	for (const key of REMOVED_SETTINGS) {
		delete current[key];
	}
	return current;
}

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
			showPoweredBy: true,
			uptimeDays: 90,
			updatedAt: new Date(0).toISOString(),
		};
	}

	async get(): Promise<Settings> {
		const stored = await this.ctx.store.get("settings", SETTINGS_ID);
		return { ...this.defaults(), ...withoutRemovedSettings(stored) };
	}

	/** The uploaded logo or favicon, or undefined when the admin did not upload one. */
	async getBrandAsset(
		kind: BrandAssetKind,
		options?: ReadOptions,
	): Promise<BrandAsset | undefined> {
		return this.ctx.store.get("brand_assets", kind, options);
	}

	/**
	 * Reads the settings, the logo and the favicon into the memory cache.
	 * The pages then show the brand when the store goes offline after startup.
	 */
	async warm(): Promise<void> {
		await Promise.all([
			this.get(),
			...BRAND_ASSET_KINDS.map((kind) => this.getBrandAsset(kind)),
		]);
	}

	async update(actor: Actor, input: UpdateSettingsInput): Promise<Settings> {
		requirePermission(actor, "settings.write");
		return this.apply(parse(updateSettingsSchema, input));
	}

	/**
	 * Saves branding fields and the logo and favicon files.
	 * It checks the fields and each file before it stores a file.
	 * A file replaces the stored file. The remove flag deletes the stored file.
	 */
	async updateBranding(
		actor: Actor,
		input: UpdateSettingsInput,
		assets: BrandAssetChanges = {},
	): Promise<Settings> {
		requirePermission(actor, "settings.write");
		const patch: Record<string, unknown> = parse(updateSettingsSchema, input);
		const updatedAt = iso(this.ctx.now());
		const changes: { kind: BrandAssetKind; asset?: BrandAsset }[] = [];
		for (const kind of BRAND_ASSET_KINDS) {
			const change = assets[kind];
			if (change && "bytes" in change) {
				const { contentType } = inspectBrandAsset(kind, change.bytes);
				const data = Buffer.from(change.bytes).toString("base64");
				changes.push({
					kind,
					asset: { id: kind, contentType, data, updatedAt },
				});
			} else if (change) {
				changes.push({ kind });
			}
		}
		for (const { kind, asset } of changes) {
			if (asset) {
				await this.putBrandAsset(asset);
			} else {
				await this.ctx.store.delete("brand_assets", kind);
			}
			patch[VERSION_FIELD[kind]] = asset ? updatedAt : null;
		}
		return this.apply(patch);
	}

	private async putBrandAsset(asset: BrandAsset): Promise<void> {
		const current = await this.ctx.store.get("brand_assets", asset.id, {
			consistent: true,
		});
		if (current) {
			await this.ctx.store.update("brand_assets", asset);
		} else {
			await this.ctx.store.insert("brand_assets", asset);
		}
	}

	private async apply(patch: object): Promise<Settings> {
		const current = await this.ctx.store.get("settings", SETTINGS_ID, {
			consistent: true,
		});
		const next: Record<string, unknown> = {
			...this.defaults(),
			...withoutRemovedSettings(current),
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
