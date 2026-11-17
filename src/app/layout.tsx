import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { publicFaviconSrc } from "@/lib/brand";
import { loadSiteSettings } from "@/lib/site";
import { brandStyle, resolveTheme, sanitizeCss } from "@/lib/theme";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const settings = await loadSiteSettings();
	const favicon = publicFaviconSrc(settings);
	return {
		title: {
			default: settings.siteName,
			template: `%s · ${settings.siteName}`,
		},
		description:
			settings.description ||
			`Current status and incident history for ${settings.siteName}.`,
		icons: favicon ? { icon: favicon } : undefined,
		alternates: { types: { "application/rss+xml": "/feed.xml" } },
	};
}

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
};

export default async function RootLayout({
	children,
}: {
	children: ReactNode;
}) {
	const settings = await loadSiteSettings();
	return (
		<html
			lang="en"
			data-theme={resolveTheme(settings.theme)}
			style={brandStyle(settings)}
		>
			<head>
				{settings.customCss && (
					<style
						id="custom-css"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: admin-provided CSS, escaped by sanitizeCss
						dangerouslySetInnerHTML={{
							__html: sanitizeCss(settings.customCss),
						}}
					/>
				)}
			</head>
			<body className="bg-bg text-fg antialiased">{children}</body>
		</html>
	);
}
