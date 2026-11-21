import Link from "next/link";
import { GLOBAL_REGION_NAME } from "@/lib/domain/regions";
import type { Region } from "@/lib/domain/types";

/** A public URL that keeps the region and the other query fields. */
export function regionHref(
	path: string,
	regionId?: string,
	extra?: Record<string, string>,
): string {
	const params = new URLSearchParams(extra);
	if (regionId) {
		params.set("region", regionId);
	}
	const query = params.toString();
	return query === "" ? path : `${path}?${query}`;
}

/**
 * One tab for every outage, then one tab for each region.
 * Renders nothing when no region exists, so the status page stays one page.
 */
export function RegionTabs({
	regions,
	activeId,
	path,
	search,
	defaultLabel = GLOBAL_REGION_NAME,
}: {
	regions: readonly Region[];
	/** Set when a region tab is current. Omit it for the first tab. */
	activeId?: string;
	path: string;
	search?: Record<string, string>;
	/** Label of the tab that has no region. */
	defaultLabel?: string;
}) {
	if (regions.length === 0) {
		return null;
	}
	const tabs = [
		{ id: undefined as string | undefined, label: defaultLabel },
		...regions.map((region) => ({ id: region.id, label: region.name })),
	];
	return (
		<nav aria-label="Regions" className="ic-regions flex gap-2 overflow-x-auto">
			{tabs.map((tab) => {
				const current = tab.id === activeId;
				return (
					<Link
						key={tab.id ?? "global"}
						href={regionHref(path, tab.id, search)}
						aria-current={current ? "page" : undefined}
						className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${
							current
								? "bg-surface font-medium text-fg"
								: "text-muted hover:bg-surface hover:text-fg"
						}`}
					>
						{tab.label}
					</Link>
				);
			})}
		</nav>
	);
}
