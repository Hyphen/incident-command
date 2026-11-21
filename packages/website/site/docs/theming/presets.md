---
title: Add a theme preset
navTitle: Add a theme preset
description: Add a built-in theme preset to the Incident Command source code, and restyle the components of the status page.
order: 3
---

A theme preset is a set of values for the 16 design tokens. This page is for contributors who change the source code. To change the design without code, see [Branding in the portal](/docs/theming/branding/) and [Custom CSS](/docs/theming/custom-css/).

## Add a preset

This example adds a preset with the id `forest`. An id contains only lowercase letters, digits and hyphens. It has a maximum of 40 characters.

1. Create `packages/app/src/themes/forest.css` with a value for each token. The [themes folder](https://github.com/jaredwray/incident-command/tree/main/packages/app/src/themes) holds the other presets.

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

2. Import the file in [`packages/app/src/app/globals.css`](https://github.com/jaredwray/incident-command/blob/main/packages/app/src/app/globals.css), next to the other presets:

   ```css
   @import "../themes/forest.css";
   ```

3. Add `{ id: "forest", name: "Forest", description: "..." }` to `THEMES` in [`packages/app/src/lib/theme.ts`](https://github.com/jaredwray/incident-command/blob/main/packages/app/src/lib/theme.ts).
4. Add the id to the description of the `theme` field of `update_settings` in [`packages/app/src/lib/mcp/server.ts`](https://github.com/jaredwray/incident-command/blob/main/packages/app/src/lib/mcp/server.ts). That description names each preset for agents.
5. Add the id to the list of preset ids in the `theme helpers` test in [`packages/app/test/lib/web.test.ts`](https://github.com/jaredwray/incident-command/blob/main/packages/app/test/lib/web.test.ts).
6. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` from the repository root.

The preset then shows in the theme picker of the portal. The `get_design_guide` MCP tool also lists it.

## Rules for a preset

- Set each token in the [token table](/docs/theming/custom-css/#tokens). The `theme helpers` test fails when a preset does not set a token.
- The theme picker shows each preset inside the portal page, and that page can use a different theme. A token that the preset does not set comes from that theme.
- Set `color-scheme` to `light` or `dark`, as the other presets do.
- The test also makes sure that `globals.css` imports each preset, and that each file in `packages/app/src/themes/` has an entry in `THEMES`.

The app puts the id of the selected preset in the `data-theme` attribute of the `<html>` element. Thus a preset can also set dark mode values with `@media (prefers-color-scheme: dark)`. [`packages/app/src/themes/default.css`](https://github.com/jaredwray/incident-command/blob/main/packages/app/src/themes/default.css) shows this method:

```css
@media (prefers-color-scheme: dark) {
	:root:not([data-theme]),
	[data-theme="default"] {
		--ic-bg: #101214;
		--ic-surface: #171a1d;
		/* … the other color tokens … */
		color-scheme: dark;
	}
}
```

## Go further

Small presentational components make the status page. They are in [`packages/app/src/components/status/`](https://github.com/jaredwray/incident-command/tree/main/packages/app/src/components/status), for example the banner, the incident card, the uptime bars, the system status and the timeline. Fork the repository. Restyle the components as necessary.

In a component, use only the theme token utilities, such as `bg-surface`, `text-muted` and `bg-operational`. Do not use raw palette classes.

The components show the data from `services.status.summary()`. The public JSON endpoint `/api/v1/status` gives a public form of the same summary. Use that endpoint to build a fully custom front end. See [REST API](/api/) and [Public endpoints](/docs/reference/public-endpoints/).
