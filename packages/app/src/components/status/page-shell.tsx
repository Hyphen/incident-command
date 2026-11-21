import Link from "next/link";
import type { ReactNode } from "react";
import { LogoImage } from "@/components/logo-image";
import { PoweredBy } from "@/components/powered-by";
import { publicLogoSrc } from "@/lib/brand";
import type { Settings } from "@/lib/domain/types";
import { FEED_PATH } from "@/lib/feed";
import { LLMS_PATH } from "@/lib/llms";

/**
 * The column of the header, the main content and the footer.
 * The width is 58rem on a 1280px screen. The width grows to 80rem on a 2560px screen.
 */
const COLUMN =
	"mx-auto w-full max-w-[clamp(58rem,36rem_+_27.5vw,80rem)] px-4 md:px-6";

export function SiteHeader({
	settings,
	canSubscribe,
}: {
	settings: Settings;
	canSubscribe: boolean;
}) {
	const logoSrc = publicLogoSrc(settings);
	return (
		<header
			className={`ic-header ${COLUMN} flex flex-wrap items-center justify-between gap-4 pt-10 pb-6`}
		>
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

export function SiteFooter({ settings }: { settings: Settings }) {
	return (
		<footer
			className={`ic-footer ${COLUMN} flex flex-wrap items-center justify-between gap-2 pb-10 text-xs text-muted`}
		>
			{settings.showPoweredBy ? <PoweredBy /> : null}
			<span className="ml-auto flex gap-4">
				<Link href="/history" className="hover:text-fg">
					History
				</Link>
				<a href={FEED_PATH} className="hover:text-fg">
					RSS
				</a>
				<a href="/api/v1/status" className="hover:text-fg">
					API
				</a>
				<a href={LLMS_PATH} className="hover:text-fg">
					llms.txt
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
	narrow = false,
	children,
}: {
	settings: Settings;
	canSubscribe: boolean;
	/** Keep a short form in a narrow column. The header and the footer stay wide. */
	narrow?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="ic-page flex min-h-dvh flex-col">
			<SiteHeader settings={settings} canSubscribe={canSubscribe} />
			<main className={`ic-main ${COLUMN} flex-1 space-y-8 pb-16`}>
				{narrow ? (
					<div className="mx-auto w-full max-w-2xl space-y-8">{children}</div>
				) : (
					children
				)}
			</main>
			<SiteFooter settings={settings} />
		</div>
	);
}
