import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	poweredByHeader: false,
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
