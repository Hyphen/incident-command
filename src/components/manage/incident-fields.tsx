import {
	EVENT_STATUS_LABELS,
	IMPACT_LABELS,
	SERVICE_STATUS_LABELS,
} from "@/lib/domain/status";
import {
	type EventStatus,
	INCIDENT_IMPACTS,
	INCIDENT_STATUSES,
	type IncidentImpact,
	type IncidentKind,
	MAINTENANCE_STATUSES,
	type Region,
	SERVICE_STATUSES,
	type Service,
	type ServiceStatus,
	type ServiceStatusOverride,
} from "@/lib/domain/types";
import { toDateTimeInput } from "@/lib/format";
import { Field, inputClass, Select } from "./ui";

export function statusesFor(kind: IncidentKind): readonly EventStatus[] {
	return kind === "incident" ? INCIDENT_STATUSES : MAINTENANCE_STATUSES;
}

export function StatusSelect({
	kind,
	value,
	id = "status",
	keepLabel,
}: {
	kind: IncidentKind;
	value?: EventStatus;
	id?: string;
	/** Adds a first option with an empty value. It keeps the current status. */
	keepLabel?: string;
}) {
	return (
		<Field label="Status" htmlFor={id}>
			<Select
				id={id}
				name="status"
				defaultValue={value ?? (keepLabel ? "" : undefined)}
			>
				{keepLabel && <option value="">{keepLabel}</option>}
				{statusesFor(kind).map((status) => (
					<option key={status} value={status}>
						{EVENT_STATUS_LABELS[status]}
					</option>
				))}
			</Select>
		</Field>
	);
}

/** The region of an incident. Renders nothing when no region exists. */
export function RegionSelect({
	regions,
	value,
}: {
	regions: readonly Region[];
	value?: string;
}) {
	if (regions.length === 0) {
		return null;
	}
	return (
		<Field
			label="Region"
			htmlFor="regionId"
			hint="Global is the default. It shows on every region tab."
		>
			<Select id="regionId" name="regionId" defaultValue={value ?? ""}>
				<option value="">Global</option>
				{regions.map((region) => (
					<option key={region.id} value={region.id}>
						{region.name}
					</option>
				))}
			</Select>
		</Field>
	);
}

export function ImpactSelect({
	value,
	id = "impact",
}: {
	value?: IncidentImpact;
	id?: string;
}) {
	return (
		<Field label="Impact" htmlFor={id}>
			<Select id={id} name="impact" defaultValue={value ?? "minor"}>
				{INCIDENT_IMPACTS.map((impact) => (
					<option key={impact} value={impact}>
						{IMPACT_LABELS[impact]}
					</option>
				))}
			</Select>
		</Field>
	);
}

export function ServiceStatusSelect({
	id = "serviceStatus",
	hint,
	value,
}: {
	id?: string;
	hint: string;
	value?: ServiceStatus;
}) {
	return (
		<Field label="Set affected services to" htmlFor={id} hint={hint}>
			<Select id={id} name="serviceStatus" defaultValue={value ?? ""}>
				<option value="">Automatic</option>
				{SERVICE_STATUSES.map((status) => (
					<option key={status} value={status}>
						{SERVICE_STATUS_LABELS[status]}
					</option>
				))}
			</Select>
		</Field>
	);
}

/**
 * The status select of one service. The form sends it as
 * `serviceStatus:<id>`. The empty value uses the status for all services.
 */
function OwnStatusSelect({
	service,
	value,
	className = "block",
}: {
	service: Service;
	value?: ServiceStatus;
	className?: string;
}) {
	return (
		<div className={`w-full shrink-0 sm:w-56 ${className}`}>
			<Select
				name={`serviceStatus:${service.id}`}
				aria-label={`Status of ${service.name}`}
				defaultValue={value ?? ""}
			>
				<option value="">Same as all services</option>
				{SERVICE_STATUSES.map((status) => (
					<option key={status} value={status}>
						{SERVICE_STATUS_LABELS[status]}
					</option>
				))}
			</Select>
		</div>
	);
}

function statusOf(
	statuses: readonly ServiceStatusOverride[],
	serviceId: string,
): ServiceStatus | undefined {
	return statuses.find((entry) => entry.serviceId === serviceId)?.status;
}

/** The hint for the status select of each service. */
const OWN_STATUS_HINT =
	"The status of a service replaces the status for all affected services, for that service only.";

/** The hint for the status select in each row of the service picker. */
const PICKER_STATUS_HINT =
	"Select a service to give it its own status. That status replaces the status for all affected services, for that service only.";

/** The hint for the control that adds a service during an update. */
const ADD_SERVICE_HINT =
	"Select a service to add it. Its status replaces the status for all affected services, for that service only.";

/**
 * A status select for each affected service of an incident. It also shows
 * the current status of each service.
 */
