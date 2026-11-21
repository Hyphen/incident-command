import { revalidatePath } from "next/cache";
import {
	acceptInviteAction,
	addNotificationProviderAction,
	addSubscriberAction,
	approveAgentAction,
	approveDraftAction,
	changePasswordAction,
	createAgentAction,
	createAgentTokenAction,
	createIncidentAction,
	createRegionAction,
	createServiceAction,
	deleteAgentAction,
	deleteIncidentAction,
	deleteMemberAction,
	deleteRegionAction,
	deleteServiceAction,
	deleteSubscriberAction,
	denyAgentAction,
	discardDraftAction,
	disconnectAgentAction,
	editIncidentAction,
	inviteMemberAction,
	loginAction,
	logoutAction,
	moveNotificationProviderAction,
	postIncidentUpdateAction,
	removeNotificationProviderAction,
	renewInviteLinkAction,
	revokeAgentTokenAction,
	revokeInviteAction,
	saveDraftAction,
	setServiceStatusAction,
	setupAction,
	submitTwoFactorAction,
	updateAgentAction,
	updateBrandingAction,
	updateGeneralSettingsAction,
	updateMemberAction,
	updateNotificationChannelAction,
	updateNotificationProviderAction,
	updateRegionAction,
	updateServiceAction,
	updateSubscriberServicesAction,
} from "@/app/manage/actions";
import {
	subscribeAction,
	unsubscribeAction,
	unsubscribeAddressAction,
	updateServicesAction,
} from "@/app/subscribe/actions";
import { SESSION_COOKIE } from "@/lib/auth";
import { BRAND_ASSET_MESSAGES } from "@/lib/domain/brand-asset";
import { totpAt } from "@/lib/domain/totp";
import { SYSTEM_ACTOR } from "@/lib/services/context";
import { ICO_FAVICON, JPEG_LOGO, PNG_LOGO } from "../brand-asset-bytes";
import { agentActor } from "../helpers";
import {
	AGENT_REDIRECT,
	authorizationQuery,
	connectAgent,
	expectFlashRedirect,
	expectSameFlash,
	flashMessage,
	form,
	redirectOf,
	setupApp,
	signIn,
} from "./app";
import { cookieJar } from "./next-state";

describe("session actions", () => {
	it("sets up the first admin and signs them in", async () => {
		const { services, clock } = await setupApp();
		const url = await redirectOf(
			setupAction(
				form({ name: "Ada", email: "ada@acme.dev", password: "password123" }),
			),
		);
		expectSameFlash(
			url,
			"/manage/login/two-factor?notice=Welcome! Your admin account is ready.",
		);
		expect(
			await services.sessions.resolve(cookieJar.get(SESSION_COOKIE)?.value),
		).toBeUndefined();
		await expect(
			services.sessions.resolvePending(cookieJar.get(SESSION_COOKIE)?.value),
		).resolves.toBeDefined();
		const pending = await services.sessions.resolvePending(
			cookieJar.get(SESSION_COOKIE)?.value,
		);
		const settings = await services.settings.get();
		const started = await services.twoFactor.status(
			pending?.member.id ?? "",
			settings.siteName,
		);
		expectSameFlash(
			await redirectOf(
				submitTwoFactorAction(
					form({
						code: totpAt(started.setup?.secret ?? "", clock.now().getTime()),
					}),
				),
			),
			"/manage/account?notice=Two-factor authentication is on. Save your recovery codes.",
		);
		await expect(
			services.sessions.resolve(cookieJar.get(SESSION_COOKIE)?.value),
		).resolves.toBeDefined();
		expect(cookieJar.get(SESSION_COOKIE)?.value).toBeTruthy();
		expect(cookieJar.get(SESSION_COOKIE)).toMatchObject({
			httpOnly: true,
			sameSite: "lax",
			path: "/",
		});
		expect(await services.members.count()).toBe(1);
		expectSameFlash(
			await redirectOf(
				setupAction(
					form({ name: "B", email: "b@acme.dev", password: "password123" }),
				),
			),
			"/manage/setup?error=Setup has already been completed",
		);
	});

	it("opens the portal when two-factor authentication is optional", async () => {
		const { services } = await setupApp();
		await services.settings.update(SYSTEM_ACTOR, { requireTwoFactor: false });
		expectSameFlash(
			await redirectOf(
				setupAction(
					form({ name: "Ada", email: "ada@acme.dev", password: "password123" }),
				),
			),
			"/manage?notice=Welcome! Your admin account is ready.",
		);
		await expect(
			services.sessions.resolve(cookieJar.get(SESSION_COOKIE)?.value),
		).resolves.toBeDefined();
	});

	it("checks the setup token", async () => {
		await setupApp({ SETUP_TOKEN: "s3t" });
		expectSameFlash(
			await redirectOf(
				setupAction(
					form({
						name: "A",
						email: "a@acme.dev",
						password: "password123",
						token: "nope",
					}),
				),
			),
			"/manage/setup?error=Invalid setup token",
		);
	});

	it("logs in and out", async () => {
		const { services } = await setupApp();
		await services.members.setup({
			name: "Ada",
			email: "ada@acme.dev",
			password: "password123",
		});
		expectSameFlash(
			await redirectOf(
				loginAction(form({ email: "ada@acme.dev", password: "wrong" })),
			),
			"/manage/login?error=Invalid email or password",
		);
		expect(
			await redirectOf(
				loginAction(form({ email: "ADA@acme.dev", password: "password123" })),
			),
		).toBe("/manage/login/two-factor");
		const token = cookieJar.get(SESSION_COOKIE)?.value;
		await expect(services.sessions.resolve(token)).resolves.toBeUndefined();
		await expect(
			services.sessions.resolvePending(token),
		).resolves.toBeDefined();
		expect(await redirectOf(logoutAction())).toBe("/manage/login");
		expect(cookieJar.get(SESSION_COOKIE)).toBeUndefined();
		await expect(services.sessions.resolve(token)).resolves.toBeUndefined();
	});

	it("returns to the portal path of the sign-in link", async () => {
		const { services } = await setupApp();
		await services.settings.update(SYSTEM_ACTOR, { requireTwoFactor: false });
		await services.members.setup({
			name: "Ada",
			email: "ada@acme.dev",
			password: "password123",
		});
		const next = "/manage/drafts/drf_1";
		expectSameFlash(
			await redirectOf(
				loginAction(form({ email: "ada@acme.dev", password: "wrong", next })),
			),
			"/manage/login?next=/manage/drafts/drf_1&error=Invalid email or password",
		);
		expect(
			await redirectOf(
				loginAction(
					form({ email: "ada@acme.dev", password: "password123", next }),
				),
			),
		).toBe(next);
		for (const unsafe of [
			"https://evil.example",
			"//evil.example",
			"/x",
			"/manage/drafts\r\nSet-Cookie: a=b",
		]) {
			expect(
				await redirectOf(
					loginAction(
						form({
							email: "ada@acme.dev",
							password: "password123",
							next: unsafe,
						}),
					),
				),
			).toBe("/manage");
		}
	});

	it("handles missing form fields", async () => {
		await setupApp();
		expectSameFlash(
			await redirectOf(loginAction(new FormData())),
			"/manage/login?error=Invalid email or password",
		);
	});

	it("changes the signed-in member's password", async () => {
		const { app } = await setupApp();
		const { member } = await signIn(app, "viewer");
		expectSameFlash(
			await redirectOf(
				changePasswordAction(
					form({ currentPassword: "nope", newPassword: "password456" }),
				),
			),
			"/manage/account?error=Current password is incorrect",
		);
		expectSameFlash(
			await redirectOf(
				changePasswordAction(
					form({ currentPassword: "password123", newPassword: "password456" }),
				),
			),
			"/manage/account?notice=Password updated",
		);
		await expect(
			app.services.members.authenticate({
				email: member.email,
				password: "password456",
			}),
		).resolves.toBeDefined();
	});

	it("requires a session and the right role", async () => {
		const { app } = await setupApp();
		expect(await redirectOf(createServiceAction(form({ name: "API" })))).toBe(
			"/manage/login",
		);
		await signIn(app, "viewer");
		expectSameFlash(
			await redirectOf(createServiceAction(form({ name: "API" }))),
			"/manage?error=That page requires the editor role",
		);
	});

	it("rethrows unexpected errors", async () => {
		const { app } = await setupApp();
		await signIn(app, "editor");
		vi.spyOn(app.services.catalog, "create").mockRejectedValueOnce(
			new Error("boom"),
		);
		await expect(createServiceAction(form({ name: "API" }))).rejects.toThrow(
			"boom",
		);
	});
});

