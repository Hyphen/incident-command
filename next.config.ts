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
	serverExternalPackages: [
		"mongodb",
		"pg",
		"@airhornjs/aws",
		"@airhornjs/twilio",
	],
};

export default nextConfig;
