import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorPage from "@/app/error";
import HistoryPage, {
	generateMetadata as historyMetadata,
} from "@/app/history/page";
import IncidentPage, {
	generateMetadata as incidentMetadata,
} from "@/app/incidents/[id]/page";
import RootLayout, {
	generateMetadata as layoutMetadata,
	viewport,
} from "@/app/layout";
import NotFound from "@/app/not-found";
import StatusPage, { generateMetadata as statusMetadata } from "@/app/page";
import ConfirmPage from "@/app/subscribe/confirm/page";
import SubscribePage from "@/app/subscribe/page";
import ServicesPage from "@/app/subscribe/services/page";
import UnsubscribePage from "@/app/subscribe/unsubscribe/page";
import { setApp } from "@/lib/app";
import { DESIGN_SELECTORS, NO_DATA_STATUS } from "@/lib/design";
import { SYSTEM_ACTOR } from "@/lib/services/context";
import { ICO_FAVICON, PNG_LOGO } from "../brand-asset-bytes";
import { expectNotFound, flashQueryParams, params, setupApp } from "./app";

describe("root layout", () => {
	it("applies the theme and escaped custom css", async () => {
		const { services } = await setupApp({ SITE_NAME: "Acme" });
		await services.settings.update(SYSTEM_ACTOR, {
			theme: "ocean",
			customCss: "body{color:red}</style><script>alert(1)</script>",
			description: "Acme services",
		});
		await services.settings.updateBranding(
			SYSTEM_ACTOR,
			{},
			{ favicon: { bytes: ICO_FAVICON } },
		);
		const html = renderToStaticMarkup(
			await RootLayout({ children: <p>child</p> }),
		);
		expect(html).toContain('data-theme="ocean"');
		expect(html).toContain("body{color:red}\\3c /style>\\3c script>");
		expect(html).not.toContain("<script>alert");
		expect(html).toContain("<p>child</p>");
		const metadata = await layoutMetadata();
		expect(metadata.title).toEqual({ default: "Acme", template: "%s · Acme" });
		expect(metadata.description).toBe("Acme services");
		expect(metadata.icons).toEqual({
			icon: "/brand/favicon?v=2026-11-02T12%3A00%3A00.000Z",
		});
		expect(metadata.alternates).toEqual({
			types: { "application/rss+xml": "/feed.xml" },
		});
		expect(viewport.width).toBe("device-width");
	});

	it("falls back to defaults without custom settings or a working app", async () => {
		await setupApp();
		const html = renderToStaticMarkup(await RootLayout({ children: null }));
		expect(html).toContain('data-theme="default"');
		expect(html).not.toContain("custom-css");
		const metadata = await layoutMetadata();
		expect(metadata.description).toBe(
			"Current status and incident history for Status.",
		);
		expect(metadata.icons).toBeUndefined();

		setApp(Promise.reject(new Error("db down")));
		vi.stubEnv("SITE_NAME", "Fallback");
		expect((await layoutMetadata()).title).toEqual({
			default: "Fallback",
			template: "%s · Fallback",
		});
		vi.stubEnv("SITE_NAME", "");
		expect((await layoutMetadata()).title).toEqual({
			default: "Status",
			template: "%s · Status",
		});
		vi.unstubAllEnvs();
	});
});

