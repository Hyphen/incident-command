---
title: Custom CSS
navTitle: Custom CSS
description: Change the design tokens of each page and the style of single elements on the status page with custom CSS and stable ic- class names.
order: 2
---

The page loads the custom CSS after the theme. Thus the custom CSS can change each token and each style. The maximum length of the custom CSS is 50,000 characters.

To add the custom CSS in the portal:

1. Open **Settings**.
2. Select the **Branding** tab.
3. Enter the stylesheet in **Custom CSS**.
4. Select **Save branding**.

An agent sets the custom CSS with `customCss` in the `update_settings` MCP tool. See [Design the status page through MCP](/docs/agents/workflows/#design-the-status-page-through-mcp).

The app puts the stylesheet in a `<style>` element on each page. It escapes each `<` character. Thus the stylesheet cannot close its `<style>` element and add markup.

## Tokens

Set a token to change a color, the corner radius or the font on all pages. Each theme preset sets these 16 tokens.

```css
/* Load a web font (@import must come first) */
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap");

/* Rounder cards, the custom font and a softer background */
:root,
[data-theme] {
	--ic-radius: 1.5rem;
	--ic-font: "Inter", ui-sans-serif, system-ui, sans-serif;
	--ic-bg: #fafaf9;
}
```

| Token                | What it sets                   |
| -------------------- | ------------------------------ |
| `--ic-bg`            | Page background                |
| `--ic-surface`       | Cards                          |
| `--ic-surface-muted` | Group headers and subtle fills |
| `--ic-fg`            | Primary text                   |
| `--ic-muted`         | Secondary text                 |
| `--ic-border`        | Borders and dividers           |
| `--ic-brand`         | Buttons, links and focus rings |
| `--ic-brand-fg`      | Text on a brand background     |
| `--ic-operational`   | Operational status             |
| `--ic-degraded`      | Degraded performance           |
| `--ic-partial`       | Partial outage                 |
| `--ic-major`         | Major outage                   |
| `--ic-maintenance`   | Maintenance                    |
| `--ic-nodata`        | Uptime bars that have no data  |
| `--ic-radius`        | Corner radius of cards         |
| `--ic-font`          | Font stack                     |

## Selectors

Each element of the public pages has a class name that starts with `ic-`. Use these class names to change one element. They stay the same between releases. The other class names of an element are Tailwind CSS utilities, and they can change.

| Selector            | Element                                                    | Data attributes            |
| ------------------- | ---------------------------------------------------------- | -------------------------- |
| `.ic-page`          | The root of each public page. The portal does not have it. |                            |
| `.ic-header`        | The header of the page.                                    |                            |
| `.ic-logo`          | The uploaded logo in the header.                           |                            |
| `.ic-site-name`     | The site name in the header. It shows when no logo exists. |                            |
| `.ic-nav`           | The links in the header.                                   |                            |
| `.ic-subscribe`     | The subscribe button.                                      |                            |
| `.ic-main`          | The content column.                                        |                            |
| `.ic-footer`        | The footer of the page.                                    |                            |
| `.ic-regions`       | The region tabs. The page shows them when a region exists. |                            |
| `.ic-banner`        | The banner that shows the overall status.                  | `data-status`              |
| `.ic-description`   | The description below the banner.                          |                            |
| `.ic-incident`      | The card of an open incident or of maintenance.            | `data-kind`, `data-status` |
| `.ic-services`      | The system status card.                                    |                            |
| `.ic-group`         | The heading of a service group.                            |                            |
| `.ic-service`       | The row of one service.                                    | `data-status`              |
| `.ic-uptime`        | The uptime history of one service.                         |                            |
| `.ic-uptime-day`    | One day in the uptime history.                             | `data-status`              |
| `.ic-uptime-bar`    | The colored bar of one day.                                |                            |
| `.ic-incident-list` | The list of the incidents of one day.                      |                            |
| `.ic-incident-item` | One incident in that list.                                 |                            |
| `.ic-badge`         | A status label with a colored dot.                         |                            |
| `.ic-timeline`      | The updates of one incident.                               |                            |
| `.ic-update`        | One update in the timeline.                                |                            |
| `.ic-notice`        | The card on the subscription pages.                        |                            |

These are the values of the data attributes:

- `data-status`: `operational`, `under_maintenance`, `degraded_performance`, `partial_outage` or `major_outage`.
- `data-status` on `.ic-uptime-day`: also `no_data`, for a day that has no data.
- `data-kind`: `incident` or `maintenance`.

```css
/* A thicker border on the banner during a major outage */
.ic-banner[data-status="major_outage"] {
	border: 2px solid var(--ic-major);
}

/* Round uptime bars */
.ic-uptime-bar {
	border-radius: 9999px;
}

/* A larger logo */
.ic-logo {
	height: 3rem;
}
```

## Rules

- The custom CSS loads on each page, also in the portal. The portal shows some of these elements, such as `.ic-badge`. To change only the public pages, start a selector with `.ic-page`.
- To set a token for the public pages only, use `:root:has(.ic-page)`:

  ```css
  :root:has(.ic-page) {
  	--ic-bg: #0b1020;
  	--ic-surface: #121a33;
  	--ic-fg: #e8ecff;
  }
  ```

- To change the brand color, set `--ic-brand`. Also set `--ic-brand-fg`, because the text on a brand background uses it:

  ```css
  :root,
  [data-theme] {
  	--ic-brand: #4f46e5;
  	--ic-brand-fg: #ffffff;
  }
  ```

- The `default` preset has a dark mode. Each other preset has one color scheme. Use `@media (prefers-color-scheme: dark)` to set dark mode values.
- Keep sufficient contrast between text and background. Keep a different color for each status.
- A class name without the `ic-` prefix can change between releases. Do not use it in a selector.
- Do not hide the line "Powered by Incident Command" with custom CSS. Use the **Powered by** setting. See [Branding in the portal](/docs/theming/branding/#the-powered-by-line).
- A new value of the custom CSS replaces the stored stylesheet. An agent must read the current stylesheet with `get_settings` first, and then send the full stylesheet.

## Example

This stylesheet uses each method on this page. The `get_design_guide` MCP tool returns the same example.

```css
/* An @import rule must come first. */
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
	background: linear-gradient(
		135deg,
		var(--ic-surface),
		var(--ic-surface-muted)
	);
}
.ic-uptime-bar {
	border-radius: 9999px;
}
```

## Source of the lists

The `get_design_guide` MCP tool gives the same tokens, selectors, rules and limits to an agent. The source of the lists on this page is [`packages/app/src/lib/design.ts`](https://github.com/jaredwray/incident-command/blob/main/packages/app/src/lib/design.ts).
