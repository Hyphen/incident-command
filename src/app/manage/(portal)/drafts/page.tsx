import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The old drafts list. Pending drafts are on the incidents page. */
export default async function DraftsPage(): Promise<never> {
	redirect("/manage/incidents");
}
