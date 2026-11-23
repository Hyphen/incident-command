const TRACK = "relative h-2 overflow-hidden rounded-full bg-surface-muted";

/* The `brand` tone shows work in progress. `globals.css` moves a sheen on it. */
const FILL = {
	brand: "ic-progress-busy bg-brand",
	operational: "bg-operational",
	major: "bg-major",
} as const;

type Props =
	| { indeterminate: true }
	| {
			indeterminate?: false;
			value: number;
			max: number;
			tone: keyof typeof FILL;
	  };

/**
 * A bar that shows how many notifications are complete.
 * An indeterminate bar shows work that has no count yet.
 * A busy bar at zero uses that same motion.
 */
export function ProgressBar(props: Props) {
	if (props.indeterminate) {
		return (
			<div role="progressbar" className={TRACK}>
				<div className="ic-progress-indeterminate bg-brand" />
			</div>
		);
	}
	const { value, max, tone } = props;
	const percent =
		max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
	const waiting = tone === "brand" && percent === 0;
	return (
		<div
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={max}
			aria-valuenow={value}
			className={TRACK}
		>
			<div
				className={`ic-progress-fill h-full ${FILL[tone]}`}
				style={{ width: `${percent}%` }}
			/>
			{waiting && <div className="ic-progress-indeterminate bg-brand" />}
		</div>
	);
}
