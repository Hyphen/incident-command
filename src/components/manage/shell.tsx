import Link from "next/link";
import type { ReactNode } from "react";
import { LogoImage } from "@/components/logo-image";
import { PoweredBy } from "@/components/powered-by";
import { publicLogoSrc } from "@/lib/brand";
import { hasRole } from "@/lib/domain/status";
import type { PublicMember, Role, Settings } from "@/lib/domain/types";
import { resolveFlash } from "@/lib/flash";
import type { StoreHealth } from "@/lib/store/cached";
import { PortalNav } from "./portal-nav";
import { Flash } from "./ui";
import { UserMenu } from "./user-menu";

export const NAV: { label: string; href: string; role: Role }[] = [
	{ label: "Overview", href: "/manage", role: "viewer" },
	{ label: "Incidents", href: "/manage/incidents", role: "viewer" },
	{ label: "Drafts", href: "/manage/drafts", role: "viewer" },
	{ label: "Services", href: "/manage/services", role: "viewer" },
	{ label: "Regions", href: "/manage/regions", role: "viewer" },
	{ label: "Members", href: "/manage/members", role: "admin" },
	{ label: "Agents", href: "/manage/agents", role: "viewer" },
	{ label: "Subscribers", href: "/manage/subscribers", role: "admin" },
	{ label: "Settings", href: "/manage/settings", role: "admin" },
];

export interface FlashParams {
	notice?: string;
	error?: string;
}

/**
 * The sidebar and the content area of the portal. The portal layout renders
 * it one time, so it stays on the screen while a page loads.
 */
export function PortalFrame({
	member,
	settings,
	children,
}: {
	member: PublicMember;
	settings: Pick<Settings, "siteName" | "logoUpdatedAt">;
	children: ReactNode;
}) {
	const logoSrc = publicLogoSrc(settings);
	return (
		<div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
			<aside className="border-b border-border bg-surface lg:min-h-dvh lg:border-r lg:border-b-0">
				<div className="px-5 py-4">
					<Link
						href="/manage"
						className="flex items-center gap-3 font-semibold tracking-tight"
					>
						{logoSrc ? (
							<LogoImage
								src={logoSrc}
								alt=""
								className="h-8 w-auto max-w-28 object-contain"
							/>
						) : null}
						<span className="min-w-0 break-words">{settings.siteName}</span>
					</Link>
				</div>
				<PortalNav
					items={NAV.filter((item) => hasRole(member.role, item.role)).map(
						({ label, href }) => ({ label, href }),
					)}
				/>
				<UserMenu member={member} />
			</aside>
			<div className="flex min-h-dvh flex-col">
				<main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8 lg:px-8">
					{children}
				</main>
				<footer className="px-4 pb-8 text-xs text-muted lg:px-8">
					<PoweredBy />
				</footer>
			</div>
		</div>
	);
}

/** The heading, the messages and the content of one portal page. */
export function ManagePage({
	title,
	actions,
	flash = {},
	health,
	children,
}: {
	title: string;
	actions?: ReactNode;
	flash?: FlashParams;
	health?: StoreHealth;
	children: ReactNode;
}) {
	return (
		<>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
				{actions}
			</div>
			{health && !health.online && (
				<p
					role="alert"
					className="rounded-lg border border-degraded/40 bg-degraded/10 px-4 py-3 text-sm"
				>
					The database is unreachable ({health.lastError}). The status page is
					serving cached data and changes cannot be saved until it recovers.
				</p>
			)}
			<Flash {...resolveFlash(flash)} />
			{children}
		</>
	);
}

/**
 * The placeholder that shows in the content area while a portal page loads.
 * The browser gets it before the click, so a click shows it immediately.
 */
export function ManagePageSkeleton() {
	return (
		<div role="status" className="animate-pulse space-y-6">
			<span className="sr-only">Loading…</span>
			<div className="h-8 w-48 rounded-lg bg-surface-muted" />
			<div className="h-28 rounded-card border border-border bg-surface" />
			<div className="h-64 rounded-card border border-border bg-surface" />
		</div>
	);
}

/** Centered card layout used by the login and setup pages. */
export function AuthLayout({
	settings,
	title,
	children,
}: {
	settings: Pick<Settings, "siteName" | "logoUpdatedAt">;
	title: string;
	children: ReactNode;
}) {
	const logoSrc = publicLogoSrc(settings);
	return (
		<main className="mx-auto flex min-h-dvh max-w-sm flex-col px-4 py-12">
			<div className="my-auto">
				<div className="mb-3 flex items-center gap-3">
					{logoSrc ? (
						<LogoImage
							src={logoSrc}
							alt=""
							className="h-8 w-auto max-w-28 object-contain"
						/>
					) : null}
					<p className="min-w-0 text-sm font-medium break-words text-muted">
						{settings.siteName}
					</p>
				</div>
				<h1 className="mt-1 mb-6 text-2xl font-semibold tracking-tight">
					{title}
				</h1>
				<div className="rounded-card border border-border bg-surface p-6">
					{children}
				</div>
			</div>
			<p className="pt-8 text-center text-xs text-muted">
				<PoweredBy />
			</p>
		</main>
	);
}
