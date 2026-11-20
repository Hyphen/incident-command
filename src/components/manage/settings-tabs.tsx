import Link from "next/link";

export type SettingsSection = "general" | "branding" | "notifications";

export const SETTINGS_SECTIONS: {
	key: SettingsSection;
	label: string;
	href: string;
}[] = [
	{ key: "general", label: "General", href: "/manage/settings" },
	{ key: "branding", label: "Branding", href: "/manage/settings/branding" },
	{
		key: "notifications",
		label: "Notifications",
		href: "/manage/settings/notifications",
	},
];

/**
 * The section links at the top of each settings page. The border is on
 * the outer element. The nav overlaps that border, so horizontal scroll
 * does not show a vertical scrollbar.
 */
export function SettingsTabs({ active }: { active: SettingsSection }) {
	return (
		<div className="border-b border-border">
			<nav
				aria-label="Settings sections"
				className="-mb-px flex gap-1 overflow-x-auto overflow-y-hidden"
			>
				{SETTINGS_SECTIONS.map((section) => (
					<Link
						key={section.key}
						href={section.href}
						aria-current={section.key === active ? "page" : undefined}
						className={`border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
							section.key === active
								? "border-brand font-medium text-fg"
								: "border-transparent text-muted hover:text-fg"
						}`}
					>
						{section.label}
					</Link>
				))}
			</nav>
		</div>
	);
}