describe("status page", () => {
	it("renders an empty, operational page", async () => {
		const { services } = await setupApp();
		for (const channel of ["email", "webhook"] as const) {
			await services.notificationSettings.updateChannel(SYSTEM_ACTOR, channel, {
				enabled: false,
			});
		}
		render(await StatusPage());
		expect(
			screen.getByRole("heading", { name: "We're fully operational" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("No services have been added yet."),
		).toBeInTheDocument();
		expect(
			screen.getByText("No incidents reported in the last 14 days."),
		).toBeInTheDocument();
		expect(screen.queryByText("Subscribe to updates")).not.toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Status" })).toHaveAttribute(
			"href",
			"/",
		);
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Incident Command" }),
		).toHaveAttribute("href", "https://github.com/jaredwray/incident-command");
		expect(screen.getByRole("link", { name: "RSS" })).toHaveAttribute(
			"href",
			"/feed.xml",
		);
		expect(screen.getByRole("link", { name: "llms.txt" })).toHaveAttribute(
			"href",
			"/llms.txt",
		);
		expect(
			(await statusMetadata({ searchParams: params({}) })).alternates,
		).toEqual({
			types: {
				"application/rss+xml": "/feed.xml",
				"text/markdown": "/llms.txt",
			},
		});
		expect(
			(await statusMetadata({ searchParams: params({ region: "" }) }))
				.alternates,
		).toEqual({
			types: {
				"application/rss+xml": "/feed.xml",
				"text/markdown": "/llms.txt",
			},
		});
	});

	it("renders services, incidents and maintenance", async () => {
		const { services, clock } = await setupApp();
		await services.settings.update(SYSTEM_ACTOR, {
			siteName: "Acme",
			description: "Live status for Acme",
			supportUrl: "https://acme.dev/help",
		});
		clock.set("2026-10-01T00:00:00.000Z");
		const api = await services.catalog.create(SYSTEM_ACTOR, {
			name: "API",
			group: "Core",
			description: "Public API",
		});
		await services.catalog.create(SYSTEM_ACTOR, { name: "Website" });
		clock.set("2026-11-02T12:00:00.000Z");
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "API errors",
			message: "Looking into it",
			impact: "major",
			serviceIds: [api.id],
		});
		await services.incidents.create(SYSTEM_ACTOR, {
			kind: "maintenance",
			title: "DB upgrade",
			message: "Upgrading",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T02:00:00.000Z",
		});
		await services.incidents.create(SYSTEM_ACTOR, {
			kind: "maintenance",
			title: "Edge migration",
			message: "Migrating",
			status: "in_progress",
			scheduledStart: "2026-11-02T11:00:00.000Z",
			scheduledEnd: "2026-11-02T13:00:00.000Z",
		});
		render(await StatusPage());
		expect(
			screen.getByRole("heading", {
				name: "We're experiencing a partial outage",
			}),
		).toBeInTheDocument();
		expect(screen.getByText("Live status for Acme")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Support" })).toHaveAttribute(
			"href",
			"https://acme.dev/help",
		);
		expect(
			screen.getByRole("link", { name: "Subscribe to updates" }),
		).toHaveAttribute("href", "/subscribe");

		const active = screen.getByRole("region", { name: "Active incidents" });
		expect(
			within(active).getByRole("link", { name: "API errors" }),
		).toBeInTheDocument();
		expect(within(active).getByText("Affects API")).toBeInTheDocument();
		expect(within(active).getByText("Edge migration")).toBeInTheDocument();
		expect(screen.getByText("Upcoming maintenance")).toBeInTheDocument();
		expect(screen.getByText("DB upgrade")).toBeInTheDocument();

		expect(screen.getByText("Core")).toBeInTheDocument();
		expect(screen.getByText("Partial outage")).toBeInTheDocument();
		expect(screen.getByText("100% uptime")).toBeInTheDocument();
		expect(
			screen.getAllByRole("listitem", { name: /Nov 2, 2026/ }).length,
		).toBeGreaterThan(0);
		expect(screen.getByText("Aug 2026 – Nov 2026")).toBeInTheDocument();
		expect(screen.getAllByText("API errors").length).toBeGreaterThan(1);
	});

	it("removes the product credit when the admin turns it off", async () => {
		const { services } = await setupApp();
		await services.settings.update(SYSTEM_ACTOR, { showPoweredBy: false });
		render(await StatusPage());
		expect(screen.queryByText(/Powered by/)).not.toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "Incident Command" }),
		).not.toBeInTheDocument();
		// The other links of the footer stay.
		expect(screen.getByRole("link", { name: "RSS" })).toHaveAttribute(
			"href",
			"/feed.xml",
		);
	});

	it("shows an uploaded logo in the header", async () => {
		const { services } = await setupApp();
		await services.settings.update(SYSTEM_ACTOR, { siteName: "Acme" });
		await services.settings.updateBranding(
			SYSTEM_ACTOR,
			{},
			{ logo: { bytes: PNG_LOGO } },
		);
		render(await StatusPage());
		expect(screen.getByRole("img", { name: "Acme" })).toHaveAttribute(
			"src",
			"/brand/logo?v=2026-11-02T12%3A00%3A00.000Z",
		);
	});

	it("has each selector of the design guide on the public pages", async () => {
		const { services, clock } = await setupApp();
		await services.settings.update(SYSTEM_ACTOR, { description: "Live" });
		clock.set("2026-10-01T00:00:00.000Z");
		const api = await services.catalog.create(SYSTEM_ACTOR, {
			name: "API",
			group: "Core",
		});
		clock.set("2026-11-02T12:00:00.000Z");
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "API errors",
			message: "Looking into it",
			impact: "major",
			serviceIds: [api.id],
		});
		await services.regions.create(SYSTEM_ACTOR, { name: "United States" });
		// The header shows the site name, then the logo.
		render(await StatusPage());
		await services.settings.updateBranding(
			SYSTEM_ACTOR,
			{},
			{ logo: { bytes: PNG_LOGO } },
		);
		render(await StatusPage());
		render(await IncidentPage({ params: params({ id: incident.id }) }));
		render(await SubscribePage({ searchParams: params({}) }));

		for (const { selector, attributes } of DESIGN_SELECTORS) {
			const element = document.querySelector(selector);
			expect(element, selector).not.toBeNull();
			for (const name of Object.keys(attributes ?? {})) {
				expect(element, selector).toHaveAttribute(name);
			}
		}
		for (const selector of [
			'.ic-banner[data-status="partial_outage"]',
			'.ic-incident[data-kind="incident"][data-status="partial_outage"]',
			'.ic-service[data-status="partial_outage"]',
			'.ic-uptime-day[data-status="operational"]',
			`.ic-uptime-day[data-status="${NO_DATA_STATUS}"]`,
		]) {
			expect(document.querySelector(selector), selector).not.toBeNull();
		}
	});

	it("shows every outage on Overview and one tab for each region", async () => {
		const { services } = await setupApp();
		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		const united = await services.regions.create(SYSTEM_ACTOR, {
			name: "United States",
		});
		const europe = await services.regions.create(SYSTEM_ACTOR, {
			name: "Europe",
		});
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "US only",
			message: "Down",
			impact: "critical",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [united.id] }],
		});
		const web = await services.catalog.create(SYSTEM_ACTOR, { name: "Web" });
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "Everywhere",
			message: "Wide",
			impact: "major",
			serviceIds: [api.id],
		});
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "Split",
			message: "Down",
			impact: "major",
			serviceIds: [api.id, web.id],
			serviceRegions: [
				{ serviceId: api.id, regionIds: [united.id] },
				{ serviceId: web.id, regionIds: [europe.id] },
			],
		});
		const global = render(await StatusPage());
		const tabs = within(screen.getByRole("navigation", { name: "Regions" }));
		expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(tabs.getByRole("link", { name: "United States" })).toHaveAttribute(
			"href",
			`/?region=${united.id}`,
		);
		expect(screen.getAllByText("US only").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Everywhere").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Split").length).toBeGreaterThan(0);
		expect(document.querySelector(".ic-banner")).toHaveAttribute(
			"data-status",
			"major_outage",
		);
		global.unmount();

		render(
			await StatusPage({
				searchParams: params({ region: europe.id }),
			}),
		);
		expect(screen.getByRole("link", { name: "Europe" })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(screen.queryAllByText("US only")).toEqual([]);
		const split = screen
			.getByRole("heading", { name: "Split" })
			.closest("article");
		expect(split).toHaveTextContent("Affects Web");
		expect(split).not.toHaveTextContent("API");
		expect(screen.queryAllByText("Everywhere")).toEqual([]);
		expect(screen.getAllByText("Partial outage").length).toBeGreaterThan(0);
		expect(screen.queryAllByText("Major outage")).toEqual([]);
		expect(
			screen.getByRole("link", { name: "View history →" }),
		).toHaveAttribute("href", `/history?region=${europe.id}`);
		expect(
			(
				await statusMetadata({
					searchParams: params({ region: europe.id }),
				})
			).alternates,
		).toEqual({
			types: {
				"application/rss+xml": "/feed.xml",
				"text/markdown": `/llms.txt?region=${europe.id}`,
			},
		});
		await expectNotFound(
			StatusPage({ searchParams: params({ region: "reg_missing" }) }),
		);
	});
});

