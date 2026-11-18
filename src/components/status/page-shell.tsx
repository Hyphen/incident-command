import Link from "next/link";
import type { ReactNode } from "react";
import { LogoImage } from "@/components/logo-image";
import { PoweredBy } from "@/components/powered-by";
import { publicLogoSrc } from "@/lib/brand";
import type { Settings } from "@/lib/domain/types";

export function SiteHeader({
	settings,
	canSubscribe,
}: {
	settings: Settings;
	canSubscribe: boolean;
}) {
	const logoSrc = publicLogoSrc(settings);
	return (
		<header className="ic-header mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-4 px-4 pt-10 pb-6">
			<Link href="/" className="flex items-center gap-3">
				{logoSrc ? (
					<LogoImage
						src={logoSrc}
						alt={settings.siteName}
						className="ic-logo h-8 w-auto max-w-48 object-contain"
					/>
				) : (
					<span className="ic-site-name text-lg font-semibold tracking-tight">
						{settings.siteName}
					</span>
				)}
			</Link>
			<nav className="ic-nav flex items-center gap-2 text-sm">
				{settings.supportUrl && (
					<a
						href={settings.supportUrl}
						className="rounded-full px-3 py-1.5 text-muted hover:text-fg"
						target="_blank"
						rel="noreferrer"
					>
						Support
					</a>
				)}
				{canSubscribe && (
					<Link
						href="/subscribe"
						className="ic-subscribe rounded-full bg-brand px-4 py-1.5 font-medium text-brand-fg hover:opacity-90"
					>
						Subscribe to updates
					</Link>
				)}
			</nav>
		</header>
	);
}

export function SiteFooter() {
	return (
		<footer className="ic-footer mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 pb-10 text-xs text-muted">
			<PoweredBy />
			<span className="flex gap-4">
				<Link href="/history" className="hover:text-fg">
					History
				</Link>
				<a href="/api/v1/status" className="hover:text-fg">
					API
				</a>
			</span>
		</footer>
	);
}

/**
 * Layout used by every public page. The `ic-*` class names on the public
 * pages are the selectors of the design guide (`src/lib/design.ts`). Custom
 * CSS uses them, thus do not rename or remove one.
 */
export function PublicPage({
	settings,
	canSubscribe,
	children,
}: {
	settings: Settings;
	canSubscribe: boolean;
	children: ReactNode;
}) {
	return (
		<div className="ic-page flex min-h-dvh flex-col">
			<SiteHeader settings={settings} canSubscribe={canSubscribe} />
			<main className="ic-main mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 pb-16">
				{children}
			</main>
			<SiteFooter />
		</div>
	);
}