describe("incident actions", () => {
	it("declares, updates, edits and deletes incidents", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "editor");
		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });

		const created = await redirectOf(
			createIncidentAction(
				form({
					title: "API down",
					message: "Investigating",
					impact: "critical",
					serviceIds: [api.id, ""],
					notify: "on",
					status: "",
				}),
			),
		);
		const [incident] = await services.incidents.list();
		expectSameFlash(
			created,
			`/manage/incidents/${incident?.id}?notice=Incident declared`,
		);
		expect(incident).toMatchObject({
			kind: "incident",
			impact: "critical",
			serviceIds: [api.id],
		});
		expect((await services.catalog.get(api.id)).status).toBe("major_outage");

		expectSameFlash(
			await redirectOf(
				postIncidentUpdateAction(
					form({
						id: incident?.id ?? "",
						title: "API outage",
						impact: "major",
						status: "resolved",
						message: "Fixed",
						serviceStatus: "",
					}),
				),
			),
			`/manage/incidents/${incident?.id}?notice=Update posted`,
		);
		expect(await services.incidents.get(incident?.id ?? "")).toMatchObject({
			title: "API outage",
			impact: "major",
		});
		expect(
			(await services.incidents.get(incident?.id ?? "")).updates.at(-1),
		).toMatchObject({ title: "API outage", impact: "major" });
		expectSameFlash(
			await redirectOf(
				postIncidentUpdateAction(
					form({
						id: incident?.id ?? "",
						message: "Noted on the posts tab",
						tab: "posts",
					}),
				),
			),
			`/manage/incidents/${incident?.id}?tab=posts&notice=Update posted`,
		);
		expect((await services.incidents.get(incident?.id ?? "")).status).toBe(
			"resolved",
		);

		const incidentId = incident?.id ?? "";
		expectSameFlash(
			await redirectOf(
				deleteIncidentAction(form({ id: incidentId, reason: "   " })),
			),
			`/manage/incidents/${incidentId}?error=Write a reason before you delete the incident.`,
		);
		expect(await services.incidents.get(incidentId)).toMatchObject({
			title: "API outage",
		});
		expectSameFlash(
			await redirectOf(
				deleteIncidentAction(
					form({ id: incidentId, reason: "Duplicate report" }),
				),
			),
			"/manage/incidents?notice=Incident deleted from the public view",
		);
		const hidden = await services.incidents.find(incidentId, {
			includeDeleted: true,
		});
		expect(hidden).toMatchObject({
			deletedReason: "Duplicate report",
			deletedBy: { name: "Editor User", type: "member" },
		});
		const deletedAgain = await redirectOf(
			deleteIncidentAction(form({ id: incidentId, reason: "Again" })),
		);
		expect(new URL(deletedAgain, "http://localhost").pathname).toBe(
			`/manage/incidents/${incidentId}`,
		);
		expect(flashMessage(deletedAgain, "error")).toBe(
			"That item was not found.",
		);
	});

	it("sets the status of each service from the form", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "editor");
		const [api, web, db] = await Promise.all(
			["API", "Web", "DB"].map((name) =>
				services.catalog.create(SYSTEM_ACTOR, { name }),
			),
		);
		const statusOf = async (id = "") => (await services.catalog.get(id)).status;
		// The picker sends an empty serviceIds value. DB is not selected, so its status has no effect.
		const created = await redirectOf(
			createIncidentAction(
				form({
					title: "Errors",
					message: "Looking",
					impact: "critical",
					serviceIds: ["", api?.id ?? "", web?.id ?? ""],
					[`serviceStatus:${api?.id}`]: "partial_outage",
					[`serviceStatus:${web?.id}`]: "",
					[`serviceStatus:${db?.id}`]: "major_outage",
				}),
			),
		);
		expect(flashMessage(created, "notice")).toBe("Incident declared");
		const [incident] = await services.incidents.list();
		expect(incident?.serviceIds).toEqual([api?.id, web?.id]);
		expect(await statusOf(api?.id)).toBe("partial_outage");
		expect(await statusOf(web?.id)).toBe("major_outage");
		expect(await statusOf(db?.id)).toBe("operational");

		// The update form has no full picker. Each status with a value counts.
		await redirectOf(
			postIncidentUpdateAction(
				form({
					id: incident?.id ?? "",
					message: "Better",
					status: "",
					serviceStatus: "",
					[`serviceStatus:${api?.id}`]: "",
					[`serviceStatus:${web?.id}`]: "degraded_performance",
				}),
			),
		);
		expect(await statusOf(api?.id)).toBe("partial_outage");
		expect(await statusOf(web?.id)).toBe("degraded_performance");

		// The update form can add a service. A status for a service that is not selected has no effect.
		const added = await redirectOf(
			postIncidentUpdateAction(
				form({
					id: incident?.id ?? "",
					message: "DB is down",
					addServiceIds: ["", db?.id ?? ""],
					addServiceCandidate: [db?.id ?? "", "left-out"],
					[`serviceStatus:${api?.id}`]: "degraded_performance",
					[`serviceStatus:${db?.id}`]: "major_outage",
					"serviceStatus:left-out": "partial_outage",
				}),
			),
		);
		expect(flashMessage(added, "notice")).toBe("Update posted");
		expect(
			(await services.incidents.get(incident?.id ?? "")).serviceIds,
		).toEqual([api?.id, web?.id, db?.id]);
		expect(await statusOf(api?.id)).toBe("degraded_performance");
		expect(await statusOf(web?.id)).toBe("degraded_performance");
		expect(await statusOf(db?.id)).toBe("major_outage");
	});

	it("schedules maintenance from datetime-local inputs", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "admin");
		const url = await redirectOf(
			createIncidentAction(
				form({
					kind: "maintenance",
					title: "Upgrade",
					message: "Planned",
					scheduledStart: "2026-11-05T02:00",
					scheduledEnd: "2026-11-05T03:00",
				}),
			),
		);
		expect(flashMessage(url, "notice")).toBe("Maintenance scheduled");
		const [maintenance] = await services.incidents.list();
		expect(maintenance).toMatchObject({
			kind: "maintenance",
			title: "Upgrade",
			scheduledStart: "2026-11-05T02:00:00.000Z",
			scheduledEnd: "2026-11-05T03:00:00.000Z",
		});
		expectSameFlash(
			await redirectOf(
				editIncidentAction(
					form({
						id: maintenance?.id ?? "",
						title: "Ignored",
						scheduledEnd: "2026-11-05T04:00",
					}),
				),
			),
			`/manage/incidents/${maintenance?.id}?notice=Incident saved`,
		);
		expect(await services.incidents.get(maintenance?.id ?? "")).toMatchObject({
			title: "Upgrade",
			scheduledEnd: "2026-11-05T04:00:00.000Z",
		});
	});

	it("redirects back with validation errors", async () => {
		const { app } = await setupApp();
		await signIn(app, "editor");
		expectSameFlash(
			await redirectOf(
				createIncidentAction(
					form({ kind: "maintenance", title: "x", message: "y" }),
				),
			),
			"/manage/incidents/new?kind=maintenance&error=Maintenance requires scheduledStart and scheduledEnd",
		);
		const titleError = await redirectOf(
			createIncidentAction(form({ title: "", message: "y" })),
		);
		expect(
			new URL(titleError, "http://localhost").searchParams.get("kind"),
		).toBe("incident");
		expect(flashMessage(titleError, "error")).toBe(
			"Check the form and try again.",
		);
		const missingUpdate = await redirectOf(
			postIncidentUpdateAction(form({ id: "nope", message: "x" })),
		);
		expect(new URL(missingUpdate, "http://localhost").pathname).toBe(
			"/manage/incidents/nope",
		);
		expect(
			new URL(missingUpdate, "http://localhost").searchParams.get("post"),
		).toBe("1");
		expect(flashMessage(missingUpdate, "error")).toBeTruthy();
		const missingPostsUpdate = await redirectOf(
			postIncidentUpdateAction(
				form({ id: "nope", message: "x", tab: "posts" }),
			),
		);
		expect(new URL(missingPostsUpdate, "http://localhost").pathname).toBe(
			"/manage/incidents/nope",
		);
		expect(
			new URL(missingPostsUpdate, "http://localhost").searchParams.get("tab"),
		).toBe("posts");
		expect(
			new URL(missingPostsUpdate, "http://localhost").searchParams.get("post"),
		).toBe("1");
		const missingEdit = await redirectOf(
			editIncidentAction(form({ id: "nope", title: "x" })),
		);
		expect(new URL(missingEdit, "http://localhost").pathname).toBe(
			"/manage/incidents/nope",
		);
		expect(flashMessage(missingEdit, "error")).toBeTruthy();
	});
});

