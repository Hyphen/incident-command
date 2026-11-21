import { regionNameFor, STATUS_OVERVIEW_LABEL } from "./domain/regions";
import {
	affectedNames,
	EVENT_STATUS_LABELS,
	IMPACT_LABELS,
	OVERALL_STATUS_COPY,
	SERVICE_STATUS_LABELS,
} from "./domain/status";
import type { Incident, Region, Service, Settings } from "./domain/types";
import { formatUptime } from "./domain/uptime";
import { FEED_PATH } from "./feed";
import { formatDateTime, formatDuration, formatMonth } from "./format";
import {
	type HistoryPage,
	RECENT_DAYS,
	type StatusSummary,
} from "./services/status";

/*
 * Markdown versions of the public pages, for agents and other automated
 * readers. The status page is the llms.txt file of the site
 * (https://llmstxt.org). Each other page is at its URL with ".md" added.
 */

/** The path of the status page in Markdown. */
export const LLMS_PATH = "/llms.txt";
/** The path of the incident history in Markdown. */
export const HISTORY_MARKDOWN_PATH = "/history.md";

/**
 * The path of an incident page in Markdown. `next.config.ts` rewrites it to
 * the route handler in `src/app/incidents/[id]/markdown`.
 */
export function incidentMarkdownPath(id: string): string {
	return `/incidents/${id}.md`;
}

/**
 * Text for one line of Markdown. The function puts the text on one line and
 * escapes the characters that change the structure of the document.
 */
function text(value: string): string {
	return value
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[\\`*_[\]<>|]/g, "\\$&");
}

/** The message as a block quote. Markdown in the message stays in the quote. */
function quote(message: string): string {
	return message
		.trim()
		.split(/\r?\n/)
		.map((line) => `> ${line}`.trimEnd())
		.join("\n");
}

function link(label: string, url: string): string {
	return `[${text(label)}](${url})`;
}

/** A block or a line. The functions below do not use a block that has no text. */
type Block = string | false | null | undefined;

/** Joins the blocks with an empty line between them. */
function blocks(items: readonly Block[]): string {
	return items.filter(Boolean).join("\n\n");
}

/** A full document. It ends with a line break. */
function doc(items: readonly Block[]): string {
	return `${blocks(items)}\n`;
}

function pages(lines: readonly Block[]): string {
	return blocks(["## Pages", lines.filter(Boolean).join("\n")]);
}

/** The maintenance window, else the start of the incident. */
function when(incident: Incident): string {
	return incident.kind === "maintenance" &&
		incident.scheduledStart &&
		incident.scheduledEnd
		? `Window: ${formatDateTime(incident.scheduledStart)} to ${formatDateTime(incident.scheduledEnd)}`
		: `Started: ${formatDateTime(incident.startedAt)}`;
}

/** The facts of an incident page as a list. */
function details(
	incident: Incident,
	services: readonly Service[],
	regions: readonly Region[] = [],
): string {
	const lines = [
		`- Type: ${incident.kind === "maintenance" ? "Scheduled maintenance" : "Incident"}`,
		`- Status: ${EVENT_STATUS_LABELS[incident.status]}`,
	];
	if (incident.kind === "incident") {
		lines.push(`- Impact: ${IMPACT_LABELS[incident.impact]}`);
	}
	lines.push(`- ${when(incident)}`);
	if (incident.resolvedAt) {
		const label = incident.kind === "maintenance" ? "Completed" : "Resolved";
		const duration =
			new Date(incident.resolvedAt).getTime() -
			new Date(incident.startedAt).getTime();
		lines.push(
			`- ${label}: ${formatDateTime(incident.resolvedAt)}`,
			`- Duration: ${formatDuration(duration)}`,
		);
	}
	const names = affectedNames(incident, services);
	if (names.length > 0) {
		lines.push(`- Affected services: ${text(names.join(", "))}`);
	}
	const regionName = regionNameFor(incident, regions);
	if (regionName) {
		lines.push(`- Region: ${text(regionName)}`);
	}
	return lines.join("\n");
}

/** An open incident or maintenance on the status page, with its latest update. */
function eventBlock(
	incident: Incident,
	services: readonly Service[],
	origin: string,
	regions: readonly Region[],
): string {
	const latest = incident.updates.at(-1);
	return blocks([
		`### ${link(incident.title, `${origin}${incidentMarkdownPath(incident.id)}`)}`,
		details(incident, services, regions),
		latest &&
			`Latest update (${EVENT_STATUS_LABELS[latest.status]}, ${formatDateTime(latest.createdAt)}):\n\n${quote(latest.message)}`,
	]);
}

