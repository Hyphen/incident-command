import { readdirSync, readFileSync } from "node:fs";
import { GET as serverMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as resourceMetadataForPath } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as resourceMetadata } from "@/app/.well-known/oauth-protected-resource/route";
import { POST as mcp } from "@/app/api/mcp/route";
import { GET as status } from "@/app/api/v1/status/route";
import { GET as favicon } from "@/app/brand/favicon/route";
import { GET as logo } from "@/app/brand/logo/route";
import { GET as feed } from "@/app/feed.xml/route";
import { GET as health } from "@/app/healthz/route";
import { POST as register } from "@/app/oauth/register/route";
import { POST as token } from "@/app/oauth/token/route";
import { createApp, setApp } from "@/lib/app";
import { loadConfig } from "@/lib/config";
import { DESIGN_TOKENS } from "@/lib/design";
import { ValidationError } from "@/lib/errors";
import { escapeXml, FEED_ITEM_LIMIT } from "@/lib/feed";
import {
	formatDateTime,
	formatDay,
	formatDuration,
	formatMonth,
	formatMonthRange,
	formatTime,
	fromDateTimeInput,
	toDateTimeInput,
} from "@/lib/format";
import { SYSTEM_ACTOR } from "@/lib/services/context";
import { loadSiteSettings } from "@/lib/site";
import { CachedStore } from "@/lib/store/cached";
import {
	brandStyle,
	readableForeground,
	resolveTheme,
	sanitizeCss,
	THEMES,
} from "@/lib/theme";
import { ICO_FAVICON, JPEG_LOGO, PNG_LOGO } from "../brand-asset-bytes";
import { Clock, FakeNotifier } from "../helpers";

async function setup(env: Record<string, string> = {}) {
	const clock = new Clock();
	const app = await createApp({
		config: loadConfig(env),
		notifier: new FakeNotifier(),
		now: clock.now,
	});
	setApp(app);
	return { app, clock, services: app.services };
}

afterEach(() => setApp(undefined));

function assetRequest(kind: "logo" | "favicon", version?: string): Request {
	const url = new URL(`https://status.example/brand/${kind}`);
	if (version) {
		url.searchParams.set("v", version);
	}
	return new Request(url);
}

function logoRequest(version?: string): Request {
	return assetRequest("logo", version);
}