describe("notification draft actions", () => {
	const AGENT = agentActor();

	it("saves, approves and discards drafts", async () => {
		const { app, services, notifier } = await setupApp();
		await signIn(app, "editor");
		await services.subscribers.addWebhook(SYSTEM_ACTOR, {
			url: "https://hooks.example.com/x",
		});
		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		const draft = await services.drafts.create(AGENT, {
			title: "API errors",
			message: "x",
		});
		const fields = {
			id: draft.id,
			title: "Elevated API errors",
			status: "identified",
			impact: "major",
			message: "We found the cause.",
			serviceIds: [api.id, ""],
			serviceStatus: "",
			[`serviceStatus:${api.id}`]: "partial_outage",
		};
		expectSameFlash(
			await redirectOf(saveDraftAction(form(fields))),
			`/manage/drafts/${draft.id}?notice=Draft saved`,
		);
		expect((await services.drafts.get(draft.id)).content).toMatchObject({
			title: "Elevated API errors",
			status: "identified",
			impact: "major",
			message: "We found the cause.",
			serviceIds: [api.id],
			serviceStatuses: [{ serviceId: api.id, status: "partial_outage" }],
		});
		expect(notifier.incidents).toHaveLength(0);

		const approved = await redirectOf(approveDraftAction(form(fields)));
		const [incident] = await services.incidents.list();
		expectSameFlash(
			approved,
			`/manage/incidents/${incident?.id}?notice=Draft approved. The update is published and subscribers are notified.`,
		);
		expect(incident).toMatchObject({
			title: "Elevated API errors",
			status: "identified",
			serviceIds: [api.id],
		});
		expect(notifier.incidents).toHaveLength(1);
		expectSameFlash(
			await redirectOf(approveDraftAction(form(fields))),
			`/manage/drafts/${draft.id}?error=This draft was already approved`,
		);

		const web = await services.catalog.create(SYSTEM_ACTOR, { name: "Web" });
		const update = await services.drafts.create(AGENT, {
			incidentId: incident?.id ?? "",
			message: "y",
		});
		// An update can change the title and the impact. It can add a service.
		expectSameFlash(
			await redirectOf(
				saveDraftAction(
					form({
						id: update.id,
						title: "API outage",
						impact: "critical",
						status: "monitoring",
						message: "Edited",
						addServiceIds: ["", web.id],
						addServiceCandidate: [web.id],
						[`serviceStatus:${api.id}`]: "degraded_performance",
						[`serviceStatus:${web.id}`]: "major_outage",
					}),
				),
			),
			`/manage/drafts/${update.id}?notice=Draft saved`,
		);
		expect((await services.drafts.get(update.id)).content).toMatchObject({
			title: "API outage",
			impact: "critical",
			status: "monitoring",
			message: "Edited",
			serviceIds: [web.id],
			serviceStatuses: [
				{ serviceId: api.id, status: "degraded_performance" },
				{ serviceId: web.id, status: "major_outage" },
			],
		});
		const approvedUpdate = await redirectOf(
			approveDraftAction(
				form({
					id: update.id,
					status: "monitoring",
					message: "Edited",
					addServiceIds: [web.id],
					addServiceCandidate: [web.id],
					[`serviceStatus:${api.id}`]: "degraded_performance",
					[`serviceStatus:${web.id}`]: "major_outage",
				}),
			),
		);
		expect(flashMessage(approvedUpdate, "notice")).toContain("Draft approved");
		expect(await services.incidents.get(incident?.id ?? "")).toMatchObject({
			serviceIds: [api.id, web.id],
		});
		expect((await services.catalog.get(web.id)).status).toBe("major_outage");
		const later = await services.drafts.create(AGENT, {
			incidentId: incident?.id ?? "",
			message: "y",
		});
		expectSameFlash(
			await redirectOf(discardDraftAction(form({ id: later.id }))),
			"/manage/incidents?notice=Draft discarded",
		);
		expectSameFlash(
			await redirectOf(discardDraftAction(form({ id: later.id }))),
			`/manage/drafts/${later.id}?error=This draft was already discarded`,
		);
	});

	it("saves the window of maintenance from datetime-local inputs", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "editor");
		const draft = await services.drafts.create(AGENT, {
			kind: "maintenance",
			title: "Upgrade",
			message: "x",
			scheduledStart: "2026-11-05T00:00:00.000Z",
			scheduledEnd: "2026-11-05T01:00:00.000Z",
		});
		await redirectOf(
			saveDraftAction(
				form({
					id: draft.id,
					title: "Upgrade",
					message: "x",
					scheduledStart: "2026-11-05T02:00",
					scheduledEnd: "2026-11-05T03:00",
				}),
			),
		);
		expect((await services.drafts.get(draft.id)).content).toMatchObject({
			scheduledStart: "2026-11-05T02:00:00.000Z",
			scheduledEnd: "2026-11-05T03:00:00.000Z",
		});
	});

	it("redirects back with errors and requires the editor role", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "editor");
		const draft = await services.drafts.create(AGENT, {
			title: "API errors",
			message: "x",
		});
		expectSameFlash(
			await redirectOf(
				approveDraftAction(form({ id: draft.id, title: "x", message: "" })),
			),
			`/manage/drafts/${draft.id}?error=validation_failed`,
		);
		expect((await services.drafts.get(draft.id)).state).toBe("pending");
		await signIn(app, "viewer");
		expectSameFlash(
			await redirectOf(discardDraftAction(form({ id: draft.id }))),
			"/manage?error=That page requires the editor role",
		);
	});
});

