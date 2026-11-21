import type { Metadata } from "next";
import {
	createRegionAction,
	deleteRegionAction,
	updateRegionAction,
} from "@/app/manage/actions";
import { ConfirmButton } from "@/components/manage/confirm-button";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import {
	buttonClass,
	Card,
	EmptyState,
	Field,
	inputClass,
} from "@/components/manage/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/domain/status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Regions" };

export default async function RegionsPage({
	searchParams,
}: {
	searchParams: Promise<FlashParams>;
}) {
	const flash = await searchParams;
	const { member, services, app } = await requireMember();
	const regions = await services.regions.list();
	const canEdit = hasRole(member.role, "editor");
	return (
		<ManagePage title="Regions" flash={flash} health={app.store.health}>
			<Card
				title="All regions"
				description="Add a region to split the status page. Then each affected service needs one or more regions."
			>
				{regions.length === 0 ? (
					<EmptyState>
						No regions yet. The status page stays one page.
					</EmptyState>
				) : (
					<ul className="divide-y divide-border">
						{regions.map((region) => (
							<li key={region.id} className="py-4">
								{canEdit ? (
									<div className="flex flex-wrap items-end gap-3">
										<form
											action={updateRegionAction}
											className="flex flex-wrap items-end gap-3"
										>
											<input type="hidden" name="id" value={region.id} />
											<Field label="Name" htmlFor={`name-${region.id}`}>
												<input
													id={`name-${region.id}`}
													name="name"
													required
													maxLength={80}
													defaultValue={region.name}
													className={inputClass}
												/>
											</Field>
											<Field label="Order" htmlFor={`order-${region.id}`}>
												<input
													id={`order-${region.id}`}
													name="order"
													type="number"
													required
													defaultValue={region.order}
													className={`${inputClass} w-24`}
												/>
											</Field>
											<SubmitButton className={buttonClass.secondary}>
												Save
											</SubmitButton>
										</form>
										<form action={deleteRegionAction}>
											<input type="hidden" name="id" value={region.id} />
											<ConfirmButton message="Delete this region? A closed incident that used only this region will show only on Overview.">
												Delete
											</ConfirmButton>
										</form>
									</div>
								) : (
									<p className="font-medium">
										{region.name}
										<span className="ml-2 text-xs font-normal text-muted">
											order {region.order}
										</span>
									</p>
								)}
							</li>
						))}
					</ul>
				)}
			</Card>
			{canEdit && (
				<Card title="Add a region">
					<form action={createRegionAction} className="flex flex-wrap gap-3">
						<Field label="Name" htmlFor="region-name">
							<input
								id="region-name"
								name="name"
								required
								maxLength={80}
								placeholder="United States"
								className={inputClass}
							/>
						</Field>
						<Field label="Order" htmlFor="region-order">
							<input
								id="region-order"
								name="order"
								type="number"
								placeholder={String(regions.length)}
								className={`${inputClass} w-24`}
							/>
						</Field>
						<div className="flex items-end">
							<SubmitButton className={buttonClass.primary}>
								Add region
							</SubmitButton>
						</div>
					</form>
				</Card>
			)}
		</ManagePage>
	);
}