describe("API routes", () => {
	it("reports health", async () => {
		const { app } = await setup();
		const ok = await health();
		expect(ok.status).toBe(200);
		expect(await ok.json()).toMatchObject({
			status: "ok",
			store: { online: true, kind: "memory" },
		});

		vi.spyOn(app.store.inner, "ping").mockRejectedValueOnce(new Error("down"));
		const degraded = await health();
		expect(degraded.status).toBe(200);
		expect(await degraded.json()).toMatchObject({
			status: "degraded",
			store: { online: false, lastError: "down" },
		});

		setApp(Promise.reject(new Error("cannot connect")));
		const unavailable = await health();
		expect(unavailable.status).toBe(503);
		expect(await unavailable.json()).toEqual({
			status: "unavailable",
			error: "cannot connect",
		});

		setApp(Promise.reject("weird"));
		expect(await (await health()).json()).toEqual({
			status: "unavailable",
			error: "weird",
		});
	});

	it("serves the uploaded logo and a 404 when none is stored", async () => {
		const { app, services } = await setup();
		const missing = await logo(logoRequest());
		expect(missing.status).toBe(404);
		expect(missing.headers.get("cache-control")).toBe("no-store");
		expect(missing.headers.get("x-content-type-options")).toBe("nosniff");
		const missingVersion = await logo(logoRequest("2026-11-02T12:00:00.000Z"));
		expect(missingVersion.status).toBe(404);
		expect(missingVersion.headers.get("cache-control")).toBe("no-store");

		const down = vi.spyOn(app.store.inner, "get");
		down.mockRejectedValueOnce(new Error("down"));
		const unavailable = await logo(logoRequest("2026-11-02T12:00:00.000Z"));
		expect(unavailable.status).toBe(404);
		expect(unavailable.headers.get("cache-control")).toBe("no-store");
		down.mockRestore();

		const saved = await services.settings.updateBranding(
			SYSTEM_ACTOR,
			{},
			{ logo: { bytes: PNG_LOGO } },
		);
		const response = await logo(logoRequest(saved.logoUpdatedAt));
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
		expect(response.headers.get("content-security-policy")).toContain(
			"sandbox",
		);
		expect(Buffer.from(await response.arrayBuffer())).toEqual(
			Buffer.from(PNG_LOGO),
		);

		const unversioned = await logo(logoRequest());
		expect(unversioned.status).toBe(200);
		expect(unversioned.headers.get("cache-control")).toBe("no-store");
	});

	it("refreshes a stale logo instead of caching it", async () => {
		const { app, services } = await setup();
		await services.settings.updateBranding(
			SYSTEM_ACTOR,
			{},
			{ logo: { bytes: PNG_LOGO } },
		);
		const stale = await services.settings.getBrandAsset("logo");
		const nextAt = "2026-11-02T13:00:00.000Z";
		await app.store.inner.update("brand_assets", {
			id: stale?.id ?? "logo",
			contentType: "image/jpeg",
			data: Buffer.from(JPEG_LOGO).toString("base64"),
			updatedAt: nextAt,
		});

		const refreshed = await logo(logoRequest(nextAt));
		expect(refreshed.headers.get("content-type")).toBe("image/jpeg");
		expect(refreshed.headers.get("cache-control")).toBe(
			"public, max-age=86400",
		);
		expect(Buffer.from(await refreshed.arrayBuffer())).toEqual(
			Buffer.from(JPEG_LOGO),
		);

		const other = await logo(logoRequest("2020-01-01T00:00:00.000Z"));
		expect(other.headers.get("content-type")).toBe("image/jpeg");
		expect(other.headers.get("cache-control")).toBe("no-store");

		vi.spyOn(app.store.inner, "get").mockRejectedValueOnce(new Error("down"));
		const duringOutage = await logo(logoRequest(nextAt));
		expect(duringOutage.headers.get("content-type")).toBe("image/png");
		expect(duringOutage.headers.get("cache-control")).toBe("no-store");
		expect(Buffer.from(await duringOutage.arrayBuffer())).toEqual(
			Buffer.from(PNG_LOGO),
		);

		vi.spyOn(app.store.inner, "get").mockRejectedValueOnce(
			new ValidationError("bad"),
		);
		await expect(
			logo(logoRequest("2020-01-01T00:00:00.000Z")),
		).rejects.toBeInstanceOf(ValidationError);
	});

	it("serves the logo and the favicon from memory after a restart", async () => {
		const first = await setup();
		const saved = await first.services.settings.updateBranding(
			SYSTEM_ACTOR,
			{},
			{ logo: { bytes: PNG_LOGO }, favicon: { bytes: ICO_FAVICON } },
		);

		// A new process has an empty cache. It reads the files at startup.
		const restarted = await createApp({
			config: loadConfig({}),
			store: new CachedStore(first.app.store.inner),
			notifier: new FakeNotifier(),
		});
		setApp(restarted);
		vi.spyOn(restarted.store.inner, "get").mockRejectedValue(new Error("down"));

		const icon = await favicon(assetRequest("favicon", saved.faviconUpdatedAt));
		expect(icon.status).toBe(200);
		expect(icon.headers.get("content-type")).toBe("image/x-icon");
		expect(icon.headers.get("cache-control")).toBe("public, max-age=86400");
		expect(Buffer.from(await icon.arrayBuffer())).toEqual(
			Buffer.from(ICO_FAVICON),
		);
		const image = await logo(logoRequest(saved.logoUpdatedAt));
		expect(image.status).toBe(200);
		expect(Buffer.from(await image.arrayBuffer())).toEqual(
			Buffer.from(PNG_LOGO),
		);
		expect(await loadSiteSettings()).toMatchObject({
			logoUpdatedAt: saved.logoUpdatedAt,
			faviconUpdatedAt: saved.faviconUpdatedAt,
		});
	});

	it("serves the public status json", async () => {
		const { services } = await setup();
		const api = await services.catalog.create(SYSTEM_ACTOR, {
			name: "API",
			description: "Public",
			group: "Core",
		});
		const hidden = await services.catalog.create(SYSTEM_ACTOR, {
			name: "Secret",
			hidden: true,
		});
		const web = await services.catalog.create(SYSTEM_ACTOR, { name: "Web" });
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "Down",
			message: "Looking",
			impact: "critical",
			serviceIds: [api.id, hidden.id],
		});
		await services.incidents.postUpdate(SYSTEM_ACTOR, incident.id, {
			message: "Still looking",
		});
		await services.incidents.create(SYSTEM_ACTOR, {
			kind: "maintenance",
			title: "Upgrade",
			message: "Soon",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T01:00:00.000Z",
		});
		const response = await status();
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		const body = await response.json();
		expect(body.status).toEqual({
			indicator: "major_outage",
			description: "We're experiencing a major outage",
		});
		expect(body.services).toEqual([
			{
				id: api.id,
				name: "API",
				description: "Public",
				group: "Core",
				status: "major_outage",
				uptime: null,
			},
			{
				id: web.id,
				name: "Web",
				description: null,
				group: null,
				status: "operational",
				uptime: null,
			},
		]);
		expect(body.incidents[0]).toMatchObject({
			title: "Down",
			services: [api.id],
			resolvedAt: null,
			scheduledStart: null,
		});
		expect(
			body.incidents[0].updates.map((u: { message: string }) => u.message),
		).toEqual(["Still looking", "Looking"]);
		expect(body.maintenance.upcoming[0]).toMatchObject({
			title: "Upgrade",
			scheduledStart: "2026-11-05T00:00:00.000Z",
		});
		expect(body.page).toEqual({ name: "Status", url: null });
	});

	it("serves an rss feed with one item for each update", async () => {
		const { services, clock } = await setup();
		const empty = await (
			await feed(new Request("https://status.acme.dev/feed.xml"))
		).text();
		expect(empty).toContain(
			'<atom:link href="https://status.acme.dev/feed.xml" rel="self" type="application/rss+xml"/>',
		);
		expect(empty).not.toContain("<item>");
		expect(empty).not.toContain("<lastBuildDate>");

		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		const hidden = await services.catalog.create(SYSTEM_ACTOR, {
			name: "Secret",
			hidden: true,
		});
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "Down & out",
			message: "<b>Looking</b>\nsecond line",
			serviceIds: [api.id, hidden.id],
		});
		clock.advance(60_000);
		await services.incidents.create(SYSTEM_ACTOR, {
			kind: "maintenance",
			title: "DB upgrade",
			message: "Upgrading",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T02:00:00.000Z",
		});
		clock.advance(60_000);
		const fixed = await services.incidents.resolve(
			SYSTEM_ACTOR,
			incident.id,
			"Fixed",
		);

		const response = await feed(
			new Request("https://status.acme.dev/feed.xml"),
		);
		expect(response.headers.get("content-type")).toContain(
			"application/rss+xml",
		);
		const xml = await response.text();
		const items = xml.split("<item>").slice(1);
		expect(
			items.map((item) => /<title>(.*?)<\/title>/.exec(item)?.[1]),
		).toEqual([
			"Resolved: Down &amp; out",
			"Scheduled: DB upgrade",
			"Investigating: Down &amp; out",
		]);
		expect(items[0]).toContain(
			`<guid isPermaLink="false">${fixed.updates[1]?.id}</guid>`,
		);
		expect(items[0]).toContain(
			`<link>https://status.acme.dev/incidents/${incident.id}</link>`,
		);
		expect(items[0]).toContain(
			"<pubDate>Mon, 02 Nov 2026 12:02:00 GMT</pubDate>",
		);
		expect(xml).toContain(
			"<lastBuildDate>Mon, 02 Nov 2026 12:02:00 GMT</lastBuildDate>",
		);
		expect(items[1]).toContain("<category>Maintenance</category>");
		expect(items[1]).toContain(
			"&lt;p&gt;Window: Nov 5, 2026, 00:00 UTC to Nov 5, 2026, 02:00 UTC&lt;/p&gt;",
		);
		expect(items[2]).toContain("<category>Incident</category>");
		expect(items[2]).toContain(
			"<description>&lt;p&gt;&amp;lt;b&amp;gt;Looking&amp;lt;/b&amp;gt;&lt;br&gt;second line&lt;/p&gt;&lt;p&gt;Affected services: API&lt;/p&gt;</description>",
		);
		expect(xml).not.toContain("Secret");

		await services.settings.update(SYSTEM_ACTOR, {
			siteUrl: "https://configured.example.com",
		});
		expect(
			await (await feed(new Request("http://internal/feed.xml"))).text(),
		).toContain("https://configured.example.com/incidents/");
	});

	it("puts the newest updates in the feed, also from an older open incident", async () => {
		const { services, clock } = await setup();
		const old = await services.incidents.create(SYSTEM_ACTOR, {
			title: "Long outage",
			message: "Looking",
		});
		for (let index = 0; index < FEED_ITEM_LIMIT; index++) {
			clock.advance(60_000);
			await services.incidents.create(SYSTEM_ACTOR, {
				title: `Blip ${index}`,
				message: "Gone",
				status: "resolved",
			});
		}
		clock.advance(60_000);
		await services.incidents.postUpdate(SYSTEM_ACTOR, old.id, {
			message: "Still looking",
		});
		const xml = await (
			await feed(
				new Request("http://internal/feed.xml", {
					headers: { "x-forwarded-host": "status.acme.dev" },
				}),
			)
		).text();
		const items = xml.split("<item>").slice(1);
		expect(items).toHaveLength(FEED_ITEM_LIMIT);
		expect(items[0]).toContain("<title>Investigating: Long outage</title>");
		expect(items[0]).toContain(
			`<link>https://status.acme.dev/incidents/${old.id}</link>`,
		);
		expect(xml).not.toContain("Blip 0<");
	});

	it("routes MCP requests through the app", async () => {
		await setup();
		const response = await mcp(
			new Request("http://localhost/api/mcp", { method: "POST", body: "{}" }),
		);
		expect(response.status).toBe(401);
	});

	it("routes the OAuth endpoints through the app", async () => {
		await setup({ SITE_URL: "https://status.acme.dev" });
		const get = new Request("http://internal/.well-known/x");
		for (const route of [resourceMetadata, resourceMetadataForPath]) {
			expect(await (await route(get)).json()).toMatchObject({
				resource: "https://status.acme.dev/api/mcp",
			});
		}
		expect(await (await serverMetadata(get)).json()).toMatchObject({
			issuer: "https://status.acme.dev",
		});
		const registered = await register(
			new Request("http://internal/oauth/register", {
				method: "POST",
				body: JSON.stringify({ redirect_uris: ["http://localhost:1/cb"] }),
			}),
		);
		expect(registered.status).toBe(201);
		const tokens = await token(
			new Request("http://internal/oauth/token", {
				method: "POST",
				body: "grant_type=client_credentials",
			}),
		);
		expect(await tokens.json()).toMatchObject({
			error: "unsupported_grant_type",
		});
	});
});