describe("service actions", () => {
	it("creates, edits, sets status and deletes services", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "editor");
		expectSameFlash(
			await redirectOf(
				createServiceAction(
					form({ name: "API", group: "Core", description: "", hidden: "on" }),
				),
			),
			"/manage/services?notice=Service created",
		);
		const [api] = await services.catalog.list();
		expect(api).toMatchObject({ name: "API", group: "Core", hidden: true });

		expectSameFlash(
			await redirectOf(
				updateServiceAction(
					form({
						id: api?.id ?? "",
						name: "REST API",
						group: "",
						description: "Public",
						order: "4",
					}),
				),
			),
			"/manage/services?notice=Service saved",
		);
		const updated = await services.catalog.get(api?.id ?? "");
		expect(updated).toMatchObject({
			name: "REST API",
			description: "Public",
			order: 4,
			hidden: false,
		});
		expect(updated.group).toBeUndefined();

		expectSameFlash(
			await redirectOf(
				updateServiceAction(
					form({ id: api?.id ?? "", name: "REST API", order: "" }),
				),
			),
			"/manage/services?notice=Service saved",
		);

		expectSameFlash(
			await redirectOf(
				setServiceStatusAction(
					form({ id: api?.id ?? "", status: "partial_outage" }),
				),
			),
			"/manage/services?notice=Status updated",
		);
		expect((await services.catalog.get(api?.id ?? "")).status).toBe(
			"partial_outage",
		);
		expect(
			flashMessage(
				await redirectOf(
					setServiceStatusAction(form({ id: api?.id ?? "", status: "bogus" })),
				),
				"error",
			),
		).toBeTruthy();

		expectSameFlash(
			await redirectOf(deleteServiceAction(form({ id: api?.id ?? "" }))),
			"/manage/services?notice=Service deleted",
		);
		expect(
			flashMessage(
				await redirectOf(deleteServiceAction(form({ id: api?.id ?? "" }))),
				"error",
			),
		).toBe("That item was not found.");
	});
});

describe("member actions", () => {
	it("creates invite links through useActionState and revokes them", async () => {
		const { app, services } = await setupApp();
		const { actor } = await signIn(app, "admin");
		const state = await inviteMemberAction(
			{},
			form({ email: "Ed@Acme.dev", role: "viewer" }),
		);
		expect(state.email).toBe("ed@acme.dev");
		expect(state.url).toMatch(
			/^http:\/\/localhost:3000\/manage\/invite\?token=[\w-]{43}$/,
		);
		const token = new URL(state.url as string).searchParams.get("token");
		await expect(
			services.members.findInvite(token as string),
		).resolves.toMatchObject({ email: "ed@acme.dev", role: "viewer" });
		expect(
			await inviteMemberAction({}, form({ email: "nope", role: "editor" })),
		).toMatchObject({ error: expect.stringMatching(/^email/) });

		const [invite] = await services.members.listInvites(actor);
		const renewed = await renewInviteLinkAction(invite?.id ?? "");
		expect(renewed).toEqual({
			url: expect.stringMatching(
				/^http:\/\/localhost:3000\/manage\/invite\?token=[\w-]{43}$/,
			),
		});
		const renewedUrl = "url" in renewed ? renewed.url : "";
		await expect(
			services.members.findInvite(
				new URL(renewedUrl).searchParams.get("token") as string,
			),
		).resolves.toMatchObject({ email: "ed@acme.dev" });

		expectSameFlash(
			await redirectOf(revokeInviteAction(form({ id: invite?.id ?? "" }))),
			"/manage/members?notice=Invite revoked",
		);
		expect(
			flashMessage(
				await redirectOf(revokeInviteAction(form({ id: invite?.id ?? "" }))),
				"error",
			),
		).toBe("That item was not found.");
		expect(await renewInviteLinkAction(invite?.id ?? "")).toEqual({
			error: expect.stringMatching(/^Invite/),
		});
	});

	it("uses the configured site url for invite links", async () => {
		const { app } = await setupApp({ SITE_URL: "https://status.example.com" });
		await signIn(app, "admin");
		const state = await inviteMemberAction(
			{},
			form({ email: "ed@acme.dev", role: "editor" }),
		);
		expect(state.url).toMatch(
			/^https:\/\/status\.example\.com\/manage\/invite\?token=/,
		);
	});

	it("creates the account from an invite and signs the member in", async () => {
		const { services } = await setupApp();
		const { token } = await services.members.invite(SYSTEM_ACTOR, {
			email: "ed@acme.dev",
			role: "editor",
		});
		expectSameFlash(
			await redirectOf(
				acceptInviteAction(form({ token, name: "Ed", password: "short" })),
			),
			`/manage/invite?token=${token}&error=validation_failed`,
		);
		expect(cookieJar.get(SESSION_COOKIE)).toBeUndefined();
		expectSameFlash(
			await redirectOf(
				acceptInviteAction(
					form({ token, name: "Ed", password: "password123" }),
				),
			),
			"/manage/login/two-factor?notice=Welcome! Your account is ready.",
		);
		const session = await services.sessions.resolvePending(
			cookieJar.get(SESSION_COOKIE)?.value,
		);
		expect(session?.member).toMatchObject({
			email: "ed@acme.dev",
			name: "Ed",
			role: "editor",
		});
		expectSameFlash(
			await redirectOf(
				acceptInviteAction(
					form({ token, name: "Ed", password: "password123" }),
				),
			),
			`/manage/invite?token=${token}&error=invite_invalid`,
		);
	});

	it("updates and removes members", async () => {
		const { app, services } = await setupApp();
		const { actor } = await signIn(app, "admin");
		const { token } = await services.members.invite(actor, {
			email: "ed@acme.dev",
		});
		const ed = await services.members.acceptInvite(token, {
			name: "Ed",
			password: "password123",
		});
		vi.mocked(revalidatePath).mockClear();
		expectSameFlash(
			await redirectOf(
				updateMemberAction(form({ id: ed.id, role: "viewer", password: "" })),
			),
			"/manage/members?notice=Member updated",
		);
		// The sidebar shows the role of the member who is signed in.
		expect(revalidatePath).toHaveBeenCalledWith("/manage", "layout");
		expect((await services.members.get(ed.id))?.role).toBe("viewer");
		expectSameFlash(
			await redirectOf(
				updateMemberAction(form({ id: ed.id, password: "newpassword1" })),
			),
			"/manage/members?notice=Member updated",
		);
		expectSameFlash(
			await redirectOf(deleteMemberAction(form({ id: ed.id }))),
			"/manage/members?notice=Member removed",
		);
		expect(
			flashMessage(
				await redirectOf(updateMemberAction(form({ id: "nope" }))),
				"error",
			),
		).toBe("That item was not found.");
		expectSameFlash(
			await redirectOf(deleteMemberAction(form({ id: actor.id }))),
			"/manage/members?error=You cannot remove the last admin",
		);
	});
});