describe("incident page", () => {
	it("renders an incident with its timeline", async () => {
		const { services, clock } = await setupApp();
		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		const hidden = await services.catalog.create(SYSTEM_ACTOR, {
			name: "Secret",
			hidden: true,
		});
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "API errors",
			message: "Investigating",
			impact: "critical",
			serviceIds: [api.id, hidden.id],
		});
		clock.advance(95 * 60_000);
		await services.incidents.postUpdate(SYSTEM_ACTOR, incident.id, {
			status: "resolved",
			title: "API restored",
			impact: "minor",
			message: "All good",
		});
		render(await IncidentPage({ params: params({ id: incident.id }) }));
		expect(
			screen.getByRole("heading", { level: 1, name: "API restored" }),
		).toBeInTheDocument();
		expect(screen.getByText("API errors")).toBeInTheDocument();
		expect(screen.getAllByText("Critical impact")).toHaveLength(1);
		expect(screen.getAllByText("Minor impact").length).toBeGreaterThan(1);
		expect(
			screen.getByText("Resolved", { selector: "dt" }),
		).toBeInTheDocument();
		expect(screen.getByText(/1h 35m/, { selector: "dd" })).toBeInTheDocument();
		expect(screen.getByText("API", { selector: "dd" })).toBeInTheDocument();
		expect(screen.queryByText(/Secret/)).not.toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "← Back to status" }),
		).toHaveAttribute("href", "/");
		expect(
			screen.getByRole("heading", { name: "Status of the affected services" }),
		).toBeInTheDocument();
		expect(
			within(
				screen.getByRole("list", { name: "API: status for each minute" }),
			).getByRole("listitem", { name: "Major outage: 1h 35m" }),
		).toBeInTheDocument();
		expect(screen.getByText("All good")).toBeInTheDocument();
		expect(screen.queryByText(/System \(system\)/)).not.toBeInTheDocument();
		expect(
			await incidentMetadata({ params: params({ id: incident.id }) }),
		).toEqual({
			title: "API restored",
			alternates: {
				types: {
					"application/rss+xml": "/feed.xml",
					"text/markdown": `/incidents/${incident.id}.md`,
				},
			},
		});
	});

	it("names the region and links back to that tab", async () => {
		const { app, services } = await setupApp();
		const united = await services.regions.create(SYSTEM_ACTOR, {
			name: "United States",
		});
		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "US down",
			message: "Down",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [united.id] }],
		});
		const page = render(
			await IncidentPage({ params: params({ id: incident.id }) }),
		);
		expect(screen.getByText("Region", { selector: "dt" })).toBeInTheDocument();
		expect(
			screen.getByText("United States", { selector: "dd" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "← Back to status" }),
		).toHaveAttribute("href", `/?region=${united.id}`);
		page.unmount();
		const europe = await services.regions.create(SYSTEM_ACTOR, {
			name: "Europe",
		});
		const wide = await services.incidents.create(SYSTEM_ACTOR, {
			title: "Two regions",
			message: "Down",
			serviceIds: [api.id],
			serviceRegions: [
				{ serviceId: api.id, regionIds: [united.id, europe.id] },
			],
		});
		const widePage = render(
			await IncidentPage({ params: params({ id: wide.id }) }),
		);
		expect(screen.getByText("Regions", { selector: "dt" })).toBeInTheDocument();
		expect(
			screen.getByText("United States, Europe", { selector: "dd" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "← Back to status" }),
		).toHaveAttribute("href", "/");
		widePage.unmount();
		await app.store.delete("regions", united.id);
		await app.store.delete("regions", europe.id);
		render(await IncidentPage({ params: params({ id: incident.id }) }));
		expect(
			screen.queryByText("Region", { selector: "dt" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "← Back to status" }),
		).toHaveAttribute("href", "/");
	});

	it("renders maintenance windows", async () => {
		const { services } = await setupApp();
		const maintenance = await services.incidents.create(SYSTEM_ACTOR, {
			kind: "maintenance",
			title: "DB upgrade",
			message: "Upgrading",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T02:00:00.000Z",
		});
		await services.incidents.resolve(SYSTEM_ACTOR, maintenance.id);
		render(await IncidentPage({ params: params({ id: maintenance.id }) }));
		expect(screen.getByText("Scheduled maintenance")).toBeInTheDocument();
		expect(screen.getByText("Window")).toBeInTheDocument();
		expect(
			screen.getByText("Completed", { selector: "dt" }),
		).toBeInTheDocument();
		expect(screen.queryByText(/impact$/)).not.toBeInTheDocument();
		expect(
			screen.queryByRole("heading", {
				name: "Status of the affected services",
			}),
		).not.toBeInTheDocument();
	});

	it("404s for unknown incidents", async () => {
		const { services } = await setupApp();
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "Hidden",
			message: "x",
		});
		await services.incidents.delete(SYSTEM_ACTOR, incident.id, {
			reason: "Duplicate",
		});
		await expectNotFound(IncidentPage({ params: params({ id: "nope" }) }));
		await expectNotFound(IncidentPage({ params: params({ id: incident.id }) }));
		expect(await incidentMetadata({ params: params({ id: "nope" }) })).toEqual({
			title: "Incident not found",
		});
		expect(
			await incidentMetadata({ params: params({ id: incident.id }) }),
		).toEqual({ title: "Incident not found" });
	});
});

