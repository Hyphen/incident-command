import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/manage/actions";
import { WatchtowerLogo } from "@/components/watchtower-logo";
import { hasRole, ROLE_LABELS } from "@/lib/domain/status";
import type { PublicMember, Role } from "@/lib/domain/types";
import { resolveFlash } from "@/lib/flash";
import type { StoreHealth } from "@/lib/store/cached";
import { SubmitButton } from "../submit-button";
import { PortalNav } from "./portal-nav";
import { Flash } from "./ui";

export const NAV: { label: string; href: string; role: Role }[] = [
	{ label: "Overview", href: "/manage", role: "viewer" },
	{ label: "Incidents", href: "/manage/incidents", role: "viewer" },
	{ label: "Drafts", href: "/manage/drafts", role: "viewer" },
	{ label: "Services", href: "/manage/services", role: "viewer" },
	{ label: "Members", href: "/manage/members", role: "admin" },
	{ label: "Agents & MCP", href: "/manage/agents", role: "admin" },
	{ label: "Subscribers", href: "/manage/subscribers", role: "admin" },
	{ label: "Settings", href: "/manage/settings", role: "admin" },
	{ label: "Account", href: "/manage/account", role: "viewer" },
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
	siteName,
	children,
}: {
	member: PublicMember;
	siteName: string;
	children: ReactNode;
}) {
	return (
		<div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
			<aside className="border-b border-border bg-surface lg:min-h-dvh lg:border-r lg:border-b-0">
				<div className="px-5 py-4">
					<Link
						href="/manage"
						className="flex items-center gap-3 font-semibold tracking-tight"
					>
						<WatchtowerLogo />
						<span className="min-w-0 break-words">{siteName}</span>
					</Link>
				</div>
				<PortalNav
					items={NAV.filter((item) => hasRole(member.role, item.role)).map(
						({ label, href }) => ({ label, href }),
					)}
				/>
				<div className="hidden border-t border-border px-5 py-4 text-sm lg:mt-6 lg:block">
					<p className="truncate font-medium">{member.name}</p>
					<p className="truncate text-xs text-muted">
						{member.email} · {ROLE_LABELS[member.role]}
					</p>
					<div className="mt-3 flex gap-3 text-xs">
						<Link href="/" className="text-muted hover:text-fg">
							View status page
						</Link>
						<form action={logoutAction}>
							<SubmitButton className="inline-flex items-center gap-1 text-muted hover:text-fg disabled:opacity-50">
								Sign out
							</SubmitButton>
						</form>
					</div>
				</div>
			</aside>
			<main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 lg:px-8">
				{children}
			</main>
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
	siteName,
	title,
	children,
}: {
	siteName: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
			<div className="mb-3 flex items-center gap-3">
				<WatchtowerLogo />
				<p className="min-w-0 text-sm font-medium break-words text-muted">
					{siteName}
				</p>
			</div>
			<h1 className="mt-1 mb-6 text-2xl font-semibold tracking-tight">
				{title}
			</h1>
			<div className="rounded-card border border-border bg-surface p-6">
				{children}
			</div>
		</main>
	);
}