describe("agent actions", () => {
	it("creates an agent, shows a token once, and removes them", async () => {
		const { app, services } = await setupApp();
		const { actor } = await signIn(app, "admin");
		const created = await redirectOf(
			createAgentAction(
				form({
					name: "Bot",
					description: "",
					permissions: ["status.read", "drafts.read", "drafts.write"],
				}),
			),
		);
		expect(created).toMatch(/\/manage\/agents\/agt_/);
		expect(flashMessage(created, "notice")).toBe("Agent created");
		const [agent] = await services.agents.list(actor);
		expect(agent?.permissions).toEqual([
			"status.read",
			"drafts.read",
			"drafts.write",
		]);
		expect(
			flashMessage(
				await redirectOf(createAgentAction(form({ name: "" }))),
				"error",
			),
		).toBe("Check the form and try again.");

		const state = await createAgentTokenAction(
			{},
			form({ agentId: agent?.id ?? "", expiresInDays: "30" }),
		);
		expect(state.token).toMatch(/^icmd_/);
		expect(state.name).toBe("Bot");
		expect(
			agent &&
				(await services.agents.get(actor, agent.id)).credentials[0]?.expiresAt,
		).toBeDefined();

		vi.spyOn(services.agents, "createToken").mockRejectedValueOnce(
			new Error("kaput"),
		);
		await expect(
			createAgentTokenAction({}, form({ agentId: agent?.id ?? "" })),
		).rejects.toThrow("kaput");

		const id = agent?.id ?? "";
		const current = agent ? await services.agents.get(actor, id) : undefined;
		expectSameFlash(
			await redirectOf(
				updateAgentAction(
					form({
						id,
						name: "Renamed",
						description: "",
						editPermissions: "true",
						permissions: ["status.read"],
						revision: String(current?.revision ?? ""),
					}),
				),
			),
			`/manage/agents/${id}?notice=Agent saved`,
		);
		const renamed = await services.agents.get(actor, id);
		expect(renamed).toMatchObject({
			name: "Renamed",
			permissions: ["status.read"],
		});
		expect(renamed.description).toBeUndefined();
		expectSameFlash(
			await redirectOf(
				updateAgentAction(
					form({
						id,
						name: "Renamed",
						description: "Bridge",
						revision: String(renamed.revision),
					}),
				),
			),
			`/manage/agents/${id}?notice=Agent saved`,
		);
		const described = await services.agents.get(actor, id);
		expect(described.description).toBe("Bridge");
		expect(described.permissions).toEqual(["status.read"]);
		expect(
			flashMessage(
				await redirectOf(updateAgentAction(form({ id, name: "Nope" }))),
				"error",
			),
		).toBe("Check the form and try again.");

		const credentialId = agent
			? (await services.agents.get(actor, agent.id)).credentials[0]?.id
			: "";
		expectSameFlash(
			await redirectOf(
				revokeAgentTokenAction(
					form({
						id: credentialId ?? "",
						next: `/manage/agents/${agent?.id ?? ""}`,
					}),
				),
			),
			`/manage/agents/${agent?.id}?notice=Token revoked`,
		);
		expectSameFlash(
			await redirectOf(deleteAgentAction(form({ id: agent?.id ?? "" }))),
			"/manage/agents?notice=Agent deleted",
		);
		expect(
			flashMessage(
				await redirectOf(deleteAgentAction(form({ id: agent?.id ?? "" }))),
				"error",
			),
		).toBe("That item was not found.");
		const offSite = await redirectOf(
			revokeAgentTokenAction(
				form({ id: "nope", next: "https://evil.example/manage/agents" }),
			),
		);
		expect(offSite.startsWith("/manage/agents?")).toBe(true);
		expect(offSite).not.toContain("evil.example");
		expect(flashMessage(offSite, "error")).toBe("That item was not found.");
	});
});

describe("connected agent actions", () => {
	it("sends the decision of the member to the agent", async () => {
		const { app } = await setupApp({ SITE_URL: "https://status.acme.dev" });
		const { actor } = await signIn(app, "editor");
		const { client_id } = await app.services.oauth.register({
			client_name: "Claude Code",
			redirect_uris: [AGENT_REDIRECT],
		});
		const fields = {
			...authorizationQuery(client_id),
			resource: "https://status.acme.dev/api/mcp",
		};
		const approved = new URL(
			await redirectOf(
				approveAgentAction(form({ ...fields, name: "On-call agent" })),
			),
		);
		expect(approved.origin + approved.pathname).toBe(AGENT_REDIRECT);
		expect(approved.searchParams.get("code")).toMatch(/^[\w-]{43}$/);
		expect(approved.searchParams.get("state")).toBe("state-1");
		expect(await app.store.find("oauth_codes")).toEqual([
			expect.objectContaining({ clientName: "On-call agent" }),
		]);
		const owned = await app.services.agents.createOwned({
			name: "Existing",
			ownerId: actor.id,
			createdBy: { type: "member", id: actor.id, name: actor.name },
		});
		const attached = new URL(
			await redirectOf(
				approveAgentAction(
					form({
						...fields,
						choice: "existing",
						agentId: owned.id,
					}),
				),
			),
		);
		expect(attached.searchParams.get("code")).toMatch(/^[\w-]{43}$/);
		expect(await app.store.find("oauth_codes")).toEqual(
			expect.arrayContaining([expect.objectContaining({ agentId: owned.id })]),
		);

		const denied = new URL(await redirectOf(denyAgentAction(form(fields))));
		expect(denied.searchParams.get("error")).toBe("access_denied");
		expect(denied.searchParams.has("code")).toBe(false);

		// A request that is not valid goes back to the consent page.
		const failed = await redirectOf(
			approveAgentAction(form({ ...fields, client_id: "ocl_unknown" })),
		);
		expect(failed.startsWith("/manage/authorize?")).toBe(true);
		expect(flashMessage(failed, "error")).toBe("Check the form and try again.");
	});

	it("disconnects an agent", async () => {
		const { app, services } = await setupApp();
		const { actor } = await signIn(app, "viewer");
		const tokens = await connectAgent(app, actor, "Claude Code");
		const [connection] = await services.oauth.list(actor);
		expectSameFlash(
			await redirectOf(
				disconnectAgentAction(form({ id: connection?.id ?? "" })),
			),
			"/manage/agents?notice=Agent disconnected",
		);
		await expect(
			services.oauth.authenticate(tokens.access_token),
		).resolves.toBeUndefined();
		const offSite = await redirectOf(
			disconnectAgentAction(
				form({ id: connection?.id ?? "", next: "//evil.example" }),
			),
		);
		expect(offSite.startsWith("/manage/agents?")).toBe(true);
		expect(offSite).not.toContain("evil.example");
		expect(flashMessage(offSite, "error")).toBe("That item was not found.");
	});
});

