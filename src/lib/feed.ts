import { affectedNames, EVENT_STATUS_LABELS } from "./domain/status";
import type {
	Incident,
	IncidentUpdate,
	Service,
	Settings,
} from "./domain/types";
import { formatDateTime } from "./format";

/** The path of the RSS feed. */
export const FEED_PATH = "/feed.xml";

/** The feed holds this number of updates, newest first. */
export const FEED_ITEM_LIMIT = 50;

export function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

interface FeedItem {
	incident: Incident;
	update: IncidentUpdate;
}

/**
 * The updates of the incidents, newest first. The list can contain an
 * incident more than one time. The feed shows its updates one time.
 */
function feedItems(incidents: readonly Incident[]): FeedItem[] {
	const unique = new Map(incidents.map((incident) => [incident.id, incident]));
	return [...unique.values()]
		.flatMap((incident) =>
			incident.updates.map((update) => ({ incident, update })),
		)
		.sort((a, b) => b.update.createdAt.localeCompare(a.update.createdAt))
		.slice(0, FEED_ITEM_LIMIT);
}

/** The body of an item as HTML. The caller escapes it again for XML. */
function itemHtml(
	{ incident, update }: FeedItem,
	services: readonly Service[],
): string {
	const paragraphs = [escapeXml(update.message).replace(/\r?\n/g, "<br>")];
	if (
		incident.kind === "maintenance" &&
		incident.scheduledStart &&
		incident.scheduledEnd
	) {
		paragraphs.push(
			`Window: ${formatDateTime(incident.scheduledStart)} to ${formatDateTime(incident.scheduledEnd)}`,
		);
	}
	const names = affectedNames(incident, services);
	if (names.length > 0) {
		paragraphs.push(`Affected services: ${escapeXml(names.join(", "))}`);
	}
	return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

/**
 * RSS 2.0 feed with one item for each incident and maintenance update, so a
 * feed reader shows each change. `services` are the visible services: the
 * feed does not show the name of a hidden service.
 */
export function buildRssFeed(
	settings: Settings,
	incidents: readonly Incident[],
	services: readonly Service[],
	origin: string,
): string {
	const base = origin.replace(/\/+$/, "");
	const items = feedItems(incidents);
	const latest = items[0]?.update.createdAt;
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
		"<channel>",
		`<title>${escapeXml(settings.siteName)} status</title>`,
		`<link>${escapeXml(`${base}/`)}</link>`,
		`<atom:link href="${escapeXml(`${base}${FEED_PATH}`)}" rel="self" type="application/rss+xml"/>`,
		`<description>${escapeXml(`Incident and maintenance updates for ${settings.siteName}`)}</description>`,
		"<language>en</language>",
		latest
			? `<lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>`
			: "",
		...items.map((item) =>
			[
				"<item>",
				`<title>${escapeXml(`${EVENT_STATUS_LABELS[item.update.status]}: ${item.incident.title}`)}</title>`,
				`<link>${escapeXml(`${base}/incidents/${item.incident.id}`)}</link>`,
				`<guid isPermaLink="false">${escapeXml(item.update.id)}</guid>`,
				`<pubDate>${new Date(item.update.createdAt).toUTCString()}</pubDate>`,
				`<category>${item.incident.kind === "maintenance" ? "Maintenance" : "Incident"}</category>`,
				`<description>${escapeXml(itemHtml(item, services))}</description>`,
				"</item>",
			].join(""),
		),
		"</channel>",
		"</rss>",
	].join("");
}