function eventSection(
	heading: string,
	incidents: readonly Incident[],
	empty: string,
	services: readonly Service[],
	origin: string,
	regions: readonly Region[],
): string {
	return blocks([
		`## ${heading}`,
		...(incidents.length === 0
			? [empty]
			: incidents.map((incident) =>
					eventBlock(incident, services, origin, regions),
				)),
	]);
}

/** One line for each incident, as the incident lists on the status and history pages show. */
function incidentList(
	incidents: readonly Incident[],
	empty: string,
	origin: string,
	regions: readonly Region[] = [],
): string {
	if (incidents.length === 0) {
		return empty;
	}
	return incidents
		.map((incident) => {
			const facts =
				incident.kind === "maintenance"
					? ["Scheduled maintenance"]
					: ["Incident", `Impact: ${IMPACT_LABELS[incident.impact]}`];
			facts.push(
				`Status: ${EVENT_STATUS_LABELS[incident.status]}`,
				when(incident),
			);
			const regionName = regionNameFor(incident, regions);
			if (regionName) {
				facts.push(`Region: ${regionName}`);
			}
			return `- ${link(incident.title, `${origin}${incidentMarkdownPath(incident.id)}`)}: ${facts.join(". ")}.`;
		})
		.join("\n");
}

function servicesSection(summary: StatusSummary): string {
	if (summary.services.length === 0) {
		return "## Services\n\nNo services have been added yet.";
	}
	const rows = summary.services.map(
		(service) =>
			`| ${text(service.name)} | ${text(service.group ?? "")} | ${SERVICE_STATUS_LABELS[service.status]} | ${formatUptime(service.uptime)} | ${text(service.description ?? "")} |`,
	);
	return blocks([
		"## Services",
		`The uptime is for the last ${summary.window.days} days.`,
		[
			"| Service | Group | Status | Uptime | Description |",
			"| --- | --- | --- | --- | --- |",
			...rows,
		].join("\n"),
	]);
}

/** A query that keeps the reader on one region. Empty on the Overview tab. */
function regionQuery(region?: Region): string {
	return region ? `?region=${region.id}` : "";
}

/** The status page in Markdown: the llms.txt file of the site. */
export function statusMarkdown(summary: StatusSummary, origin: string): string {
	const { settings, services } = summary;
	const name = text(settings.siteName);
	return doc([
		`# ${name}`,
		`> Overall status: ${SERVICE_STATUS_LABELS[summary.overall]}. ${OVERALL_STATUS_COPY[summary.overall].description}`,
		text(settings.description),
		summary.regions.length > 0 &&
			`Region: ${text(summary.region?.name ?? STATUS_OVERVIEW_LABEL)}.`,
		`This file is the public status page of ${name} in Markdown, for agents and other automated readers. It shows the status at ${formatDateTime(summary.generatedAt)}.`,
		eventSection(
			"Active incidents",
			summary.activeIncidents,
			"No active incidents.",
			services,
			origin,
			summary.regions,
		),
		eventSection(
			"Maintenance in progress",
			summary.activeMaintenance,
			"No maintenance in progress.",
			services,
			origin,
			summary.regions,
		),
		eventSection(
			"Upcoming maintenance",
			summary.upcomingMaintenance,
			"No upcoming maintenance.",
			services,
			origin,
			summary.regions,
		),
		servicesSection(summary),
		blocks([
			"## Recent incidents",
			`The incidents and maintenance of the last ${RECENT_DAYS} days, newest first.`,
			incidentList(
				summary.recentIncidents,
				`No incidents reported in the last ${RECENT_DAYS} days.`,
				origin,
				summary.regions,
			),
		]),
		pages([
			`- ${link("Status page", `${origin}/${regionQuery(summary.region)}`)}: this page in HTML.`,
			`- ${link("Incident history", `${origin}${HISTORY_MARKDOWN_PATH}${regionQuery(summary.region)}`)}: the incidents and maintenance of each month, in Markdown.`,
			`- ${link("Status API", `${origin}/api/v1/status${regionQuery(summary.region)}`)}: the current status in JSON.`,
			`- ${link("RSS feed", `${origin}${FEED_PATH}`)}: one item for each incident and maintenance update.`,
			settings.supportUrl &&
				`- ${link("Support", settings.supportUrl)}: the support site of ${name}.`,
		]),
	]);
}

