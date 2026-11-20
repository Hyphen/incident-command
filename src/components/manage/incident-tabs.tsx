import Link from "next/link";

export type IncidentTab = "dashboard" | "timeline" | "posts";

const TABS: { key: IncidentTab; label: string }[] = [
	{ key: "dashboard", label: "Dashboard" },
	{ key: "timeline", label: "Timeline" },
	{ key: "posts", label: "Posts" },
];

/** The tab of an incident page. Any other value is the dashboard. */
export function incidentTab(value: string | undefined): IncidentTab {
	return value === "timeline" || value === "posts" ? value : "dashboard";
}

function tabHref(id: string, tab: IncidentTab): string {
	const path = `/manage/incidents/${id}`;
	return tab === "dashboard" ? path : `${path}?tab=${tab}`;
}

/** The section links at the top of an incident page. */
export function IncidentTabs({
	id,
	active,
}: {
	id: string;
	active: IncidentTab;
}) {
	return (
		<nav
			aria-label="Incident"
			className="flex gap-1 overflow-x-auto border-b border-border"
		>
			{TABS.map((tab) => (
				<Link
					key={tab.key}
					href={tabHref(id, tab.key)}
					aria-current={tab.key === active ? "page" : undefined}
					className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
						tab.key === active
							? "border-brand font-medium text-fg"
							: "border-transparent text-muted hover:text-fg"
					}`}
				>
					{tab.label}
				</Link>
			))}
		</nav>
	);
}