describe("feed helpers", () => {
	it("escapes each xml special character", () => {
		expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
			"&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;",
		);
	});
});

describe("site settings", () => {
	it("loads settings and falls back when the app fails", async () => {
		await setup({ SITE_NAME: "Acme" });
		expect((await loadSiteSettings()).siteName).toBe("Acme");
		setApp(Promise.reject(new Error("db down")));
		expect((await loadSiteSettings()).allowSubscriptions).toBe(false);
	});
});

describe("format helpers", () => {
	it("formats dates in UTC", () => {
		expect(formatDateTime("2026-11-02T14:05:00.000Z")).toBe(
			"Nov 2, 2026, 14:05 UTC",
		);
		expect(formatTime("2026-11-02T16:05:00.000+02:00")).toBe("14:05 UTC");
		expect(formatDay("2026-11-02")).toBe("Nov 2, 2026");
		expect(formatDay("2026-11-02T23:59:00.000Z")).toBe("Nov 2, 2026");
		expect(formatMonth("2026-11")).toBe("November 2026");
		expect(
			formatMonthRange(
				new Date("2026-08-05T00:00:00Z"),
				new Date("2026-11-02T00:00:00Z"),
			),
		).toBe("Aug 2026 – Nov 2026");
		expect(
			formatMonthRange(
				new Date("2026-11-01T00:00:00Z"),
				new Date("2026-11-02T00:00:00Z"),
			),
		).toBe("Nov 2026");
	});

	it("formats durations", () => {
		expect(formatDuration(30_000)).toBe("< 1m");
		expect(formatDuration(45 * 60_000)).toBe("45m");
		expect(formatDuration(2 * 3_600_000)).toBe("2h");
		expect(formatDuration(26 * 3_600_000 + 5 * 60_000)).toBe("1d 2h 5m");
	});

	it("converts datetime-local values", () => {
		expect(toDateTimeInput("2026-11-02T14:05:00.000Z")).toBe(
			"2026-11-02T14:05",
		);
		expect(toDateTimeInput(undefined)).toBe("");
		expect(fromDateTimeInput("2026-11-02T14:05")).toBe(
			"2026-11-02T14:05:00.000Z",
		);
		expect(fromDateTimeInput("2026-11-02T14:05:30")).toBe(
			"2026-11-02T14:05:30.000Z",
		);
		expect(fromDateTimeInput("")).toBeUndefined();
		expect(fromDateTimeInput("garbage")).toBe("garbage");
	});
});