export function ServiceStatusList({
	services,
	values = [],
}: {
	services: Service[];
	values?: readonly ServiceStatusOverride[];
}) {
	if (services.length === 0) {
		return null;
	}
	return (
		<fieldset className="space-y-2">
			<legend className="text-sm font-medium">Status of each service</legend>
			<div className="space-y-2">
				{services.map((service) => (
					<div
						key={service.id}
						className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm sm:flex-nowrap"
					>
						<div className="min-w-0 flex-1">
							<p className="truncate">{service.name}</p>
							<p className="text-xs text-muted">
								Now: {SERVICE_STATUS_LABELS[service.status]}
							</p>
						</div>
						<OwnStatusSelect
							service={service}
							value={statusOf(values, service.id)}
						/>
					</div>
				))}
			</div>
			<p className="text-xs text-muted">{OWN_STATUS_HINT}</p>
		</fieldset>
	);
}

export function ServicePicker({
	services,
	selected = [],
	withStatus = false,
	statuses = [],
	legend = "Affected services",
	emptyLabel = "No services yet.",
	name = "serviceIds",
	candidateName,
	showCurrent = false,
	hint = PICKER_STATUS_HINT,
}: {
	services: Service[];
	selected?: string[];
	/** Adds a status select to each service. Only a selected service uses its status. */
	withStatus?: boolean;
	/** The saved status of each service, for `withStatus`. */
	statuses?: readonly ServiceStatusOverride[];
	legend?: string;
	emptyLabel?: string;
	/** The checkbox field name. */
	name?: string;
	/** When set, the form sends this field for every service in the list. */
	candidateName?: string;
	/** Shows the current status of each service. */
	showCurrent?: boolean;
	hint?: string;
}) {
	return (
		<fieldset className="space-y-2">
			<legend className="text-sm font-medium">{legend}</legend>
			{/* The form sends the field also when no service is selected. A
			    server action then knows that the form has this picker. */}
			<input type="hidden" name={name} value="" />
			{services.length === 0 ? (
				<p className="text-sm text-muted">{emptyLabel}</p>
			) : (
				<div
					className={withStatus ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}
				>
					{services.map((service) => (
						<div
							key={service.id}
							className="group flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm sm:flex-nowrap"
						>
							{candidateName && (
								<input type="hidden" name={candidateName} value={service.id} />
							)}
							<label className="flex min-w-0 flex-1 items-center gap-2">
								<input
									type="checkbox"
									name={name}
									value={service.id}
									defaultChecked={selected.includes(service.id)}
									className="size-4 accent-brand"
								/>
								<span className="min-w-0 flex-1">
									<span className="block truncate">{service.name}</span>
									{showCurrent && (
										<span className="block text-xs text-muted">
											Now: {SERVICE_STATUS_LABELS[service.status]}
										</span>
									)}
								</span>
								{service.group && (
									<span className="shrink-0 text-xs text-muted">
										{service.group}
									</span>
								)}
							</label>
							{withStatus && (
								// Only a selected service uses its status, so the select
								// shows only while the checkbox is selected.
								<OwnStatusSelect
									service={service}
									value={statusOf(statuses, service.id)}
									className="hidden group-has-[input:checked]:block"
								/>
							)}
						</div>
					))}
				</div>
			)}
			{withStatus && services.length > 0 && (
				<p className="text-xs text-muted">{hint}</p>
			)}
		</fieldset>
	);
}

/**
 * Services that an update can add. Services that the incident already
 * affects are not in this list. A selected service is added. The others stay.
 */
export function AddServices({
	catalog,
	affectedIds,
	selected = [],
	statuses = [],
}: {
	catalog: Service[];
	affectedIds: readonly string[];
	selected?: readonly string[];
	statuses?: readonly ServiceStatusOverride[];
}) {
	const available = catalog.filter(
		(service) => !affectedIds.includes(service.id),
	);
	return (
		<ServicePicker
			legend="Add a service"
			services={available}
			selected={[...selected]}
			withStatus
			statuses={statuses}
			name="addServiceIds"
			candidateName="addServiceCandidate"
			showCurrent
			emptyLabel={
				catalog.length === 0
					? "No services yet."
					: "Every service is on this incident."
			}
			hint={ADD_SERVICE_HINT}
		/>
	);
}

export function WindowFields({ start, end }: { start?: string; end?: string }) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<Field label="Starts (UTC)" htmlFor="scheduledStart">
				<input
					id="scheduledStart"
					name="scheduledStart"
					type="datetime-local"
					defaultValue={toDateTimeInput(start)}
					className={inputClass}
				/>
			</Field>
			<Field label="Ends (UTC)" htmlFor="scheduledEnd">
				<input
					id="scheduledEnd"
					name="scheduledEnd"
					type="datetime-local"
					defaultValue={toDateTimeInput(end)}
					className={inputClass}
				/>
			</Field>
		</div>
	);
}
