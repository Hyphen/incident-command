# Theming

Every color, radius and font in the UI comes from a small set of CSS custom properties (design tokens). Components only use Tailwind CSS v4 utilities mapped to those tokens (`bg-surface`, `text-muted`, `border-border`, `bg-operational`, `rounded-card`, …), so a theme is nothing more than a set of variables.

There are three levels of customization, from no code to full control. An agent can do the first two levels with the MCP server. See [Design the status page](mcp.md#design-the-status-page).

## 1. In the portal (no code)

**Manage → Settings → Branding**:

- **Theme:** pick one of six presets. Each preset shows a small preview of its colors, corners and font.

  | Preset     | Look                                                                        |
  | ---------- | --------------------------------------------------------------------------- |
  | `default`  | Neutral corporate look: gray page, white cards, navy text and a blue brand. |
  | `carbon`   | Neutral dark theme with thin borders and a blue accent.                     |
  | `terminal` | Dark console look with a monospace font and a green accent.                 |
  | `ocean`    | Cool light theme with navy text and a teal accent.                          |
  | `sunset`   | Warm light theme with cream surfaces and round corners.                     |
  | `mono`     | Black and white with sharp corners and no accent color.                     |

  The `default` preset follows the dark mode of the operating system. Each of the other presets has one color scheme. The `carbon` preset replaced the `midnight` preset. A site that has `midnight` in its settings shows `carbon`.
- **Logo:** upload a PNG, JPEG, WebP, GIF or SVG file. The maximum size of a file is 512 KB.
- **Favicon:** upload an ICO, PNG, JPEG, WebP, GIF or SVG file. The maximum size of a file is 512 KB.
- **Custom CSS:** inlined on every page after the theme, so it can override any token or style. `<` is escaped so the stylesheet can never break out of its `<style>` tag.
- **Powered by:** clear **Show "Powered by Incident Command" on the public pages** to remove the line from the footer of the public pages. The setting is on by default.

The app stores the logo and the favicon in the database. It loads them into memory at startup and serves them from `/brand/logo` and `/brand/favicon`. Thus the status page shows your brand when your website or the database is down. An agent uploads a file with the `upload_brand_asset` MCP tool.

By default, the status page and the manage portal show "Powered by Incident Command" at the bottom. The **Powered by** setting removes the line from the public pages. The manage portal always shows the line.

## 2. Custom CSS

The page loads the custom CSS after the theme. Thus the custom CSS can change each token and each style. The maximum length of the custom CSS is 50,000 characters.

### Tokens

Set a token to change a color, the corner radius or the font on all pages.

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

| Token                | Used for                          |
| -------------------- | --------------------------------- |
| `--ic-bg`            | Page background                   |
| `--ic-surface`       | Cards                             |
| `--ic-surface-muted` | Group headers, subtle fills       |
| `--ic-fg`            | Primary text                      |
| `--ic-muted`         | Secondary text                    |
| `--ic-border`        | Borders and dividers              |
| `--ic-brand`         | Buttons, links, focus rings       |
| `--ic-brand-fg`      | Text on brand-colored backgrounds |
| `--ic-operational`   | Operational status                |
| `--ic-degraded`      | Degraded performance              |
| `--ic-partial`       | Partial outage                    |
| `--ic-major`         | Major outage                      |
| `--ic-maintenance`   | Maintenance                       |
| `--ic-nodata`        | Uptime bars with no data          |
| `--ic-radius`        | Card corner radius                |
| `--ic-font`          | Font stack                        |

### Selectors

Each element of the public pages has a class name that starts with `ic-`. Use these class names to change one element. They stay the same between releases. The other class names of an element are Tailwind CSS utilities, and they can change.

| Selector            | Element                                                       | Data attributes            |
| ------------------- | ------------------------------------------------------------- | -------------------------- |
| `.ic-page`          | The root of each public page. The portal does not have it.    |                            |
| `.ic-header`        | The header of the page.                                       |                            |
| `.ic-logo`          | The uploaded logo in the header.                              |                            |
| `.ic-site-name`     | The site name in the header. It shows when no logo is stored. |                            |
| `.ic-nav`           | The links in the header.                                      |                            |
| `.ic-subscribe`     | The subscribe button.                                         |                            |
| `.ic-main`          | The content column.                                           |                            |
| `.ic-footer`        | The footer of the page.                                       |                            |
| `.ic-regions`       | The region tabs. The page shows them when a region exists.    |                            |
| `.ic-banner`        | The banner that shows the overall status.                     | `data-status`              |
| `.ic-description`   | The description below the banner.                             |                            |
| `.ic-incident`      | The card of an open incident or of maintenance.               | `data-kind`, `data-status` |
| `.ic-services`      | The system status card.                                       |                            |
| `.ic-group`         | The heading of a service group.                               |                            |
| `.ic-service`       | The row of one service.                                       | `data-status`              |
| `.ic-uptime`        | The uptime history of one service.                            |                            |
| `.ic-uptime-day`    | One day in the uptime history.                                | `data-status`              |
| `.ic-uptime-bar`    | The colored bar of one day.                                   |                            |
| `.ic-incident-list` | The list of the incidents of one day.                         |                            |
| `.ic-incident-item` | One incident in that list.                                    |                            |
| `.ic-badge`         | A status label with a colored dot.                            |                            |
| `.ic-timeline`      | The updates of one incident.                                  |                            |
| `.ic-update`        | One update in the timeline.                                   |                            |
| `.ic-notice`        | The card on the subscription pages.                           |                            |

A `data-status` value is `operational`, `under_maintenance`, `degraded_performance`, `partial_outage` or `major_outage`. A day in the uptime history that has no data has the value `no_data`. A `data-kind` value is `incident` or `maintenance`.

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

### Rules

- The custom CSS loads on each page. The portal is included, and it shows some of these elements, such as `.ic-badge`. Start a selector with `.ic-page` to change only the public pages.
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

- The `default` preset has a dark mode. Use `@media (prefers-color-scheme: dark)` to set dark mode values.
- Keep sufficient contrast between text and background. Keep a different color for each status.
- A class name without the `ic-` prefix can change between releases. Do not use it in a selector.

The `get_design_guide` MCP tool gives the same tokens, selectors and rules to an agent. The source of both lists is `src/lib/design.ts`.

## 3. Add a theme preset (code)

1. Create `src/themes/<id>.css`:

   ```css
   [data-theme="forest"] {
   	--ic-bg: #f3f7f2;
   	--ic-surface: #ffffff;
   	--ic-surface-muted: #e8f0e6;
   	--ic-fg: #10200f;
   	--ic-muted: #4d6150;
   	--ic-border: #d5e3d2;
   	--ic-brand: #2f7d32;
   	--ic-brand-fg: #ffffff;
   	--ic-operational: #2f9e44;
   	--ic-degraded: #d9a400;
   	--ic-partial: #f0700f;
   	--ic-major: #c92a2a;
   	--ic-maintenance: #3b6fd8;
   	--ic-nodata: #dbe6d8;
   	--ic-radius: 0.75rem;
   	--ic-font: ui-sans-serif, system-ui, sans-serif;
   	color-scheme: light;
   }
   ```

   Set each token in the table above. The theme picker shows a preset inside a page that uses a different theme. A token that the preset does not set comes from that theme.

2. Import it in `src/app/globals.css` next to the other presets.
3. Add `{ id: "forest", name: "Forest", description: "..." }` to `THEMES` in `src/lib/theme.ts`.

It now appears in the portal's theme picker. The selected preset is set as `data-theme` on `<html>`, so presets can also target dark mode with `@media (prefers-color-scheme: dark)` like `src/themes/default.css` does.

## Going further

The status page is built from small presentational components in `src/components/status/` (banner, incident card, uptime bars, system status, timeline). Fork and restyle them freely; the data they render comes from `services.status.summary()`, which is also exposed as public JSON at `/api/v1/status` if you would rather build a completely custom frontend.
