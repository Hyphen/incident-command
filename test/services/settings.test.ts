import {
	LOGO_MAX_BYTES,
	LOGO_SIZE_MESSAGE,
	LOGO_SVG_MESSAGE,
	LOGO_TYPE_MESSAGE,
} from "@/lib/domain/logo";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { ADMIN, createTestContext, EDITOR } from "../helpers";
import {
	GIF_LOGO,
	JPEG_LOGO,
	PNG_LOGO,
	RIFF_WAVE,
	SVG_LOGO,
	SVG_SCRIPT,
	WEBP_LOGO,
} from "../logo-bytes";

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
			allowSubscriptions: true,
			uptimeDays: 90,
			updatedAt: "1970-01-01T00:00:00.000Z",
		});
	});

	it("creates, updates and clears settings", async () => {
		const t = createTestContext();
		const first = await t.services.settings.update(ADMIN, {
			siteName: "Acme",
			logoUrl: "https://acme.dev/logo.svg",
			brandColor: "#ff6600",
			customCss: ".x{}",
			theme: "midnight",
			uptimeDays: 30,
			allowSubscriptions: false,
		});
		expect(first).toMatchObject({
			siteName: "Acme",
			brandColor: "#ff6600",
			theme: "midnight",
			uptimeDays: 30,
			allowSubscriptions: false,
		});
		expect(first.updatedAt).toBe("2026-11-02T12:00:00.000Z");
		const second = await t.services.settings.update(ADMIN, {
			logoUrl: "",
			brandColor: "",
			customCss: "",
			faviconUrl: undefined,
		});
		expect(second.logoUrl).toBeUndefined();
		expect(second.brandColor).toBeUndefined();
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
			t.services.settings.update(ADMIN, { brandColor: "red" }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.settings.update(ADMIN, { logoUrl: "javascript:alert(1)" }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.settings.update(ADMIN, { theme: "Bad Theme" }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.settings.update(ADMIN, { uptimeDays: 1 }),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			t.services.settings.saveLogo(EDITOR, PNG_LOGO),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(t.services.settings.removeLogo(EDITOR)).rejects.toBeInstanceOf(
			ForbiddenError,
		);
	});

	it("stores, replaces and removes an uploaded logo", async () => {
		const t = createTestContext();
		const first = await t.services.settings.saveLogo(ADMIN, PNG_LOGO);
		expect(first.logoUpdatedAt).toBe("2026-11-02T12:00:00.000Z");
		await expect(t.services.settings.getLogo()).resolves.toMatchObject({
			id: "logo",
			contentType: "image/png",
			data: Buffer.from(PNG_LOGO).toString("base64"),
		});
		const kept = await t.services.settings.update(ADMIN, { siteName: "Acme" });
		expect(kept).toMatchObject({
			siteName: "Acme",
			logoUpdatedAt: first.logoUpdatedAt,
		});

		t.clock.advance(1000);
		const replaced = await t.services.settings.saveLogo(ADMIN, JPEG_LOGO);
		expect(replaced.logoUpdatedAt).toBe("2026-11-02T12:00:01.000Z");
		expect(replaced.siteName).toBe("Acme");
		expect((await t.services.settings.getLogo())?.contentType).toBe(
			"image/jpeg",
		);

		const removed = await t.services.settings.removeLogo(ADMIN);
		expect(removed.logoUpdatedAt).toBeUndefined();
		expect(removed.siteName).toBe("Acme");
		await expect(t.services.settings.getLogo()).resolves.toBeUndefined();
	});

	it("accepts a GIF, a WebP and an SVG logo", async () => {
		const t = createTestContext();
		await t.services.settings.saveLogo(ADMIN, GIF_LOGO);
		expect((await t.services.settings.getLogo())?.contentType).toBe(
			"image/gif",
		);
		await t.services.settings.saveLogo(ADMIN, WEBP_LOGO);
		expect((await t.services.settings.getLogo())?.contentType).toBe(
			"image/webp",
		);
		await t.services.settings.saveLogo(ADMIN, SVG_LOGO);
		expect((await t.services.settings.getLogo())?.contentType).toBe(
			"image/svg+xml",
		);
	});

	it("rejects a logo that is empty, too large, or not an image", async () => {
		const t = createTestContext();
		const save = (bytes: Uint8Array) =>
			t.services.settings.saveLogo(ADMIN, bytes);
		await expect(save(Uint8Array.from([]))).rejects.toThrow(LOGO_TYPE_MESSAGE);
		await expect(save(Uint8Array.from([0]))).rejects.toThrow(LOGO_TYPE_MESSAGE);
		await expect(save(RIFF_WAVE)).rejects.toThrow(LOGO_TYPE_MESSAGE);
		await expect(
			save(new TextEncoder().encode("<html></html>")),
		).rejects.toThrow(LOGO_TYPE_MESSAGE);
		await expect(save(SVG_SCRIPT)).rejects.toThrow(LOGO_SVG_MESSAGE);
		const tooBig = new Uint8Array(LOGO_MAX_BYTES + 1);
		tooBig.set(PNG_LOGO);
		await expect(save(tooBig)).rejects.toThrow(LOGO_SIZE_MESSAGE);
		await expect(t.services.settings.getLogo()).resolves.toBeUndefined();

		const exact = new Uint8Array(LOGO_MAX_BYTES);
		exact.set(PNG_LOGO);
		await expect(save(exact)).resolves.toMatchObject({
			logoUpdatedAt: "2026-11-02T12:00:00.000Z",
		});
		expect((await t.services.settings.getLogo())?.contentType).toBe(
			"image/png",
		);
	});

	it("removes a logo that was never uploaded", async () => {
		const t = createTestContext();
		const settings = await t.services.settings.removeLogo(ADMIN);
		expect(settings.logoUpdatedAt).toBeUndefined();
		await expect(t.services.settings.getLogo()).resolves.toBeUndefined();
	});
});