describe("history page", () => {
	it("lists months with pagination", async () => {
		const { services, clock } = await setupApp();
		clock.set("2026-05-05T00:00:00.000Z");
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "May blip",
			message: "x",
			status: "resolved",
		});
		clock.set("2026-10-10T00:00:00.000Z");
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "October blip",
			message: "x",
			status: "resolved",
		});
		clock.set("2026-11-02T12:00:00.000Z");
		render(await HistoryPage({ searchParams: params({}) }));
		expect(
			screen.getByRole("heading", { name: "November 2026" }),
		).toBeInTheDocument();
		expect(screen.getByText("October blip")).toBeInTheDocument();
		expect(screen.getAllByText("No incidents reported.")).toHaveLength(2);
		expect(screen.getByRole("link", { name: "← Older" })).toHaveAttribute(
			"href",
			"/history?month=2026-08",
		);
		expect(
			screen.queryByRole("link", { name: "Newer →" }),
		).not.toBeInTheDocument();
		expect(
			(await historyMetadata({ searchParams: params({}) })).alternates,
		).toEqual({
			types: {
				"application/rss+xml": "/feed.xml",
				"text/markdown": "/history.md",
			},
		});
	});

	it("links to newer pages from the earliest page", async () => {
		const { services, clock } = await setupApp();
		clock.set("2026-05-05T00:00:00.000Z");
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "May blip",
			message: "x",
			status: "resolved",
		});
		clock.set("2026-11-02T12:00:00.000Z");
		render(await HistoryPage({ searchParams: params({ month: "2026-05" }) }));
		expect(screen.getByText("May blip")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Newer →" })).toHaveAttribute(
			"href",
			"/history?month=2026-08",
		);
		expect(
			screen.queryByRole("link", { name: "← Older" }),
		).not.toBeInTheDocument();
		expect(
			await historyMetadata({ searchParams: params({ month: "2026-05" }) }),
		).toEqual({
			title: "Incident history",
			alternates: {
				types: {
					"application/rss+xml": "/feed.xml",
					"text/markdown": "/history.md?month=2026-05",
				},
			},
		});
	});

	it("shows no pagination when no incident started", async () => {
		await setupApp();
		render(await HistoryPage({ searchParams: params({ month: "1775-02" }) }));
		expect(
			screen.getByRole("heading", { name: "November 2026" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("navigation", { name: "History pagination" }),
		).not.toBeInTheDocument();
	});

	it("keeps the region on history links", async () => {
		const { services, clock } = await setupApp();
		const united = await services.regions.create(SYSTEM_ACTOR, {
			name: "United States",
		});
		clock.set("2026-05-05T00:00:00.000Z");
		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "May blip",
			message: "x",
			status: "resolved",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [united.id] }],
		});
		clock.set("2026-11-02T12:00:00.000Z");
		render(
			await HistoryPage({
				searchParams: params({ month: "2026-05", region: united.id }),
			}),
		);
		expect(screen.getAllByText("United States").length).toBeGreaterThan(0);
		expect(screen.getByRole("link", { name: "Newer →" })).toHaveAttribute(
			"href",
			`/history?month=2026-08&region=${united.id}`,
		);
		expect(
			screen.getByRole("link", { name: "Current status" }),
		).toHaveAttribute("href", `/?region=${united.id}`);
		expect(
			await historyMetadata({
				searchParams: params({ month: "2026-05", region: united.id }),
			}),
		).toEqual({
			title: "Incident history",
			alternates: {
				types: {
					"application/rss+xml": "/feed.xml",
					"text/markdown": `/history.md?month=2026-05&region=${united.id}`,
				},
			},
		});
		await expectNotFound(
			HistoryPage({ searchParams: params({ region: "reg_missing" }) }),
		);
	});
});

