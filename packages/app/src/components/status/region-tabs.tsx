import Link from "next/link";
import { STATUS_OVERVIEW_LABEL } from "@/lib/domain/regions";
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
 * The Overview tab lists every outage. Then one tab lists each region.
 * The tabs render nothing when no region exists.
 *
 * Overflow on the nav clips the focus outline.
 * The padding leaves room for that outline.
 * The negative margin keeps the labels in place.
 * The outer element has no margin of its own.
 * Thus it keeps the space that the page puts between sections.
 */
export function RegionTabs({
	regions,
	activeId,
	path,
	search,
}: {
	regions: readonly Region[];
	/** Set when a region tab is current. Omit it for the Overview tab. */
	activeId?: string;
	path: string;
	search?: Record<string, string>;
}) {
	if (regions.length === 0) {
		return null;
	}
	const tabs = [
		{ id: undefined as string | undefined, label: STATUS_OVERVIEW_LABEL },
		...regions.map((region) => ({ id: region.id, label: region.name })),
	];
	return (
		<div className="flow-root">
			<nav
				aria-label="Regions"
				className="ic-regions -m-1.5 flex gap-2 overflow-x-auto p-1.5"
			>
				{tabs.map((tab) => {
					const current = tab.id === activeId;
					return (
						<Link
							key={tab.id ?? "overview"}
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
		</div>
	);
}
