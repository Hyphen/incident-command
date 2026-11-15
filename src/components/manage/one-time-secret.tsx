import { CopyButton } from "./copy-button";

/** Shows a value that the server returns only once, with a copy button. */
export function OneTimeSecret({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div
			role="status"
			className="space-y-2 rounded-lg border border-operational/40 bg-operational/10 p-4"
		>
			<p className="text-sm font-medium">{label}</p>
			<div className="flex gap-2">
				<code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-surface px-3 py-2 font-mono text-xs">
					{value}
				</code>
				<CopyButton value={value} />
			</div>
		</div>
	);
}
