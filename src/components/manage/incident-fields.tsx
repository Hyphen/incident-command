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
	type ServiceRegions,
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

function regionIdsFor(
	serviceId: string,
	values: readonly ServiceRegions[],
): string[] {
	return values.find((entry) => entry.serviceId === serviceId)?.regionIds ?? [];
}

/**
 * Region choices for one service. No choice means Global.
 * The form sends each choice as `regionIds:<service id>`.
 */
function ServiceRegionChoices({
	service,
	regions,
	selected,
	hiddenUntilChecked = false,
}: {
	service: Service;
	regions: readonly Region[];
	selected: readonly string[];
	/** Hides the choices until the service checkbox is checked. */
	hiddenUntilChecked?: boolean;
}) {
	return (
		<div
			className={
				hiddenUntilChecked
					? "hidden w-full basis-full peer-checked:block"
					: "w-full basis-full"
			}
		>
			<p className="text-xs text-muted">
				Regions for {service.name}. Select none for Global.
			</p>
			<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
				{regions.map((region) => (
					<label key={region.id} className="flex items-center gap-1.5 text-xs">
						<input
							type="checkbox"
							name={`regionIds:${service.id}`}
							value={region.id}
							defaultChecked={selected.includes(region.id)}
							className="size-3.5 accent-brand"
						/>
						{region.name}
					</label>
				))}
			</div>
		</div>
	);
}

/**
 * Regions for services that are already on the incident.
 * The form sends `serviceRegions` so an empty choice can clear a region.
 */
export function ServiceRegionEditor({
	services,
	regions,
	values = [],
}: {
	services: readonly Service[];
	regions: readonly Region[];
	values?: readonly ServiceRegions[];
}) {
	if (regions.length === 0 || services.length === 0) {
		return null;
	}
	return (
		<fieldset className="space-y-2">
			<legend className="text-sm font-medium">Regions of each service</legend>
			<input type="hidden" name="serviceRegions" value="" />
			<div className="space-y-2">
				{services.map((service) => (
					<div
						key={service.id}
						className="rounded-lg border border-border px-3 py-2 text-sm"
					>
						<p className="mb-1 truncate">{service.name}</p>
						<ServiceRegionChoices
							service={service}
							regions={regions}
							selected={regionIdsFor(service.id, values)}
						/>
					</div>
				))}
			</div>
		</fieldset>
	);
}

/** The title field. Each post records the title. */
export function TitleField({
	value,
	hint,
	id = "title",
}: {
	value?: string;
	hint?: string;
	id?: string;
}) {
	return (
		<Field label="Incident Title" htmlFor={id} hint={hint}>
			<input
				id={id}
				name="title"
				defaultValue={value}
				required
				maxLength={200}
				className={inputClass}
			/>
		</Field>
	);
}

export function ImpactSelect({
	value,
	id = "impact",
	hint,
}: {
	value?: IncidentImpact;
	id?: string;
	hint?: string;
}) {
	return (
		<Field label="Impact" htmlFor={id} hint={hint}>
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
	regions = [],
	serviceRegions = [],
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
	/** Named regions. Each selected service can use one, more than one, or none. */
	regions?: readonly Region[];
	/** The saved regions of each service. */
	serviceRegions?: readonly ServiceRegions[];
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
	const showRegions = regions.length > 0;
	return (
		<fieldset className="space-y-2">
			<legend className="text-sm font-medium">{legend}</legend>
			{/* The form sends the field also when no service is selected. A
			    server action then knows that the form has this picker. */}
			<input type="hidden" name={name} value="" />
			{showRegions && <input type="hidden" name="serviceRegions" value="" />}
			{services.length === 0 ? (
				<p className="text-sm text-muted">{emptyLabel}</p>
			) : (
				<div
					className={
						withStatus || showRegions
							? "grid gap-2"
							: "grid gap-2 sm:grid-cols-2"
					}
				>
					{services.map((service) => (
						<div
							key={service.id}
							className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
						>
							{candidateName && (
								<input type="hidden" name={candidateName} value={service.id} />
							)}
							<input
								id={`${name}-${service.id}`}
								type="checkbox"
								name={name}
								value={service.id}
								defaultChecked={selected.includes(service.id)}
								className="peer size-4 accent-brand"
							/>
							<label
								htmlFor={`${name}-${service.id}`}
								className="flex min-w-0 flex-1 items-center gap-2"
							>
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
									className="hidden peer-checked:block"
								/>
							)}
							{showRegions && (
								<ServiceRegionChoices
									service={service}
									regions={regions}
									selected={regionIdsFor(service.id, serviceRegions)}
									hiddenUntilChecked
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
	regions = [],
	serviceRegions = [],
}: {
	catalog: Service[];
	affectedIds: readonly string[];
	selected?: readonly string[];
	statuses?: readonly ServiceStatusOverride[];
	regions?: readonly Region[];
	serviceRegions?: readonly ServiceRegions[];
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
			regions={regions}
			serviceRegions={serviceRegions}
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
