export interface ThemePreset {
	id: string;
	name: string;
	description: string;
}

/**
 * Built-in theme presets. Each maps to a `[data-theme="<id>"]` block in
 * `src/themes/<id>.css`. Add a preset by creating a CSS file, importing it in
 * `src/app/globals.css` and listing it here.
 */
export const THEMES: readonly ThemePreset[] = [
	{
		id: "default",
		name: "Default",
		description: "Neutral corporate look. Follows the system dark mode.",
	},
	{
		id: "carbon",
		name: "Carbon",
		description: "Neutral dark theme with thin borders.",
	},
	{
		id: "terminal",
		name: "Terminal",
		description: "Dark console look with a monospace font.",
	},
	{
		id: "ocean",
		name: "Ocean",
		description: "Cool light theme with a teal accent.",
	},
	{
		id: "sunset",
		name: "Sunset",
		description: "Warm light theme with round corners.",
	},
	{
		id: "mono",
		name: "Mono",
		description: "Black and white with sharp corners.",
	},
];

/** Ids of removed presets. Each id maps to the preset that replaced it. */
const REPLACED_THEMES = new Map([["midnight", "carbon"]]);

export function resolveTheme(id: string | undefined): string {
	const current = REPLACED_THEMES.get(id as string) ?? id;
	return THEMES.some((theme) => theme.id === current)
		? (current as string)
		: "default";
}

/**
 * Makes admin-provided CSS safe to inline in a `<style>` element by escaping
 * `<` so the stylesheet can never close the tag and inject markup.
 */
export function sanitizeCss(css: string | undefined): string {
	return (css ?? "").replaceAll("<", "\\3c ");
}