describe("subscription pages", () => {
	it("shows the form, outcomes and errors", async () => {
		await setupApp({ SITE_NAME: "Acme" });
		const { unmount } = render(
			await SubscribePage({ searchParams: params({}) }),
		);
		expect(
			screen.getByRole("heading", { name: "Get Acme updates" }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "unsubscribe" })).toHaveAttribute(
			"href",
			"/subscribe/unsubscribe",
		);
		expect(screen.getByLabelText("Email address")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "RSS feed" })).toHaveAttribute(
			"href",
			"/feed.xml",
		);
		unmount();

		const errored = render(
			await SubscribePage({
				searchParams: params(flashQueryParams({ error: "validation_failed" })),
			}),
		);
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Check the form and try again.",
		);
		errored.unmount();

		const forged = render(
			await SubscribePage({
				searchParams: params({ error: "email: Invalid email address" }),
			}),
		);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		forged.unmount();

		const sent = render(
			await SubscribePage({
				searchParams: params({ status: "confirmation_sent" }),
			}),
		);
		expect(screen.getByText("Check your inbox")).toBeInTheDocument();
		sent.unmount();

		render(
			await SubscribePage({
				searchParams: params({ status: "already_subscribed" }),
			}),
		);
		expect(screen.getByText("You're already subscribed")).toBeInTheDocument();
	});

	it("shows the channel choice only for more than one channel and checks the field", async () => {
		const user = userEvent.setup();
		const { services } = await setupApp();
		await services.notificationSettings.updateChannel(SYSTEM_ACTOR, "sms", {
			from: "ACME",
		});
		await services.notificationSettings.addProvider(SYSTEM_ACTOR, "sms", {
			type: "sns",
			name: "SNS",
			values: { region: "us-east-1" },
		});
		const form = render(await SubscribePage({ searchParams: params({}) }));
		const picker = screen.getByRole("group", { name: "Channel" });
		expect(
			within(picker)
				.getAllByRole("radio")
				.map((radio) => (radio as HTMLInputElement).value),
		).toEqual(["email", "sms", "webhook"]);
		expect(screen.getByRole("radio", { name: "Email" })).toBeChecked();
		expect(screen.getByLabelText("Email address")).toHaveAttribute(
			"type",
			"email",
		);

		// The field follows the channel, and the browser checks the value.
		const valid = async (value: string) => {
			const field = screen.getByRole("textbox") as HTMLInputElement;
			await user.clear(field);
			await user.type(field, value);
			return field.checkValidity();
		};
		await user.click(screen.getByRole("radio", { name: "Text message" }));
		expect(screen.getByLabelText("Phone number")).toHaveAttribute(
			"type",
			"tel",
		);
		await expect(valid("555-1234")).resolves.toBe(false);
		await expect(valid("+1 (555) 123-4567")).resolves.toBe(true);
		await user.click(screen.getByRole("radio", { name: "Webhook" }));
		expect(screen.getByLabelText("Webhook URL")).toHaveAttribute("type", "url");
		expect(
			screen.getByText(/We post a confirmation link to it\./),
		).toBeInTheDocument();
		await expect(valid("ftp://hooks.example.com/a")).resolves.toBe(false);
		await expect(valid("https://hooks.example.com/a")).resolves.toBe(true);
		form.unmount();

		// The redirect after a submit opens the same channel. An unknown channel opens the first one.
		const again = render(
			await SubscribePage({ searchParams: params({ channel: "webhook" }) }),
		);
		expect(screen.getByRole("radio", { name: "Webhook" })).toBeChecked();
		again.unmount();
		const unknown = render(
			await SubscribePage({ searchParams: params({ channel: "fax" }) }),
		);
		expect(screen.getByRole("radio", { name: "Email" })).toBeChecked();
		unknown.unmount();
		const sent = render(
			await SubscribePage({
				searchParams: params({
					channel: "webhook",
					status: "confirmation_sent",
				}),
			}),
		);
		expect(screen.getByText("Check your webhook")).toBeInTheDocument();
		sent.unmount();
		const already = render(
			await SubscribePage({
				searchParams: params({
					channel: "webhook",
					status: "already_subscribed",
				}),
			}),
		);
		expect(
			screen.getByText("That webhook URL already receives updates."),
		).toBeInTheDocument();
		already.unmount();

		// The toggle does not show a channel that cannot send.
		await services.notificationSettings.updateChannel(SYSTEM_ACTOR, "sms", {
			enabled: false,
		});
		const two = render(
			await SubscribePage({ searchParams: params({ channel: "sms" }) }),
		);
		expect(
			within(screen.getByRole("group", { name: "Channel" }))
				.getAllByRole("radio")
				.map((radio) => (radio as HTMLInputElement).value),
		).toEqual(["email", "webhook"]);
		expect(screen.queryByText("Text message")).toBeNull();
		expect(screen.getByRole("radio", { name: "Email" })).toBeChecked();
		two.unmount();

		// With one channel there is no choice. The form sends that channel.
		await services.notificationSettings.updateChannel(SYSTEM_ACTOR, "email", {
			enabled: false,
		});
		render(await SubscribePage({ searchParams: params({ channel: "email" }) }));
		expect(screen.queryByRole("group", { name: "Channel" })).toBeNull();
		expect(screen.queryAllByRole("radio")).toHaveLength(0);
		expect(screen.getByLabelText("Webhook URL")).toHaveAttribute("type", "url");
		expect(
			new FormData(
				screen.getByRole("textbox").closest("form") ?? undefined,
			).get("type"),
		).toBe("webhook");
	});

	it("serves the cached status page while the database is offline", async () => {
		const { app } = await setupApp();
		render(await StatusPage()).unmount();
		vi.spyOn(app.store.inner, "find").mockRejectedValue(new Error("down"));
		vi.spyOn(app.store.inner, "get").mockRejectedValue(new Error("down"));
		app.store.invalidate();
		render(await StatusPage());
		expect(
			screen.getByRole("heading", { name: "We're fully operational" }),
		).toBeInTheDocument();
		expect(app.store.health.online).toBe(false);
	});

	it("explains when no channel can send", async () => {
		const { services } = await setupApp();
		for (const channel of ["email", "webhook"] as const) {
			await services.notificationSettings.updateChannel(SYSTEM_ACTOR, channel, {
				enabled: false,
			});
		}
		render(
			await SubscribePage({
				searchParams: params({ status: "confirmation_sent" }),
			}),
		);
		expect(
			screen.getByText("Subscriptions are not available"),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "RSS feed" })).toHaveAttribute(
			"href",
			"/feed.xml",
		);
	});

	it("confirms subscriptions", async () => {
		const { services, notifier } = await setupApp();
		await services.subscribers.subscribe({
			type: "email",
			target: "jane@example.com",
		});
		const token = notifier.confirmations[0]?.subscriber.token;
		const ok = render(await ConfirmPage({ searchParams: params({ token }) }));
		expect(screen.getByText("You're subscribed")).toBeInTheDocument();
		expect(
			screen.getByText(/jane@example.com will now receive/),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", {
				name: "Choose the services that send a notification.",
			}),
		).toHaveAttribute(
			"href",
			`/subscribe/services?token=${encodeURIComponent(token ?? "")}`,
		);
		ok.unmount();
		render(await ConfirmPage({ searchParams: params({}) }));
		expect(screen.getByText("This link is invalid")).toBeInTheDocument();
	});

	it("lets a subscriber choose services", async () => {
		const { services, notifier } = await setupApp();
		const hidden = render(await ServicesPage({ searchParams: params({}) }));
		expect(screen.getByText("This link is invalid")).toBeInTheDocument();
		hidden.unmount();

		await services.subscribers.subscribe({
			type: "email",
			target: "jane@example.com",
		});
		const token = notifier.confirmations[0]?.subscriber.token ?? "";
		const empty = render(
			await ServicesPage({ searchParams: params({ token }) }),
		);
		expect(
			screen.getByText(
				"There are no services to choose yet. You get every notice.",
			),
		).toBeInTheDocument();
		empty.unmount();

		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		await services.catalog.create(SYSTEM_ACTOR, {
			name: "Billing",
			hidden: true,
		});
		await services.subscribers.setServices(
			SYSTEM_ACTOR,
			(await services.subscribers.list(SYSTEM_ACTOR))[0]?.id ?? "",
			{ serviceIds: [api.id] },
		);
		const page = render(
			await ServicesPage({
				searchParams: params({
					token,
					...flashQueryParams({ notice: "services_saved" }),
				}),
			}),
		);
		expect(screen.getByRole("status")).toHaveTextContent("Services saved");
		expect(screen.getByRole("checkbox", { name: "API" })).toBeChecked();
		expect(screen.queryByRole("checkbox", { name: "Billing" })).toBeNull();
		page.unmount();

		render(
			await ServicesPage({
				searchParams: params({
					token,
					...flashQueryParams({ error: "validation_failed" }),
				}),
			}),
		);
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Check the form and try again.",
		);
	});

	it("shows service tags on the subscribe form", async () => {
		const { services } = await setupApp();
		await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		await services.catalog.create(SYSTEM_ACTOR, {
			name: "Billing",
			hidden: true,
		});
		render(await SubscribePage({ searchParams: params({}) }));
		expect(screen.getByRole("checkbox", { name: "API" })).not.toBeChecked();
		expect(screen.queryByRole("checkbox", { name: "Billing" })).toBeNull();
		expect(
			screen.getByText(
				"Select no service to get a notification for every service.",
			),
		).toBeInTheDocument();
	});

	it("renders the unsubscribe confirmation and result", async () => {
		await setupApp();
		const page = render(
			await UnsubscribePage({ searchParams: params({ token: "abc" }) }),
		);
		expect(
			screen.getByRole("button", { name: "Unsubscribe" }),
		).toBeInTheDocument();
		expect(document.querySelector('input[name="token"]')).toHaveValue("abc");
		expect(screen.queryByRole("group", { name: "Channel" })).toBeNull();
		page.unmount();
		render(await UnsubscribePage({ searchParams: params({ done: "1" }) }));
		expect(screen.getByText("You've been unsubscribed")).toBeInTheDocument();
	});

	it("asks for the address without a token", async () => {
		await setupApp();
		// Text messaging cannot send in the test environment, but a visitor can still leave it.
		const form = render(await UnsubscribePage({ searchParams: params({}) }));
		const picker = screen.getByRole("group", { name: "Channel" });
		for (const radio of within(picker).getAllByRole("radio")) {
			expect(radio).toBeEnabled();
		}
		expect(screen.getByRole("radio", { name: "Email" })).toBeChecked();
		expect(screen.getByLabelText("Email address")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Unsubscribe" }),
		).toBeInTheDocument();
		expect(document.querySelector('input[name="token"]')).toBeNull();
		form.unmount();

		// After an error, the page opens the same channel and shows the error.
		render(
			await UnsubscribePage({
				searchParams: params({
					channel: "sms",
					...flashQueryParams({ error: "validation_failed" }),
				}),
			}),
		);
		expect(screen.getByRole("radio", { name: "Text message" })).toBeChecked();
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Check the form and try again.",
		);
	});
});

