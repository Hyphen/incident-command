import { BRAND_ASSET_MAX_BYTES, BRAND_ASSET_TYPES } from "./domain/brand-asset";
import { CUSTOM_CSS_MAX_LENGTH } from "./domain/schemas";
import { INCIDENT_KINDS, SERVICE_STATUSES } from "./domain/types";
import { THEMES } from "./theme";

export interface DesignToken {
	name: string;
	use: string;
}

/** The design tokens that each theme preset sets and that custom CSS can change. */
export const DESIGN_TOKENS: readonly DesignToken[] = [
	{ name: "--ic-bg", use: "Page background" },
	{ name: "--ic-surface", use: "Cards" },
	{ name: "--ic-surface-muted", use: "Group headers and subtle fills" },
	{ name: "--ic-fg", use: "Primary text" },
	{ name: "--ic-muted", use: "Secondary text" },
	{ name: "--ic-border", use: "Borders and dividers" },
	{ name: "--ic-brand", use: "Buttons, links and focus rings" },
	{ name: "--ic-brand-fg", use: "Text on a brand background" },
	{ name: "--ic-operational", use: "Operational status" },
	{ name: "--ic-degraded", use: "Degraded performance" },
	{ name: "--ic-partial", use: "Partial outage" },
	{ name: "--ic-major", use: "Major outage" },
	{ name: "--ic-maintenance", use: "Maintenance" },
	{ name: "--ic-nodata", use: "Uptime bars that have no data" },
	{ name: "--ic-radius", use: "Corner radius of cards" },
	{ name: "--ic-font", use: "Font stack" },
];

const STATUS_VALUES = SERVICE_STATUSES.join(", ");

/** The `data-status` value of an uptime day that has no data. */
export const NO_DATA_STATUS = "no_data";

export interface DesignSelector {
	selector: string;
	element: string;
	/** The data attributes of the element, each with its possible values. */
	attributes?: Record<string, string>;
}

/**
 * The stable class names of the public pages. Custom CSS can use them.
 * The utility classes of an element can change between releases. These names do not.
 */
export const DESIGN_SELECTORS: readonly DesignSelector[] = [
	{
		selector: ".ic-page",
		element: "The root of each public page. The portal does not have it.",
	},
	{ selector: ".ic-header", element: "The header of the page." },
	{ selector: ".ic-logo", element: "The uploaded logo in the header." },
	{
		selector: ".ic-site-name",
		element: "The site name in the header. It shows when no logo is stored.",
	},
	{ selector: ".ic-nav", element: "The links in the header." },
	{ selector: ".ic-subscribe", element: "The subscribe button." },
	{ selector: ".ic-main", element: "The content column." },
	{ selector: ".ic-footer", element: "The footer of the page." },
	{
		selector: ".ic-banner",
		element: "The banner that shows the overall status.",
		attributes: { "data-status": STATUS_VALUES },
	},
	{
		selector: ".ic-description",
		element: "The description below the banner.",
	},
	{
		selector: ".ic-incident",
		element: "The card of an open incident or of maintenance.",
		attributes: {
			"data-kind": INCIDENT_KINDS.join(", "),
			"data-status": STATUS_VALUES,
		},
	},
	{ selector: ".ic-services", element: "The system status card." },
	{ selector: ".ic-group", element: "The heading of a service group." },
	{
		selector: ".ic-service",
		element: "The row of one service.",
		attributes: { "data-status": STATUS_VALUES },
	},
	{ selector: ".ic-uptime", element: "The uptime history of one service." },
	{
		selector: ".ic-uptime-day",
		element: "One day in the uptime history.",
		attributes: { "data-status": `${STATUS_VALUES}, ${NO_DATA_STATUS}` },
	},
	{ selector: ".ic-uptime-bar", element: "The colored bar of one day." },
	{
		selector: ".ic-incident-list",
		element: "The list of the incidents of one day.",
	},
	{ selector: ".ic-incident-item", element: "One incident in that list." },
	{ selector: ".ic-badge", element: "A status label with a colored dot." },
	{ selector: ".ic-timeline", element: "The updates of one incident." },
	{ selector: ".ic-update", element: "One update in the timeline." },
	{
		selector: ".ic-notice",
		element: "The card on the subscription pages.",
	},
];

const EXAMPLE_CSS = `/* An @import rule must come first. */
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap");

/* Change tokens on all pages. */
:root,
[data-theme] {
	--ic-radius: 1rem;
	--ic-font: "Inter", ui-sans-serif, system-ui, sans-serif;
}

/* Change tokens on the public pages only. */
:root:has(.ic-page) {
	--ic-bg: #0b1020;
	--ic-surface: #121a33;
	--ic-fg: #e8ecff;
}

/* Change one element. */
.ic-banner[data-status="operational"] {
	background: linear-gradient(135deg, var(--ic-surface), var(--ic-surface-muted));
}
.ic-uptime-bar {
	border-radius: 9999px;
}`;

/** The reference that an agent reads before it changes the design of the status page. */
export function designGuide() {
	return {
		steps: [
			"Call update_settings with theme to select a preset.",
			"Call update_settings with brandColor to set the color of buttons and links.",
			"Call upload_brand_asset to set the logo and the favicon.",
			"Call update_settings with customCss for all other changes.",
		],
		themes: THEMES,
		tokens: DESIGN_TOKENS,
		selectors: DESIGN_SELECTORS,
		rules: [
			"The page loads the custom CSS after the theme. Thus the custom CSS can change each token and each style.",
			"The custom CSS loads on each page. The portal is included, and it shows some of these elements. Start a selector with .ic-page to change only the public pages.",
			"Use the selectors in this guide. The other class names can change between releases.",
			"A value of customCss replaces the stored CSS. Call get_settings first, then send the full stylesheet.",
			"The brandColor setting is stronger than --ic-brand in the custom CSS. Set brandColor to null to control --ic-brand in the CSS.",
			"The default preset has a dark mode. Each other preset has one color scheme. Use @media (prefers-color-scheme: dark) for dark mode values.",
			"Keep sufficient contrast between text and background. Keep a different color for each status.",
			'Do not hide the line "Powered by Incident Command" with the custom CSS. To remove it from the public pages, call update_settings with showPoweredBy set to false.',
		],
		limits: {
			customCssMaxLength: CUSTOM_CSS_MAX_LENGTH,
			assetMaxBytes: BRAND_ASSET_MAX_BYTES,
			logoTypes: BRAND_ASSET_TYPES.logo,
			faviconTypes: BRAND_ASSET_TYPES.favicon,
		},
		example: EXAMPLE_CSS,
	};
}