/** The incident history page in Markdown. */
export function historyMarkdown(
	settings: Settings,
	history: HistoryPage,
	origin: string,
	region?: Region,
	regions: readonly Region[] = [],
): string {
	const name = text(settings.siteName);
	const page = (month: string) => {
		const params = new URLSearchParams({ month });
		if (region) {
			params.set("region", region.id);
		}
		return `${origin}${HISTORY_MARKDOWN_PATH}?${params}`;
	};
	return doc([
		`# ${name} incident history`,
		region
			? `> Incidents for ${text(region.name)}, newest month first.`
			: `> The incidents and maintenance of ${name} for each month, newest first.`,
		...history.months.map(
			(month) =>
				`## ${formatMonth(month.key)}\n\n${incidentList(month.incidents, "No incidents reported.", origin, regions)}`,
		),
		pages([
			history.older && `- ${link("Older months", page(history.older))}`,
			history.newer && `- ${link("Newer months", page(history.newer))}`,
			`- ${link("Current status", `${origin}${LLMS_PATH}${regionQuery(region)}`)}`,
		]),
	]);
}

/** One post in Markdown. An incident post includes the impact. */
function updateMarkdown(
	incident: Incident,
	update: Incident["updates"][number],
): string {
	const lines = [
		`### ${EVENT_STATUS_LABELS[update.status]}, ${formatDateTime(update.createdAt)}`,
		"",
		`- Title: ${text(update.title)}`,
	];
	if (incident.kind === "incident") {
		lines.push(`- Impact: ${IMPACT_LABELS[update.impact]}`);
	}
	lines.push("", quote(update.message));
	return lines.join("\n");
}

/** The page of one incident or maintenance in Markdown, with all its updates. */
export function incidentMarkdown(
	settings: Settings,
	incident: Incident,
	services: readonly Service[],
	origin: string,
	regions: readonly Region[] = [],
): string {
	const updates = [...incident.updates].reverse();
	return doc([
		`# ${text(incident.title)}`,
		`> ${incident.kind === "maintenance" ? "Scheduled maintenance" : "An incident"} on the status page of ${text(settings.siteName)}.`,
		details(incident, services, regions),
		"## Updates\n\nNewest first.",
		...updates.map((update) => updateMarkdown(incident, update)),
		pages([
			`- ${link("Incident page", `${origin}/incidents/${incident.id}`)}: this page in HTML.`,
			`- ${link("Current status", `${origin}${LLMS_PATH}`)}`,
			`- ${link("Incident history", `${origin}${HISTORY_MARKDOWN_PATH}`)}`,
		]),
	]);
}

/** The Markdown page for an incident id that does not exist. */
export function incidentNotFoundMarkdown(origin: string): string {
	return doc([
		"# Incident not found",
		`No incident has this id. See the ${link("current status", `${origin}${LLMS_PATH}`)}.`,
	]);
}

/** A response with a Markdown document. */
export function markdownResponse(
	body: string,
	type: "text/plain" | "text/markdown",
	status = 200,
): Response {
	return new Response(body, {
		status,
		headers: {
			"content-type": `${type}; charset=utf-8`,
			// The browser shows the document as text. It does not examine it as HTML.
			"x-content-type-options": "nosniff",
		},
	});
}
