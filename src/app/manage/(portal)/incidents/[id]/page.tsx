import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	deleteIncidentAction,
	editIncidentAction,
	postIncidentUpdateAction,
} from "@/app/manage/actions";
import { ConfirmButton } from "@/components/manage/confirm-button";
import { DraftList } from "@/components/manage/draft-list";
import {
	AddServices,
	ImpactSelect,
	ServiceStatusList,
	ServiceStatusSelect,
	StatusSelect,
	WindowFields,
} from "@/components/manage/incident-fields";
import {
	type IncidentTab,
	IncidentTabs,
	incidentTab,
} from "@/components/manage/incident-tabs";
import { PostList } from "@/components/manage/post-list";
import { type FlashParams, ManagePage } from "@/components/manage/shell";
import {
	ButtonLink,
	buttonClass,
	Card,
	Checkbox,
	Field,
	inputClass,
} from "@/components/manage/ui";
import { EventStatusBadge, ImpactBadge } from "@/components/status/badges";
import { StatusTimeline } from "@/components/status/status-timeline";
import { Timeline } from "@/components/status/timeline";
import { SubmitButton } from "@/components/submit-button";
import { requireMember } from "@/lib/auth";
import { hasRole } from "@/lib/domain/status";
import type { Incident, NotificationDraft, Service } from "@/lib/domain/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Incident" };

interface IncidentQuery extends FlashParams {
	tab?: string;
	post?: string;
}

interface Props {
	params: Promise<{ id: string }>;
	searchParams: Promise<IncidentQuery>;
}

/** The number of posts on the dashboard. The posts tab shows every post. */
const LATEST_POSTS = 5;

function PostForm({
	incident,
	affected,
	catalog,
}: {
	incident: Incident;
	affected: Service[];
	catalog: Service[];
}) {
	return (
		<form
			action={postIncidentUpdateAction}
			className="mb-6 space-y-4 border-b border-border pb-6"
		>
			<input type="hidden" name="id" value={incident.id} />
			<StatusSelect kind={incident.kind} value={incident.status} />
			<Field label="Message" htmlFor="message">
				<textarea
					id="message"
					name="message"
					required
					rows={4}
					className={inputClass}
				/>
			</Field>
			<ServiceStatusSelect hint="Automatic restores services when resolving and starts maintenance mode when in progress." />
			<ServiceStatusList services={affected} />
			<AddServices catalog={catalog} affectedIds={incident.serviceIds} />
			<Checkbox name="notify" label="Notify subscribers" defaultChecked />
			<div className="flex flex-wrap gap-2">
				<SubmitButton className={buttonClass.primary}>Post update</SubmitButton>
				<Link
					href={`/manage/incidents/${incident.id}`}
					className={buttonClass.secondary}
				>
					Cancel
				</Link>
			</div>
		</form>
	);
}

function IncidentBody({
	tab,
	incident,
	affected,
	catalog,
	canEdit,
	showForm,
	pending,
	reviewed,
}: {
	tab: IncidentTab;
	incident: Incident;
	affected: Service[];
	catalog: Service[];
	canEdit: boolean;
	showForm: boolean;
	pending: NotificationDraft[];
	reviewed: NotificationDraft[];
}) {
	return (
		<div className="space-y-6">
			{tab === "dashboard" && (
				<Card
					title="Posts"
					actions={
						canEdit &&
						!showForm && (
							<ButtonLink href={`/manage/incidents/${incident.id}?post=1`}>
								Create a post
							</ButtonLink>
						)
					}
				>
					{showForm && (
						<PostForm
							incident={incident}
							affected={affected}
							catalog={catalog}
						/>
					)}
					<PostList
						incident={incident}
						drafts={reviewed}
						limit={LATEST_POSTS}
					/>
				</Card>
			)}
			{tab === "dashboard" && pending.length > 0 && (
				<Card title="Drafts" description="These drafts wait for review.">
					<DraftList
						items={pending.map((draft) => ({
							draft,
							title: draft.content.message,
						}))}
					/>
				</Card>
			)}
			{tab === "timeline" && (
				<Card title="Timeline">
					<Timeline incident={incident} showAuthors />
				</Card>
			)}
			{tab === "posts" && (
				<Card title="Posts">
					<PostList incident={incident} drafts={reviewed} />
				</Card>
			)}
		</div>
	);
}

export default async function ManageIncidentPage({
	params,
	searchParams,
}: Props) {
	const [{ id }, query] = await Promise.all([params, searchParams]);
	const { member, services, app } = await requireMember();
	const incident = await services.incidents.find(id);
	if (!incident) {
		notFound();
	}
	const tab = incidentTab(query.tab);
	const canEdit = hasRole(member.role, "editor");
	const [catalog, timeline, pending, reviewed] = await Promise.all([
		services.catalog.list(),
		services.status.incidentTimeline(incident),
		services.drafts.list({ pending: true, incidentId: incident.id }),
		services.drafts.list({ pending: false, incidentId: incident.id }),
	]);
	const affected = catalog.filter((service) =>
		incident.serviceIds.includes(service.id),
	);
	const isIncident = incident.kind === "incident";
	const showForm = tab === "dashboard" && query.post === "1" && canEdit;
	return (
		<ManagePage
			title={incident.title}
			flash={query}
			health={app.store.health}
			actions={
				<Link
					href={`/incidents/${incident.id}`}
					className={buttonClass.secondary}
				>
					View public page
				</Link>
			}
		>
			<div className="flex flex-wrap gap-2">
				<EventStatusBadge
					kind={incident.kind}
					impact={incident.impact}
					status={incident.status}
				/>
				{isIncident && <ImpactBadge impact={incident.impact} />}
			</div>
			<IncidentTabs id={incident.id} active={tab} />
			{tab === "dashboard" && timeline.services.length > 0 && (
				<StatusTimeline {...timeline} />
			)}
			<div
				className={canEdit ? "grid gap-6 lg:grid-cols-[1fr_320px]" : undefined}
			>
				<IncidentBody
					tab={tab}
					incident={incident}
					affected={affected}
					catalog={catalog}
					canEdit={canEdit}
					showForm={showForm}
					pending={pending}
					reviewed={reviewed}
				/>
				{canEdit && (
					<div className="space-y-6">
						<Card title="Details">
							<form action={editIncidentAction} className="space-y-4">
								<input type="hidden" name="id" value={incident.id} />
								<Field label="Title" htmlFor="edit-title">
									<input
										id="edit-title"
										name="title"
										defaultValue={incident.title}
										required
										className={inputClass}
									/>
								</Field>
								{isIncident ? (
									<ImpactSelect value={incident.impact} id="edit-impact" />
								) : (
									<WindowFields
										start={incident.scheduledStart}
										end={incident.scheduledEnd}
									/>
								)}
								<SubmitButton className={buttonClass.secondary}>
									Save details
								</SubmitButton>
							</form>
						</Card>
						<form action={deleteIncidentAction}>
							<input type="hidden" name="id" value={incident.id} />
							<ConfirmButton message="Delete this incident permanently? This cannot be undone.">
								Delete incident
							</ConfirmButton>
						</form>
					</div>
				)}
			</div>
		</ManagePage>
	);
}
