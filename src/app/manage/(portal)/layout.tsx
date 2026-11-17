import type { ReactNode } from "react";
import { PortalFrame } from "@/components/manage/shell";
import { getMemberContext } from "@/lib/auth";

/**
 * The layout of the signed-in portal pages. It keeps the sidebar on the
 * screen while `loading.tsx` shows in the content area. Each page still does
 * its own access check, because a layout does not render again on navigation.
 */
export default async function PortalLayout({
	children,
}: {
	children: ReactNode;
}) {
	const context = await getMemberContext();
	if (!context) {
		// The page sends the visitor to the sign-in page.
		return children;
	}
	const settings = await context.services.settings.get();
	return (
		<PortalFrame member={context.member} settings={settings}>
			{children}
		</PortalFrame>
	);
}
