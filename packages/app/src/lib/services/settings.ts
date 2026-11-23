import { inspectBrandAsset } from "../domain/brand-asset";
import { can, type Permission } from "../domain/permissions";
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
import { ValidationError } from "../errors";
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

/** Fields on the General section of the settings page. */
const GENERAL_SETTING_KEYS = [
	"siteName",
	"description",
	"siteUrl",
	"supportUrl",
	"uptimeDays",
	"requireTwoFactor",
] as const satisfies readonly (keyof Settings)[];

/** Fields on the Branding section, including the file versions. */
const BRANDING_SETTING_KEYS = [
	"theme",
	"customCss",
	"showPoweredBy",
	"logoUpdatedAt",
	"faviconUpdatedAt",
] as const satisfies readonly (keyof Settings)[];

const GENERAL_SETTING_SET = new Set<string>(GENERAL_SETTING_KEYS);
const BRANDING_SETTING_SET = new Set<string>(BRANDING_SETTING_KEYS);

/** The keys in a patch that the caller set. `undefined` means "leave it". */
function definedKeys(patch: object): string[] {
	return Object.entries(patch)
		.filter((entry) => entry[1] !== undefined)
		.map((entry) => entry[0]);
}

/** Rejects a patch that sets an area the actor cannot change. */
function requireSettingsChange(actor: Actor, patch: object): void {
	const keys = definedKeys(patch);
	const general = keys.some((key) => GENERAL_SETTING_SET.has(key));
	const branding = keys.some((key) => BRANDING_SETTING_SET.has(key));
	if (!general && !branding) {
		throw new ValidationError("Give a setting to change.");
	}
	if (general) {
		requirePermission(actor, "settings.general.write");
	}
	if (branding) {
		requirePermission(actor, "settings.branding.write");
	}
}

function canUseArea(
	actor: Actor,
	read: Permission,
	write: Permission,
): boolean {
	return can(actor, read) || can(actor, write);
}

function assignDefined(
	target: Record<string, unknown>,
	settings: Settings,
	keys: readonly (keyof Settings)[],
): void {
	for (const key of keys) {
		const value = settings[key];
		if (value !== undefined) {
			target[key] = value;
		}
	}
}

/**
 * The settings an actor can read or change.
 * General fields and branding fields stay in their own areas.
 */
export function visibleSettings(
	actor: Actor,
	settings: Settings,
	links: { logoUrl?: string; faviconUrl?: string } = {},
): Record<string, unknown> {
	const view: Record<string, unknown> = {
		id: settings.id,
		updatedAt: settings.updatedAt,
	};
	if (canUseArea(actor, "settings.general.read", "settings.general.write")) {
		assignDefined(view, settings, GENERAL_SETTING_KEYS);
	}
	if (canUseArea(actor, "settings.branding.read", "settings.branding.write")) {
		assignDefined(view, settings, BRANDING_SETTING_KEYS);
		if (links.logoUrl) {
			view.logoUrl = links.logoUrl;
		}
		if (links.faviconUrl) {
			view.faviconUrl = links.faviconUrl;
		}
	}
	return view;
}

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
			requireTwoFactor: true,
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
		const patch = parse(updateSettingsSchema, input);
		requireSettingsChange(actor, patch);
		return this.apply(patch);
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
		requirePermission(actor, "settings.branding.write");
		const patch: Record<string, unknown> = parse(updateSettingsSchema, input);
		if (definedKeys(patch).some((key) => GENERAL_SETTING_SET.has(key))) {
			requirePermission(actor, "settings.general.write");
		}
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