describe("subscriber and settings actions", () => {
	it("manages subscribers", async () => {
		const { app, services } = await setupApp();
		const { actor } = await signIn(app, "admin");
		expectSameFlash(
			await redirectOf(
				addSubscriberAction(
					form({ type: "webhook", target: "https://hooks.example.com/x" }),
				),
			),
			"/manage/subscribers?notice=Subscriber added",
		);
		expectSameFlash(
			await redirectOf(
				addSubscriberAction(form({ type: "email", target: "ops@acme.dev" })),
			),
			"/manage/subscribers?notice=Subscriber added",
		);
		expectSameFlash(
			await redirectOf(
				addSubscriberAction(form({ type: "sms", target: "+1 555 123 4567" })),
			),
			"/manage/subscribers?notice=Subscriber added",
		);
		const api = await services.catalog.create(actor, { name: "API" });
		expectSameFlash(
			await redirectOf(
				addSubscriberAction(
					form({
						type: "email",
						target: "api@acme.dev",
						serviceIds: [api.id],
					}),
				),
			),
			"/manage/subscribers?notice=Subscriber added",
		);
		const chosen = (await services.subscribers.list(actor)).find(
			(item) => item.target === "api@acme.dev",
		);
		expect(chosen?.serviceIds).toEqual([api.id]);
		expectSameFlash(
			await redirectOf(
				updateSubscriberServicesAction(
					form({ id: chosen?.id ?? "", serviceIds: [] }),
				),
			),
			"/manage/subscribers?notice=Services saved",
		);
		expect(
			(await services.subscribers.list(actor)).find(
				(item) => item.id === chosen?.id,
			)?.serviceIds,
		).toBeUndefined();
		expect(
			flashMessage(
				await redirectOf(
					updateSubscriberServicesAction(form({ id: "sub_missing" })),
				),
				"error",
			),
		).toBe("That item was not found.");
		expect(
			(await services.subscribers.list(actor)).map((item) => item.target),
		).toContain("+15551234567");
		expect(
			flashMessage(
				await redirectOf(
					addSubscriberAction(form({ type: "webhook", target: "nope" })),
				),
				"error",
			),
		).toBe("Check the form and try again.");
		const [first] = await services.subscribers.list(actor);
		expectSameFlash(
			await redirectOf(deleteSubscriberAction(form({ id: first?.id ?? "" }))),
			"/manage/subscribers?notice=Subscriber removed",
		);
		expect(
			flashMessage(
				await redirectOf(deleteSubscriberAction(form({ id: first?.id ?? "" }))),
				"error",
			),
		).toBe("That item was not found.");
	});

	it("saves the general settings without touching branding", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "admin");
		await services.settings.update(SYSTEM_ACTOR, { theme: "ocean" });
		vi.mocked(revalidatePath).mockClear();
		const url = await redirectOf(
			updateGeneralSettingsAction(
				form({
					siteName: "Acme Status",
					description: "Hello",
					siteUrl: "https://status.acme.dev",
					supportUrl: "https://acme.dev/help",
					uptimeDays: "30",
				}),
			),
		);
		expectSameFlash(url, "/manage/settings?notice=Settings saved");
		// The sidebar and the page title show the new name without a reload.
		expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
		expect(await services.settings.get()).toMatchObject({
			siteName: "Acme Status",
			siteUrl: "https://status.acme.dev",
			theme: "ocean",
			uptimeDays: 30,
			requireTwoFactor: false,
		});
		await redirectOf(
			updateGeneralSettingsAction(
				form({
					siteName: "Acme Status",
					uptimeDays: "30",
					requireTwoFactor: "on",
				}),
			),
		);
		expect((await services.settings.get()).requireTwoFactor).toBe(true);
		expectFlashRedirect(
			await redirectOf(
				updateGeneralSettingsAction(form({ siteName: "", uptimeDays: "1" })),
			),
			"/manage/settings",
			"error",
			"Check the form and try again.",
		);
	});

	it("saves branding without touching the general settings", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "admin");
		await services.settings.update(SYSTEM_ACTOR, { uptimeDays: 30 });
		vi.mocked(revalidatePath).mockClear();
		const url = await redirectOf(
			updateBrandingAction(form({ theme: "midnight", customCss: ":root{}" })),
		);
		expectSameFlash(url, "/manage/settings/branding?notice=Branding saved");
		// The new theme applies without a reload.
		expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
		// The form did not send the box, thus the admin cleared it.
		expect(await services.settings.get()).toMatchObject({
			theme: "midnight",
			customCss: ":root{}",
			showPoweredBy: false,
			uptimeDays: 30,
			requireTwoFactor: true,
		});
		await redirectOf(
			updateBrandingAction(form({ theme: "midnight", showPoweredBy: "on" })),
		);
		expect((await services.settings.get()).showPoweredBy).toBe(true);
		expectFlashRedirect(
			await redirectOf(updateBrandingAction(form({ theme: "Bad Theme" }))),
			"/manage/settings/branding",
			"error",
			"Check the form and try again.",
		);
	});

	it("saves an uploaded logo and favicon and can remove each file", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "admin");
		const asset = (kind: "logo" | "favicon") =>
			services.settings.getBrandAsset(kind);
		const uploaded = form({ theme: "midnight", customCss: "" });
		uploaded.set(
			"logo",
			new File([PNG_LOGO], "logo.png", { type: "image/png" }),
		);
		uploaded.set(
			"favicon",
			new File([ICO_FAVICON], "favicon.ico", { type: "image/x-icon" }),
		);
		expectSameFlash(
			await redirectOf(updateBrandingAction(uploaded)),
			"/manage/settings/branding?notice=Branding saved",
		);
		expect(await services.settings.get()).toMatchObject({
			theme: "midnight",
			logoUpdatedAt: "2026-11-02T12:00:00.000Z",
			faviconUpdatedAt: "2026-11-02T12:00:00.000Z",
		});
		expect((await asset("logo"))?.contentType).toBe("image/png");
		expect((await asset("favicon"))?.contentType).toBe("image/x-icon");

		// A browser sends an empty file when the admin selects no file.
		const empty = form({ theme: "ocean", customCss: "" });
		empty.set("logo", new File([], "", { type: "application/octet-stream" }));
		empty.set(
			"favicon",
			new File([], "", { type: "application/octet-stream" }),
		);
		await redirectOf(updateBrandingAction(empty));
		expect((await services.settings.get()).theme).toBe("ocean");
		expect((await asset("logo"))?.contentType).toBe("image/png");
		expect((await asset("favicon"))?.contentType).toBe("image/x-icon");

		// A new file wins when the form also asks to remove the stored file.
		const replaced = form({
			theme: "ocean",
			customCss: "",
			removeLogo: "on",
			removeFavicon: "on",
		});
		replaced.set(
			"logo",
			new File([JPEG_LOGO], "logo.jpg", { type: "image/jpeg" }),
		);
		await redirectOf(updateBrandingAction(replaced));
		expect((await asset("logo"))?.contentType).toBe("image/jpeg");
		await expect(asset("favicon")).resolves.toBeUndefined();
		expect((await services.settings.get()).faviconUpdatedAt).toBeUndefined();

		await redirectOf(
			updateBrandingAction(
				form({ theme: "default", customCss: "", removeLogo: "on" }),
			),
		);
		await expect(asset("logo")).resolves.toBeUndefined();
		expect((await services.settings.get()).logoUpdatedAt).toBeUndefined();
	});

	it("does not change the logo when branding is invalid", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "admin");
		const fields = { theme: "Bad Theme", customCss: "" };
		const uploaded = form(fields);
		uploaded.set(
			"logo",
			new File([PNG_LOGO], "logo.png", { type: "image/png" }),
		);
		expectFlashRedirect(
			await redirectOf(updateBrandingAction(uploaded)),
			"/manage/settings/branding",
			"error",
			"Check the form and try again.",
		);
		await expect(
			services.settings.getBrandAsset("logo"),
		).resolves.toBeUndefined();
		expect((await services.settings.get()).theme).toBe("default");

		await services.settings.updateBranding(
			SYSTEM_ACTOR,
			{},
			{ logo: { bytes: PNG_LOGO } },
		);
		expectFlashRedirect(
			await redirectOf(
				updateBrandingAction(form({ ...fields, removeLogo: "on" })),
			),
			"/manage/settings/branding",
			"error",
			"Check the form and try again.",
		);
		expect((await services.settings.getBrandAsset("logo"))?.contentType).toBe(
			"image/png",
		);
		expect((await services.settings.get()).logoUpdatedAt).toBe(
			"2026-11-02T12:00:00.000Z",
		);
		expect((await services.settings.get()).theme).toBe("default");
	});

	it("rejects a file that is not an image and names the file", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "admin");
		for (const kind of ["logo", "favicon"] as const) {
			const data = form({ theme: "default", customCss: "" });
			data.set(
				kind,
				new File([Uint8Array.from([1, 2, 3, 4])], "image.png", {
					type: "image/png",
				}),
			);
			expectFlashRedirect(
				await redirectOf(updateBrandingAction(data)),
				"/manage/settings/branding",
				"error",
				BRAND_ASSET_MESSAGES[kind].type,
			);
			await expect(
				services.settings.getBrandAsset(kind),
			).resolves.toBeUndefined();
		}
	});
});

