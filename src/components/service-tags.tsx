/**
 * Service choices as tags. The form sends `serviceIds` also when no service
 * is selected, so a save can clear the choice.
 */
export function ServiceTags({
	services,
	selected = [],
}: {
	services: readonly { id: string; name: string }[];
	selected?: readonly string[];
}) {
	if (services.length === 0) {
		return null;
	}
	return (
		<fieldset className="space-y-2">
			<legend className="text-sm font-medium text-fg">Services</legend>
			<input type="hidden" name="serviceIds" value="" />
			<div className="flex flex-wrap gap-2">
				{services.map((service) => (
					<label
						key={service.id}
						className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10"
					>
						<input
							type="checkbox"
							name="serviceIds"
							value={service.id}
							defaultChecked={selected.includes(service.id)}
							className="size-4 accent-brand"
						/>
						<span>{service.name}</span>
					</label>
				))}
			</div>
			<p className="text-xs text-muted">
				Select no service to get a notification for every service.
			</p>
		</fieldset>
	);
}