describe("theme helpers", () => {
	it("has a stylesheet for each preset and no stylesheet without a preset", () => {
		const globals = readFileSync("src/app/globals.css", "utf8");
		for (const theme of THEMES) {
			const css = readFileSync(`src/themes/${theme.id}.css`, "utf8");
			expect(css).toContain(`[data-theme="${theme.id}"]`);
			// The design guide names only tokens that each preset sets.
			for (const token of DESIGN_TOKENS) {
				expect(css, `${theme.id} ${token.name}`).toContain(`${token.name}:`);
			}
			expect(globals).toContain(`@import "../themes/${theme.id}.css";`);
		}
		expect(readdirSync("src/themes").sort()).toEqual(
			THEMES.map((theme) => `${theme.id}.css`).sort(),
		);
	});

	it("resolves themes and brand colors", () => {
		expect(THEMES.map((theme) => theme.id)).toEqual([
			"default",
			"carbon",
			"terminal",
			"ocean",
			"sunset",
			"mono",
		]);
		expect(resolveTheme("ocean")).toBe("ocean");
		// A stored id of a removed preset resolves to the preset that replaced it.
		expect(resolveTheme("midnight")).toBe("carbon");
		expect(resolveTheme("nope")).toBe("default");
		expect(resolveTheme(undefined)).toBe("default");
		expect(readableForeground("#ffffff")).toBe("#0b0b0f");
		expect(readableForeground("#000000")).toBe("#ffffff");
		expect(readableForeground("#020202")).toBe("#ffffff");
		expect(brandStyle({})).toEqual({});
		expect(brandStyle({ brandColor: "#4f46e5" })).toEqual({
			"--ic-brand": "#4f46e5",
			"--ic-brand-fg": "#ffffff",
		});
		expect(sanitizeCss(undefined)).toBe("");
		expect(sanitizeCss("a</style>")).toBe("a\\3c /style>");
	});
});
