import {
	BRAND_ASSET_MAX_BYTES,
	BRAND_ASSET_MESSAGES,
} from "@/lib/domain/brand-asset";
import { BRAND_ASSET_KINDS } from "@/lib/domain/types";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import {
	GIF_LOGO,
	ICO_FAVICON,
	JPEG_LOGO,
	PNG_LOGO,
	RIFF_WAVE,
	SVG_LOGO,
	SVG_SCRIPT,
	WEBP_LOGO,
} from "../brand-asset-bytes";
import { ADMIN, createTestContext, EDITOR } from "../helpers";

describe("SettingsService", () => {
	it("returns defaults derived from config", async () => {
		const t = createTestContext({
			env: { SITE_NAME: "Acme", SITE_URL: "https://status.acme.dev" },
		});
		await expect(t.services.settings.get()).resolves.toEqual({
			id: "settings",
			siteName: "Acme",
			description: "",
			siteUrl: "https://status.acme.dev",
			theme: "default",
			showPoweredBy: true,
			uptimeDays: 90,
			updatedAt: "1970-01-01T00:00:00.000Z",
		});
	});

	it("drops the removed settings of an older store", async () => {
		const t = createTestContext();
		const legacy = {
			...t.services.settings.defaults(),
			allowSubscriptions: false,
			brandColor: "#4f46e5",
		};
		await t.store.insert("settings", legacy);
		// An update must not write a removed setting back or return it.
		for (const settings of [
			await t.services.settings.get(),
			await t.services.settings.update(ADMIN, { siteName: "Acme" }),
		]) {
			expect(settings).not.toHaveProperty("allowSubscriptions");
			expect(settings).not.toHaveProperty("brandColor");
		}
	});

	it("creates, updates and clears settings", async () => {
		const t = createTestContext();
		const first = await t.services.settings.update(ADMIN, {
			siteName: "Acme",
			supportUrl: "https://acme.dev/help",
			customCss: ".x{}",
			theme: "midnight",
			uptimeDays: 30,
		});
		expect(first).toMatchObject({
			siteName: "Acme",
			supportUrl: "https://acme.dev/help",
			theme: "midnight",
			uptimeDays: 30,
		});
		expect(first.updatedAt).toBe("2026-11-02T12:00:00.000Z");
		const second = await t.services.settings.update(ADMIN, {
			supportUrl: "",
			customCss: "",
			description: undefined,
		});
		expect(second.supportUrl).toBeUndefined();
		expect(second.customCss).toBeUndefined();
		expect(second.siteName).toBe("Acme");
		await expect(t.services.settings.get()).resolves.toEqual(second);
	});

	it("requires admin and validates input", async () => {
		const t = createTestContext();
		await expect(
			t.services.settings.update(EDITOR, { siteName: "x" }),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(
			t.services.settings.update(ADMIN, { supportUrl: "javascript:alert(1)" }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.settings.update(ADMIN, { theme: "Bad Theme" }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.settings.update(ADMIN, { uptimeDays: 1 }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.settings.updateBranding(
				EDITOR,
				{},
				{ logo: { bytes: PNG_LOGO } },
			),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(
			t.services.settings.getBrandAsset("logo"),
		).resolves.toBeUndefined();
	});

	it("stores, replaces and removes each uploaded file", async () => {
		const t = createTestContext();
		const { settings } = t.services;
		const first = await settings.updateBranding(
			ADMIN,
			{},
			{ logo: { bytes: PNG_LOGO } },
		);
		expect(first.logoUpdatedAt).toBe("2026-11-02T12:00:00.000Z");
		expect(first.faviconUpdatedAt).toBeUndefined();
		await expect(settings.getBrandAsset("logo")).resolves.toEqual({
			id: "logo",
			contentType: "image/png",
			data: Buffer.from(PNG_LOGO).toString("base64"),
			updatedAt: "2026-11-02T12:00:00.000Z",
		});
		await expect(settings.getBrandAsset("favicon")).resolves.toBeUndefined();
		const kept = await settings.update(ADMIN, { siteName: "Acme" });
		expect(kept).toMatchObject({
			siteName: "Acme",
			logoUpdatedAt: first.logoUpdatedAt,
		});

		// A new favicon and a new logo do not change the other file.
		t.clock.advance(1000);
		const withFavicon = await settings.updateBranding(
			ADMIN,
			{},
			{ favicon: { bytes: ICO_FAVICON } },
		);
		expect(withFavicon).toMatchObject({
			siteName: "Acme",
			logoUpdatedAt: "2026-11-02T12:00:00.000Z",
			faviconUpdatedAt: "2026-11-02T12:00:01.000Z",
		});
		await expect(settings.getBrandAsset("favicon")).resolves.toEqual({
			id: "favicon",
			contentType: "image/x-icon",
			data: Buffer.from(ICO_FAVICON).toString("base64"),
			updatedAt: "2026-11-02T12:00:01.000Z",
		});
		t.clock.advance(1000);
		const replaced = await settings.updateBranding(
			ADMIN,
			{},
			{ logo: { bytes: JPEG_LOGO } },
		);
		expect(replaced).toMatchObject({
			logoUpdatedAt: "2026-11-02T12:00:02.000Z",
			faviconUpdatedAt: "2026-11-02T12:00:01.000Z",
		});
		expect((await settings.getBrandAsset("logo"))?.contentType).toBe(
			"image/jpeg",
		);

		const removed = await settings.updateBranding(
			ADMIN,
			{},
			{ logo: { remove: true } },
		);
		expect(removed.logoUpdatedAt).toBeUndefined();
		expect(removed.faviconUpdatedAt).toBe("2026-11-02T12:00:01.000Z");
		expect(removed.siteName).toBe("Acme");
		await expect(settings.getBrandAsset("logo")).resolves.toBeUndefined();
		expect((await settings.getBrandAsset("favicon"))?.contentType).toBe(
			"image/x-icon",
		);
	});

	it("accepts each image type, and an ICO file only for the favicon", async () => {
		const t = createTestContext();
		const { settings } = t.services;
		const images = [
			[PNG_LOGO, "image/png"],
			[JPEG_LOGO, "image/jpeg"],
			[GIF_LOGO, "image/gif"],
			[WEBP_LOGO, "image/webp"],
			[SVG_LOGO, "image/svg+xml"],
		] as const;
		for (const kind of BRAND_ASSET_KINDS) {
			for (const [bytes, contentType] of images) {
				await settings.updateBranding(ADMIN, {}, { [kind]: { bytes } });
				expect((await settings.getBrandAsset(kind))?.contentType).toBe(
					contentType,
				);
			}
		}
		await expect(
			settings.updateBranding(ADMIN, {}, { logo: { bytes: ICO_FAVICON } }),
		).rejects.toThrow(BRAND_ASSET_MESSAGES.logo.type);
		expect((await settings.getBrandAsset("logo"))?.contentType).toBe(
			"image/svg+xml",
		);
	});

	it("rejects a file that is empty, too large, or not an image", async () => {
		for (const kind of BRAND_ASSET_KINDS) {
			const t = createTestContext();
			const { settings } = t.services;
			const messages = BRAND_ASSET_MESSAGES[kind];
			const save = (bytes: Uint8Array) =>
				settings.updateBranding(ADMIN, {}, { [kind]: { bytes } });
			await expect(save(Uint8Array.from([]))).rejects.toThrow(messages.type);
			await expect(save(Uint8Array.from([0]))).rejects.toThrow(messages.type);
			await expect(save(RIFF_WAVE)).rejects.toThrow(messages.type);
			await expect(
				save(new TextEncoder().encode("<html></html>")),
			).rejects.toThrow(messages.type);
			await expect(save(SVG_SCRIPT)).rejects.toThrow(messages.svg);
			const tooBig = new Uint8Array(BRAND_ASSET_MAX_BYTES + 1);
			tooBig.set(PNG_LOGO);
			await expect(save(tooBig)).rejects.toThrow(messages.size);
			await expect(settings.getBrandAsset(kind)).resolves.toBeUndefined();

			const exact = new Uint8Array(BRAND_ASSET_MAX_BYTES);
			exact.set(PNG_LOGO);
			await save(exact);
			expect((await settings.getBrandAsset(kind))?.contentType).toBe(
				"image/png",
			);
		}
	});

	it("stores no file when one of the two files is not valid", async () => {
		const t = createTestContext();
		const { settings } = t.services;
		await expect(
			settings.updateBranding(
				ADMIN,
				{ theme: "midnight" },
				{ logo: { bytes: PNG_LOGO }, favicon: { bytes: RIFF_WAVE } },
			),
		).rejects.toThrow(BRAND_ASSET_MESSAGES.favicon.type);
		await expect(settings.getBrandAsset("logo")).resolves.toBeUndefined();
		await expect(settings.getBrandAsset("favicon")).resolves.toBeUndefined();
		expect(await settings.get()).toMatchObject({ theme: "default" });
		expect((await settings.get()).logoUpdatedAt).toBeUndefined();
	});

	it("removes a logo that was never uploaded", async () => {
		const t = createTestContext();
		const settings = await t.services.settings.updateBranding(
			ADMIN,
			{},
			{ logo: { remove: true } },
		);
		expect(settings.logoUpdatedAt).toBeUndefined();
		await expect(
			t.services.settings.getBrandAsset("logo"),
		).resolves.toBeUndefined();
	});
});
