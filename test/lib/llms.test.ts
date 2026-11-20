import { GET as historyMarkdown } from "@/app/history.md/route";
import { GET as incidentMarkdown } from "@/app/incidents/[id]/markdown/route";
import { GET as llms } from "@/app/llms.txt/route";
import { createApp, setApp } from "@/lib/app";
import { loadConfig } from "@/lib/config";
import { SYSTEM_ACTOR } from "@/lib/services/context";
import { Clock, FakeNotifier } from "../helpers";

async function setup() {
	const clock = new Clock();
	const app = await createApp({
		config: loadConfig({}),
		notifier: new FakeNotifier(),
		now: clock.now,
	});
	setApp(app);
	return { clock, services: app.services };
}

afterEach(() => setApp(undefined));

function incidentRequest(
	id: string,
	url = `http://internal/incidents/${id}.md`,
) {
	return incidentMarkdown(new Request(url), {
		params: Promise.resolve({ id }),
	});
}

describe("llms.txt", () => {
	it("shows an empty status page", async () => {
		await setup();
		const response = await llms(new Request("http://localhost:3000/llms.txt"));
		expect(response.headers.get("content-type")).toBe(
			"text/plain; charset=utf-8",
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(await response.text()).toBe(`# Status

> Overall status: Operational. We're not aware of any issues affecting our systems.

This file is the public status page of Status in Markdown, for agents and other automated readers. It shows the status at Nov 2, 2026, 12:00 UTC.

## Active incidents

No active incidents.

## Maintenance in progress

No maintenance in progress.

## Upcoming maintenance

No upcoming maintenance.

## Services

No services have been added yet.

## Recent incidents

The incidents and maintenance of the last 14 days, newest first.

No incidents reported in the last 14 days.

## Pages

- [Status page](http://localhost:3000/): this page in HTML.
- [Incident history](http://localhost:3000/history.md): the incidents and maintenance of each month, in Markdown.
- [Status API](http://localhost:3000/api/v1/status): the current status in JSON.
- [RSS feed](http://localhost:3000/feed.xml): one item for each incident and maintenance update.
`);
	});

	it("shows services, incidents and maintenance", async () => {
		const { services, clock } = await setup();
		await services.settings.update(SYSTEM_ACTOR, {
			siteName: "Acme",
			description: "Live status | Acme",
			supportUrl: "https://acme.dev/help",
		});
		clock.set("2026-10-01T00:00:00.000Z");
		const api = await services.catalog.create(SYSTEM_ACTOR, {
			name: "API",
			group: "Core",
			description: "Public | API",
		});
		await services.catalog.create(SYSTEM_ACTOR, { name: "Website" });
		const hidden = await services.catalog.create(SYSTEM_ACTOR, {
			name: "Secret",
			hidden: true,
		});
		clock.set("2026-10-30T08:00:00.000Z");
		const blip = await services.incidents.create(SYSTEM_ACTOR, {
			title: "Old blip",
			message: "Gone",
			status: "resolved",
		});
		clock.set("2026-11-02T12:00:00.000Z");
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "API errors [EU]",
			message: "Line one\n# Not a heading",
			impact: "major",
			serviceIds: [api.id, hidden.id],
		});
		await services.incidents.create(SYSTEM_ACTOR, {
			kind: "maintenance",
			title: "Edge migration",
			message: "Migrating",
			status: "in_progress",
			scheduledStart: "2026-11-02T11:00:00.000Z",
			scheduledEnd: "2026-11-02T13:00:00.000Z",
		});
		const upgrade = await services.incidents.create(SYSTEM_ACTOR, {
			kind: "maintenance",
			title: "DB upgrade",
			message: "Upgrading",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T02:00:00.000Z",
		});

		const text = await (
			await llms(
				new Request("http://internal/llms.txt", {
					headers: { host: "status.acme.dev" },
				}),
			)
		).text();
		expect(text).toMatch(
			/^# Acme\n\n> Overall status: Partial outage\. Some systems are not working as expected\.\n\nLive status \\\| Acme\n\n/,
		);
		expect(text).toContain(`## Active incidents

### [API errors \\[EU\\]](https://status.acme.dev/incidents/${incident.id}.md)

- Type: Incident
- Status: Investigating
- Impact: Major
- Started: Nov 2, 2026, 12:00 UTC
- Affected services: API

Latest update (Investigating, Nov 2, 2026, 12:00 UTC):

> Line one
> # Not a heading

## Maintenance in progress

### [Edge migration]`);
		expect(text).toContain(`## Upcoming maintenance

### [DB upgrade](https://status.acme.dev/incidents/${upgrade.id}.md)

- Type: Scheduled maintenance
- Status: Scheduled
- Window: Nov 5, 2026, 00:00 UTC to Nov 5, 2026, 02:00 UTC
`);
		expect(text).toContain(`| Service | Group | Status | Uptime | Description |
| --- | --- | --- | --- | --- |
| API | Core | Partial outage | 100% | Public \\| API |
| Website |  | Operational | 100% |  |`);
		expect(text).toContain(
			`- [Old blip](https://status.acme.dev/incidents/${blip.id}.md): Incident. Impact: Minor. Status: Resolved. Started: Oct 30, 2026, 08:00 UTC.`,
		);
		expect(text).toContain(
			"- [Support](https://acme.dev/help): the support site of Acme.",
		);
		expect(text).not.toContain("Secret");
	});
});

