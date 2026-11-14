"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface PortalNavItem {
	label: string;
	href: string;
}

/** A section is active on its own path and on each path below it. */
function isActive(href: string, pathname: string): boolean {
	return (
		pathname === href || (href !== "/manage" && pathname.startsWith(`${href}/`))
	);
}

/**
 * The section links of the portal sidebar. The portal layout does not render
 * again when the page changes, so this component reads the path in the browser.
 */
export function PortalNav({ items }: { items: PortalNavItem[] }) {
	const pathname = usePathname();
	return (
		<nav
			className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0"
			aria-label="Manage"
		>
			{items.map((item) => {
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
		</nav>
	);
}
