import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	poweredByHeader: false,
	async headers() {
		// Another site must not show the consent page in a frame (RFC 6749
		// section 10.13), because a click there connects an agent.
		return [
			{
				source: "/manage/authorize",
				headers: [
					{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
					{ key: "X-Frame-Options", value: "DENY" },
				],
			},
		];
	},
	async redirects() {
		// Older links and bookmarks point to the page under its old name.
		return [
			{
				source: "/manage/components",
				destination: "/manage/services",
				permanent: false,
			},
		];
	},
	// Node loads these packages from node_modules. airhorn is in the list
	// because the provider packages load it too, and one copy must load, not two.
	serverExternalPackages: [
		"mongodb",
		"pg",
		"airhorn",
		"@airhornjs/aws",
		"@airhornjs/twilio",
	],
};

export default nextConfig;