describe("notification settings actions", () => {
	const PATH = "/manage/settings/notifications";

	it("saves a channel", async () => {
		const { app, services } = await setupApp();
		const { actor } = await signIn(app, "admin");
		expectSameFlash(
			await redirectOf(
				updateNotificationChannelAction(
					form({
						channel: "email",
						strategy: "load_balanced",
						from: "Acme <status@acme.dev>",
					}),
				),
			),
			`${PATH}?notice=Channel saved`,
		);
		expect((await services.notificationSettings.list(actor))[1]).toMatchObject({
			enabled: false,
			strategy: "load_balanced",
			from: "Acme <status@acme.dev>",
		});
		await redirectOf(
			updateNotificationChannelAction(
				form({ channel: "webhook", enabled: "on", allowPrivateNetworks: "on" }),
			),
		);
		expect((await services.notificationSettings.list(actor))[0]).toMatchObject({
			enabled: true,
			allowPrivateNetworks: true,
		});
		// The webhook form has no strategy field and no sender field. A form
		// without the boxes turns the channel and private network addresses off.
		expectSameFlash(
			await redirectOf(
				updateNotificationChannelAction(form({ channel: "webhook" })),
			),
			`${PATH}?notice=Channel saved`,
		);
		expect((await services.notificationSettings.list(actor))[0]).toMatchObject({
			enabled: false,
			allowPrivateNetworks: false,
		});
		expectFlashRedirect(
			await redirectOf(
				updateNotificationChannelAction(
					form({ channel: "email", strategy: "active_passive", from: "nope" }),
				),
			),
			PATH,
			"error",
			"Check the form and try again.",
		);
	});

	it("refuses a channel form that shows an old revision", async () => {
		const { app, services } = await setupApp();
		const { actor } = await signIn(app, "admin");
		await services.notificationSettings.updateChannel(actor, "email", {
			enabled: false,
		});
		expectFlashRedirect(
			await redirectOf(
				updateNotificationChannelAction(
					form({
						channel: "email",
						revision: "0",
						enabled: "on",
						strategy: "active_passive",
					}),
				),
			),
			PATH,
			"error",
			"Somebody else changed these notification settings. Reload the page.",
		);
		expect((await services.notificationSettings.list(actor))[1]?.enabled).toBe(
			false,
		);
	});

	it("needs an encryption key to add a provider with credentials", async () => {
		const { app } = await setupApp();
		await signIn(app, "admin");
		expectFlashRedirect(
			await redirectOf(
				addNotificationProviderAction(
					form({
						channel: "email",
						type: "sendgrid",
						name: "SendGrid",
						field_apiKey: "SG.key",
					}),
				),
			),
			PATH,
			"error",
			"Set ENCRYPTION_KEY on the server before you save provider credentials.",
		);
	});

	it("adds, edits, orders and removes providers", async () => {
		const { app, services } = await setupApp({
			ENCRYPTION_KEY: "k".repeat(32),
		});
		const { actor } = await signIn(app, "admin");
		const providers = async () =>
			(await services.notificationSettings.list(actor))[2]?.providers ?? [];
		for (const name of ["Twilio", "SNS"]) {
			expectSameFlash(
				await redirectOf(
					addNotificationProviderAction(
						form(
							name === "Twilio"
								? {
										channel: "sms",
										type: "twilio",
										name,
										from: "+15550001111",
										field_accountSid: `AC${"1".repeat(32)}`,
										field_authToken: "tok",
									}
								: {
										channel: "sms",
										type: "sns",
										name,
										from: "",
										field_region: "us-east-1",
										field_accessKeyId: "",
										field_secretAccessKey: "",
									},
						),
					),
				),
				`${PATH}?notice=Provider added`,
			);
		}
		const [twilio, sns] = await providers();
		expect(twilio).toMatchObject({
			name: "Twilio",
			from: "+15550001111",
			options: { accountSid: `AC${"1".repeat(32)}` },
			savedSecrets: ["authToken"],
		});
		expect(sns).toMatchObject({ options: { region: "us-east-1" } });
		expect(sns?.from).toBeUndefined();

		expectSameFlash(
			await redirectOf(
				updateNotificationProviderAction(
					form({
						channel: "sms",
						id: twilio?.id ?? "",
						name: "Twilio primary",
						from: "",
						field_accountSid: `AC${"1".repeat(32)}`,
						field_authToken: "",
					}),
				),
			),
			`${PATH}?notice=Provider saved`,
		);
		expect((await providers())[0]).toMatchObject({
			name: "Twilio primary",
			savedSecrets: ["authToken"],
		});
		expect((await providers())[0]?.from).toBeUndefined();

		expectSameFlash(
			await redirectOf(
				moveNotificationProviderAction(
					form({ channel: "sms", id: sns?.id ?? "", direction: "up" }),
				),
			),
			`${PATH}?notice=Provider order saved`,
		);
		expect((await providers()).map((item) => item.name)).toEqual([
			"SNS",
			"Twilio primary",
		]);

		expectSameFlash(
			await redirectOf(
				removeNotificationProviderAction(
					form({ channel: "sms", id: sns?.id ?? "" }),
				),
			),
			`${PATH}?notice=Provider removed`,
		);
		expect((await providers()).map((item) => item.name)).toEqual([
			"Twilio primary",
		]);

		for (const action of [
			() =>
				updateNotificationProviderAction(
					form({ channel: "sms", id: "prv_missing", name: "x" }),
				),
			() =>
				moveNotificationProviderAction(
					form({ channel: "sms", id: "prv_missing", direction: "up" }),
				),
			() =>
				removeNotificationProviderAction(
					form({ channel: "sms", id: "prv_missing" }),
				),
		]) {
			expectFlashRedirect(
				await redirectOf(action()),
				PATH,
				"error",
				"That item was not found.",
			);
		}
	});

	it("requires the admin role", async () => {
		const { app } = await setupApp();
		await signIn(app, "editor");
		expectFlashRedirect(
			await redirectOf(
				updateNotificationChannelAction(form({ channel: "email" })),
			),
			"/manage",
			"error",
			"That page requires the admin role",
		);
	});
});

