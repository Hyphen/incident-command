---
title: Branding in the portal
navTitle: Branding in the portal
description: Select a theme preset, upload a logo and a favicon, and control the "Powered by" line on the Branding page of the portal.
order: 1
---

Each color, corner radius and font in the UI comes from a small set of CSS custom properties, the design tokens. The components use only Tailwind CSS v4 utilities that map to these tokens, such as `bg-surface`, `text-muted`, `border-border`, `bg-operational` and `rounded-card`. Thus a theme is only a set of variables.

You can change the design at three levels:

1. **Branding in the portal:** select a theme, and upload a logo and a favicon. This level needs no code. This page describes it.
2. **[Custom CSS](/docs/theming/custom-css/):** change the design tokens and the style of single elements.
3. **[Add a theme preset](/docs/theming/presets/):** add a preset to the source code.

An agent can do the first two levels through the MCP server. See [Design the status page through MCP](/docs/agents/workflows/#design-the-status-page-through-mcp).

## Open the Branding page

Only an admin can change the branding.

1. In the portal, select **Settings**.
2. Select the **Branding** tab.
3. Make your changes.
4. Select **Save branding**.

![The Branding page in the portal, with the theme presets, the logo, the favicon and the custom CSS](/images/manage-branding.png)

## Theme presets

Select one of six presets under **Theme**. Each preset shows a small preview of its colors, corners and font.

| Preset     | Look                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| `default`  | Neutral corporate look: gray page, white cards, navy text and a blue brand. |
| `carbon`   | Neutral dark theme with thin borders and a blue accent.                     |
| `terminal` | Dark console look with a monospace font and a green accent.                 |
| `ocean`    | Cool light theme with navy text and a teal accent.                          |
| `sunset`   | Warm light theme with cream surfaces and round corners.                     |
| `mono`     | Black and white with sharp corners and no accent color.                     |

The `default` preset follows the dark mode of the operating system. Each of the other presets has one color scheme.

The `carbon` preset replaced the `midnight` preset. A site that has `midnight` in its settings shows `carbon`. A site with an unknown preset shows `default`.

## Logo and favicon

- **Logo:** upload a PNG, JPEG, WebP, GIF or SVG file. The maximum size of a file is 512 KB.
- **Favicon:** upload an ICO, PNG, JPEG, WebP, GIF or SVG file. The maximum size of a file is 512 KB.

An SVG file cannot contain a script or an event handler. The app examines the content of each file to find its type.

To remove a file, select **Remove the uploaded logo** or **Remove the uploaded favicon**, and then save. Without a logo, the header shows the site name. Without a favicon, the browser shows its default icon.

The app stores the logo and the favicon in the database. At startup, it reads them into memory. It serves them from `/brand/logo` and `/brand/favicon`. Thus the status page shows your brand when your website or the database is down.

An agent uploads a file with the `upload_brand_asset` MCP tool.

## Custom CSS

The **Custom CSS** field holds a stylesheet. Each page loads it after the theme, so it can change each token and each style. The maximum length is 50,000 characters. See [Custom CSS](/docs/theming/custom-css/) for the tokens, the selectors and the rules.

## The "Powered by" line

By default, the status page and the portal show "Powered by Incident Command" at the bottom. To remove the line from the public pages, clear **Show “Powered by Incident Command” on the public pages**. The setting is on by default. The portal always shows the line.

An agent changes this setting with `showPoweredBy` in the `update_settings` MCP tool. Do not hide the line with custom CSS.
