"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLinkIcon } from "@/components/icons";

export interface PortalNavItem {
	label: string;
	href: string;
	/** Opens in a new tab. The item is not a portal section. */
	external?: boolean;
}

/** A section is active on its own path and on each path below it. */
function isActive(href: string, pathname: string): boolean {
	return (
		pathname === href || (href !== "/manage" && pathname.startsWith(`${href}/`))
	);
}

/**
 * The section links of the portal sidebar. An external item opens in a new
 * tab and is not a section. It stays at the bottom of the sidebar, above the
 * member and the line. The portal layout does not render again when the page
 * changes, so this component reads the path in the browser.
 */
export function PortalNav({ items }: { items: PortalNavItem[] }) {
	const pathname = usePathname();
	const sections = items.filter((item) => !item.external);
	const external = items.filter((item) => item.external);
	return (
		<nav
			className="px-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden"
			aria-label="Manage"
		>
			<div className="flex gap-1 overflow-x-auto pb-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:pb-0">
				{sections.map((item) => {
					const active = isActive(item.href, pathname);
					return (
						<Link
							key={item.href}
							href={item.href}
							aria-current={active ? "page" : undefined}
							className={`rounded-lg px-3 py-2 text-sm whitespace-nowrap ${
								active
									? "bg-surface-muted font-medium text-fg"
									: "text-muted hover:bg-surface-muted hover:text-fg"
							}`}
						>
							{item.label}
						</Link>
					);
				})}
			</div>
			{external.map((item) => (
				<a
					key={item.href}
					href={item.href}
					target="_blank"
					rel="noreferrer"
					aria-label={`${item.label} (opens in a new tab)`}
					className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium whitespace-nowrap text-fg hover:bg-surface-muted lg:mt-3 lg:shrink-0"
				>
					{item.label}
					<ExternalLinkIcon className="size-4 shrink-0 text-muted" />
				</a>
			))}
		</nav>
	);
}