describe("history.md", () => {
	it("lists months with links to older and newer months", async () => {
		const { services, clock } = await setup();
		await services.settings.update(SYSTEM_ACTOR, {
			siteUrl: "https://status.acme.dev",
		});
		clock.set("2026-05-05T00:00:00.000Z");
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "May blip",
			message: "x",
			status: "resolved",
		});
		clock.set("2026-10-10T00:00:00.000Z");
		const blip = await services.incidents.create(SYSTEM_ACTOR, {
			title: "October blip",
			message: "x",
			status: "resolved",
		});
		clock.set("2026-11-02T12:00:00.000Z");
		const upgrade = await services.incidents.create(SYSTEM_ACTOR, {
			kind: "maintenance",
			title: "DB upgrade",
			message: "Done",
			status: "completed",
			scheduledStart: "2026-11-01T00:00:00.000Z",
			scheduledEnd: "2026-11-01T02:00:00.000Z",
		});

		const response = await historyMarkdown(
			new Request("http://internal/history.md"),
		);
		expect(response.headers.get("content-type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(await response.text()).toBe(`# Status incident history

> The incidents and maintenance of Status for each month, newest first.

## November 2026

- [DB upgrade](https://status.acme.dev/incidents/${upgrade.id}.md): Scheduled maintenance. Status: Completed. Window: Nov 1, 2026, 00:00 UTC to Nov 1, 2026, 02:00 UTC.

## October 2026

- [October blip](https://status.acme.dev/incidents/${blip.id}.md): Incident. Impact: Minor. Status: Resolved. Started: Oct 10, 2026, 00:00 UTC.

## September 2026

No incidents reported.

## Pages

- [Older months](https://status.acme.dev/history.md?month=2026-08)
- [Current status](https://status.acme.dev/llms.txt)
`);

		const older = await (
			await historyMarkdown(
				new Request("http://internal/history.md?month=2026-05"),
			)
		).text();
		expect(older).toContain("## May 2026");
		expect(older).toContain(
			"- [Newer months](https://status.acme.dev/history.md?month=2026-08)",
		);
		// May has the earliest incident, so the page has no older page.
		expect(older).not.toContain("Older months");
	});
});

describe("incident Markdown pages", () => {
	it("shows an incident with each update, newest first", async () => {
		const { services, clock } = await setup();
		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		const hidden = await services.catalog.create(SYSTEM_ACTOR, {
			name: "Secret",
			hidden: true,
		});
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "API errors",
			message: "Investigating\n\nMore soon",
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

		const response = await incidentRequest(
			incident.id,
			`http://localhost:3000/incidents/${incident.id}.md`,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(await response.text()).toBe(`# API restored

> An incident on the status page of Status.

- Type: Incident
- Status: Resolved
- Impact: Minor
- Started: Nov 2, 2026, 12:00 UTC
- Resolved: Nov 2, 2026, 13:35 UTC
- Duration: 1h 35m
- Affected services: API

## Updates

Newest first.

### Resolved, Nov 2, 2026, 13:35 UTC

- Title: API restored
- Impact: Minor

> All good

### Investigating, Nov 2, 2026, 12:00 UTC

- Title: API errors
- Impact: Critical

> Investigating
>
> More soon

## Pages

- [Incident page](http://localhost:3000/incidents/${incident.id}): this page in HTML.
- [Current status](http://localhost:3000/llms.txt)
- [Incident history](http://localhost:3000/history.md)
`);
	});

	it("shows the window of maintenance", async () => {
		const { services } = await setup();
		const maintenance = await services.incidents.create(SYSTEM_ACTOR, {
			kind: "maintenance",
			title: "DB upgrade",
			message: "Upgrading",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T02:00:00.000Z",
		});
		await services.incidents.resolve(SYSTEM_ACTOR, maintenance.id);
		const text = await (await incidentRequest(maintenance.id)).text();
		expect(
			text,
		).toContain(`> Scheduled maintenance on the status page of Status.

- Type: Scheduled maintenance
- Status: Completed
- Window: Nov 5, 2026, 00:00 UTC to Nov 5, 2026, 02:00 UTC
- Completed: Nov 2, 2026, 12:00 UTC
`);
		expect(text).not.toContain("Impact");
	});

	it("returns 404 for an unknown incident", async () => {
		await setup();
		const response = await incidentRequest("nope");
		expect(response.status).toBe(404);
		expect(await response.text()).toBe(`# Incident not found

No incident has this id. See the [current status](http://internal/llms.txt).
`);
	});
});

describe("region markdown", () => {
	it("names the region and rejects an unknown region", async () => {
		const { services, clock } = await setup();
		await services.settings.update(SYSTEM_ACTOR, {
			siteUrl: "https://status.acme.dev",
		});
		const region = await services.regions.create(SYSTEM_ACTOR, {
			name: "United States",
		});
		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		clock.set("2026-05-05T00:00:00.000Z");
		const incident = await services.incidents.create(SYSTEM_ACTOR, {
			title: "US down",
			message: "Looking",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [region.id] }],
			status: "resolved",
		});
		clock.set("2026-11-02T12:00:00.000Z");
		await services.incidents.create(SYSTEM_ACTOR, {
			title: "US open",
			message: "Still down",
			serviceIds: [api.id],
			serviceRegions: [{ serviceId: api.id, regionIds: [region.id] }],
		});
		const status = await llms(
			new Request(`https://status.acme.dev/llms.txt?region=${region.id}`),
		);
		const statusText = await status.text();
		expect(statusText).toContain("Region: United States.");
		expect(statusText).toContain("- Region: United States");
		expect(statusText).toContain(
			`(https://status.acme.dev/?region=${region.id})`,
		);
		expect(statusText).toContain(
			`(https://status.acme.dev/history.md?region=${region.id})`,
		);
		expect(statusText).toContain(
			`(https://status.acme.dev/api/v1/status?region=${region.id})`,
		);
		const global = await llms(new Request("https://status.acme.dev/llms.txt"));
		expect(await global.text()).toContain("Region: Global.");
		const missing = await llms(
			new Request("https://status.acme.dev/llms.txt?region=reg_missing"),
		);
		expect(missing.status).toBe(404);
		const history = await historyMarkdown(
			new Request(`https://status.acme.dev/history.md?region=${region.id}`),
		);
		const historyText = await history.text();
		expect(historyText).toContain(
			"Incidents for United States, newest month first.",
		);
		expect(historyText).toContain("Region: United States");
		expect(historyText).toContain(`region=${region.id}`);
		expect(historyText).toContain(
			`(https://status.acme.dev/llms.txt?region=${region.id})`,
		);
		const historyMissing = await historyMarkdown(
			new Request("https://status.acme.dev/history.md?region=reg_missing"),
		);
		expect(historyMissing.status).toBe(404);
		const page = await incidentRequest(incident.id);
		expect(await page.text()).toContain("- Region: United States");
	});
});
