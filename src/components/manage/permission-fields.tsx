import {
	PERMISSIONS,
	permissionGroups,
} from "@/lib/domain/permissions";

/** Checkboxes for the permissions an agent can hold. */
export function PermissionFields({
	selected,
	disabled = false,
}: {
	selected: readonly string[];
	disabled?: boolean;
}) {
	const chosen = new Set(selected);
	return (
		<div className="space-y-4">
			{permissionGroups().map((group) => (
				<fieldset key={group.group} className="space-y-2" disabled={disabled}>
					<legend className="text-sm font-medium">{group.group}</legend>
					{group.permissions.map((permission) => {
						const spec = PERMISSIONS[permission];
						return (
							<label
								key={permission}
								className="flex items-start gap-2 text-sm"
							>
								<input
									type="checkbox"
									name="permissions"
									value={permission}
									defaultChecked={chosen.has(permission)}
									className="mt-0.5 size-4 accent-brand"
								/>
								<span>
									{spec.label}
									{spec.hint && (
										<span className="mt-0.5 block text-xs text-muted">
											{spec.hint}
										</span>
									)}
								</span>
							</label>
						);
					})}
				</fieldset>
			))}
		</div>
	);
}