describe("public subscribe actions", () => {
	it("subscribes and unsubscribes", async () => {
		const { notifier } = await setupApp();
		expect(
			await redirectOf(
				subscribeAction(form({ type: "email", target: "jane@example.com" })),
			),
		).toBe("/subscribe?channel=email&status=confirmation_sent");
		// An error opens the same channel again.
		const badEmail = await redirectOf(
			subscribeAction(form({ type: "webhook", target: "bad" })),
		);
		const badUrl = new URL(badEmail, "http://localhost");
		expect(badUrl.pathname).toBe("/subscribe");
		expect(badUrl.searchParams.get("channel")).toBe("webhook");
		expect(flashMessage(badEmail, "error")).toBe(
			"Check the form and try again.",
		);
		const empty = await redirectOf(subscribeAction(new FormData()));
		expect(new URL(empty, "http://localhost").pathname).toBe("/subscribe");
		expect(flashMessage(empty, "error")).toBeTruthy();
		notifier.confirmationResult = false;
		const notSent = await redirectOf(
			subscribeAction(form({ type: "email", target: "sam@example.com" })),
		);
		expect(flashMessage(notSent, "error")).toBe(
			"We couldn't send the confirmation. Please try again later.",
		);
		const token = notifier.confirmations[0]?.subscriber.token ?? "";
		expect(await redirectOf(unsubscribeAction(form({ token })))).toBe(
			"/subscribe/unsubscribe?done=1",
		);
		expect(await redirectOf(unsubscribeAction(new FormData()))).toBe(
			"/subscribe/unsubscribe?done=1",
		);
	});

	it("saves the services a subscriber chooses", async () => {
		const { services, notifier } = await setupApp();
		const api = await services.catalog.create(SYSTEM_ACTOR, { name: "API" });
		await services.subscribers.subscribe({
			type: "email",
			target: "jane@example.com",
			serviceIds: [api.id],
		});
		const token = notifier.confirmations[0]?.subscriber.token ?? "";
		expect(
			await redirectOf(
				subscribeAction(
					form({
						type: "email",
						target: "sam@example.com",
						serviceIds: [api.id],
					}),
				),
			),
		).toBe("/subscribe?channel=email&status=confirmation_sent");
		expect(notifier.confirmations.at(-1)?.subscriber.serviceIds).toEqual([
			api.id,
		]);
		expect(
			flashMessage(
				await redirectOf(updateServicesAction(form({ token, serviceIds: [] }))),
				"notice",
			),
		).toBe("Services saved");
		expect(
			(await services.subscribers.list(SYSTEM_ACTOR)).find(
				(subscriber) => subscriber.target === "jane@example.com",
			)?.serviceIds,
		).toBeUndefined();
		expect(
			flashMessage(
				await redirectOf(
					updateServicesAction(form({ token, serviceIds: [api.id] })),
				),
				"notice",
			),
		).toBe("Services saved");
		expect(await redirectOf(updateServicesAction(new FormData()))).toBe(
			"/subscribe/services",
		);
		expect(
			await redirectOf(updateServicesAction(form({ token: "nope" }))),
		).toBe("/subscribe/services");
		expect(
			flashMessage(
				await redirectOf(
					updateServicesAction(form({ token, serviceIds: ["svc_missing"] })),
				),
				"error",
			),
		).toBe("Check the form and try again.");
		vi.spyOn(services.subscribers, "updateOwnServices").mockRejectedValueOnce(
			new Error("db down"),
		);
		await expect(
			updateServicesAction(form({ token, serviceIds: [api.id] })),
		).rejects.toThrow("db down");
	});

	it("unsubscribes an address that the visitor enters", async () => {
		const { services } = await setupApp();
		await services.subscribers.addWebhook(SYSTEM_ACTOR, {
			url: "https://hooks.example.com/a",
		});
		expect(
			await redirectOf(
				unsubscribeAddressAction(
					form({ type: "webhook", target: "https://hooks.example.com/a" }),
				),
			),
		).toBe("/subscribe/unsubscribe?done=1");
		expect(await services.subscribers.list(SYSTEM_ACTOR)).toEqual([]);
		// An error opens the same channel again.
		const bad = await redirectOf(
			unsubscribeAddressAction(form({ type: "sms", target: "555" })),
		);
		const badUrl = new URL(bad, "http://localhost");
		expect(badUrl.pathname).toBe("/subscribe/unsubscribe");
		expect(badUrl.searchParams.get("channel")).toBe("sms");
		expect(flashMessage(bad, "error")).toBe("Check the form and try again.");
		const empty = await redirectOf(unsubscribeAddressAction(new FormData()));
		expect(new URL(empty, "http://localhost").search).toMatch(/^\?error=/);
		vi.spyOn(services.subscribers, "unsubscribeAddress").mockRejectedValueOnce(
			new Error("db down"),
		);
		await expect(
			unsubscribeAddressAction(form({ type: "email", target: "a@b.co" })),
		).rejects.toThrow("db down");
	});

	it("rethrows unexpected subscribe errors", async () => {
		const { services } = await setupApp();
		vi.spyOn(services.subscribers, "subscribe").mockRejectedValueOnce(
			new Error("db down"),
		);
		await expect(
			subscribeAction(form({ type: "email", target: "a@b.co" })),
		).rejects.toThrow("db down");
	});
});

describe("region actions", () => {
	it("creates a region and selects it on an incident", async () => {
		const { app, services } = await setupApp();
		await signIn(app, "editor");
		expectSameFlash(
			await redirectOf(createRegionAction(form({ name: "United States" }))),
			"/manage/regions?notice=Region created",
		);
		const [region] = await services.regions.list();
		expectSameFlash(
			await redirectOf(
				updateRegionAction(
					form({ id: region?.id ?? "", name: "US East", order: "2" }),
				),
			),
			"/manage/regions?notice=Region saved",
		);
		const created = await redirectOf(
			createIncidentAction(
				form({
					title: "API down",
					message: "Investigating",
					regionId: region?.id ?? "",
				}),
			),
		);
		const [incident] = await services.incidents.list();
		expect(incident?.regionId).toBe(region?.id);
		expectSameFlash(
			created,
			`/manage/incidents/${incident?.id}?notice=Incident declared`,
		);
		expectSameFlash(
			await redirectOf(
				editIncidentAction(
					form({ id: incident?.id ?? "", title: "API outage" }),
				),
			),
			`/manage/incidents/${incident?.id}?notice=Incident saved`,
		);
		expect((await services.incidents.get(incident?.id ?? "")).regionId).toBe(
			region?.id,
		);
		expectSameFlash(
			await redirectOf(
				editIncidentAction(
					form({ id: incident?.id ?? "", title: "API outage", regionId: "" }),
				),
			),
			`/manage/incidents/${incident?.id}?notice=Incident saved`,
		);
		expect(
			(await services.incidents.get(incident?.id ?? "")).regionId,
		).toBeUndefined();
		const draft = await services.drafts.create(agentActor(), {
			title: "Next",
			message: "x",
		});
		expectSameFlash(
			await redirectOf(
				saveDraftAction(
					form({
						id: draft.id,
						title: "Next",
						message: "Edited",
						regionId: region?.id ?? "",
					}),
				),
			),
			`/manage/drafts/${draft.id}?notice=Draft saved`,
		);
		expect((await services.drafts.get(draft.id)).content.regionId).toBe(
			region?.id,
		);
		expectSameFlash(
			await redirectOf(deleteRegionAction(form({ id: region?.id ?? "" }))),
			"/manage/regions?notice=Region deleted",
		);
		expect(await services.regions.list()).toEqual([]);
	});

	it("rejects the reserved region name", async () => {
		const { app } = await setupApp();
		await signIn(app, "editor");
		expectSameFlash(
			await redirectOf(createRegionAction(form({ name: "Global" }))),
			"/manage/regions?error=Global is the default region. Choose another name.",
		);
	});
});
