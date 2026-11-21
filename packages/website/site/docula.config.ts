import type { DoculaOptions } from "docula";

// The documentation site for https://incident-command.org.
// Build it from packages/website: docula resolves the paths against the
// working directory. `pnpm website:build` at the repository root does this.

const repository = "https://github.com/jaredwray/incident-command";

export const options: Partial<DoculaOptions> = {
	template: "modern",
	githubPath: "jaredwray/incident-command",
	siteTitle: "Incident Command",
	siteDescription:
		"Open source status page, management portal and MCP server. Deploy it anywhere.",
	siteUrl: "https://incident-command.org",
	// site/README.md is the home page. The repository README is for GitHub.
	autoReadme: false,
	// The root .gitignore ignores .cache, so docula does not write a .gitignore.
	autoUpdateIgnores: false,
	enableSearch: true,
	enableLlmsTxt: true,
	// GitHub releases become the changelog. Set GITHUB_TOKEN for the build.
	enableReleaseChangelog: true,
	openApiUrl: "api/swagger.json",
	editPageUrl: `${repository}/edit/main/packages/website/site/docs`,
	headerLinks: [
		{ label: "Live example", url: "https://dev.incident-command.org" },
		{
			label: "Docker Hub",
			url: "https://hub.docker.com/r/jaredwray/incident-command",
		},
		{ label: "Contribute", url: `${repository}/blob/main/CONTRIBUTING.md` },
	],
	sections: [
		{ name: "Getting Started", path: "getting-started", order: 1 },
		{ name: "Deploy", path: "deploy", order: 2 },
		{ name: "Configure and Operate", path: "operate", order: 3 },
		{ name: "User Guide", path: "guide", order: 4 },
		{ name: "Agents and MCP", path: "agents", order: 5 },
		{ name: "Reference", path: "reference", order: 6 },
		{ name: "Theming", path: "theming", order: 7 },
	],
};