describe("subscribe button", () => {
	it("shows the subscribe button on each public page with a header", async () => {
		const { services } = await setupApp();
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "API errors",
			message: "Investigating",
		});
		const pages = [
			await StatusPage(),
			await HistoryPage({ searchParams: params({}) }),
			await IncidentPage({ params: params({ id: incident.id }) }),
			await ConfirmPage({ searchParams: params({ token: "nope" }) }),
			await UnsubscribePage({ searchParams: params({ token: "abc" }) }),
		];
		for (const page of pages) {
			const { unmount } = render(page);
			expect(
				screen.getByRole("link", { name: "Subscribe to updates" }),
			).toHaveAttribute("href", "/subscribe");
			unmount();
		}
		// The subscribe page is the form, so its header has no button.
		render(await SubscribePage({ searchParams: params({}) }));
		expect(
			screen.queryByRole("link", { name: "Subscribe to updates" }),
		).not.toBeInTheDocument();
	});
});

describe("error pages", () => {
	it("renders not found and error boundaries", async () => {
		const { unmount } = render(<NotFound />);
		expect(screen.getByText("Page not found")).toBeInTheDocument();
		unmount();
		const reset = vi.fn();
		render(<ErrorPage error={new Error("x")} reset={reset} />);
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
		screen.getByRole("button", { name: "Try again" }).click();
		expect(reset).toHaveBeenCalled();
	});

	it("asks for a reload when the server does not know the action", () => {
		// A deploy changed the server action ids after the page loaded. `reset`
		// keeps the stale ids, so the page must reload instead.
		const location = window.location;
		const reload = vi.fn();
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { ...location, reload },
		});
		try {
			const reset = vi.fn();
			render(
				<ErrorPage error={new UnrecognizedActionError("gone")} reset={reset} />,
			);
			expect(screen.getByText("This page is out of date")).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Try again" }),
			).not.toBeInTheDocument();
			screen.getByRole("button", { name: "Reload" }).click();
			expect(reload).toHaveBeenCalledOnce();
			expect(reset).not.toHaveBeenCalled();
		} finally {
			Object.defineProperty(window, "location", {
				configurable: true,
				value: location,
			});
		}
	});
});
