import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type Permission, permissionsForRole } from "@/lib/domain/permissions";
import type { Role } from "@/lib/domain/types";
import { bearerToken, handleMcpRequest } from "@/lib/mcp/handler";
import {
	ICO_FAVICON,
	PNG_LOGO,
	SVG_LOGO,
	SVG_SCRIPT,
} from "../brand-asset-bytes";
import { ADMIN, createTestContext, type TestContext } from "../helpers";

type ToolResult = {
	isError?: boolean;
	content: { type: string; text: string }[];
};

async function connect(t: TestContext, token: string) {
	const client = new Client({ name: "test-agent", version: "1.0.0" });
	const transport = new StreamableHTTPClientTransport(
		new URL("http://localhost/api/mcp"),
		{
			fetch: (url, init) =>
				handleMcpRequest(new Request(url, init), t.services),
			requestInit: { headers: { authorization: `Bearer ${token}` } },
		},
	);
	await client.connect(transport);
	const call = async (name: string, args: Record<string, unknown> = {}) => {
		const result = (await client.callTool({
			name,
			arguments: args,
		})) as ToolResult;
		const text = result.content[0]?.text ?? "";
		return {
			isError: result.isError ?? false,
			text,
			data: result.isError ? undefined : JSON.parse(text),
		};
	};
	return { client, call };
}

async function tokenFor(
	t: TestContext,
	permissions: readonly Permission[],
	name: string,
) {
	const agent = await t.services.agents.create(ADMIN, {
		name,
		permissions: [...permissions],
	});
	return (await t.services.agents.createToken(ADMIN, agent.id, {})).token;
}

describe("MCP handler", () => {
	let t: TestContext;
	beforeEach(() => {
		t = createTestContext();
	});

	it("parses bearer tokens", () => {
		expect(bearerToken("Bearer abc")).toBe("abc");
		expect(bearerToken("bearer   abc ")).toBe("abc");
		expect(bearerToken("Basic abc")).toBeUndefined();
		expect(bearerToken(null)).toBeUndefined();
	});

	it("continues when a denied-tool check cannot read a call", async () => {
		const token = await tokenFor(t, ["status.read"], "Reader");
		const send = (body: string) =>
			handleMcpRequest(
				new Request("http://localhost/api/mcp", {
					method: "POST",
					headers: {
						authorization: `Bearer ${token}`,
						"content-type": "application/json",
					},
					body,
				}),
				t.services,
			);
		for (const body of ["not-json", "null", "1"]) {
			const response = await send(body);
			expect(response).toBeInstanceOf(Response);
		}
	});

	it("rejects non-POST requests", async () => {
		const response = await handleMcpRequest(
			new Request("http://localhost/api/mcp"),
			t.services,
		);
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
	});

	it("rejects missing and invalid tokens", async () => {
		const body = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
		});
		const anonymous = await handleMcpRequest(
			new Request("http://localhost/api/mcp", { method: "POST", body }),
			t.services,
		);
		expect(anonymous.status).toBe(401);
		expect(anonymous.headers.get("www-authenticate")).toContain("Bearer");
		expect(await anonymous.json()).toMatchObject({
			error: { message: "Missing or invalid agent token" },
		});
		const bad = await handleMcpRequest(
			new Request("http://localhost/api/mcp", {
				method: "POST",
				body,
				headers: { authorization: "Bearer icmd_nope" },
			}),
			t.services,
		);
		expect(bad.status).toBe(401);
	});

	it("only exposes tools allowed for the agent's permissions", async () => {
		const names = async (role: Role) => {
			const { client } = await connect(
				t,
				await tokenFor(t, permissionsForRole(role), `${role} bot`),
			);
			const { tools } = await client.listTools();
			await client.close();
			return tools.map((tool) => tool.name);
		};
		const viewer = await names("viewer");
		expect(viewer).toEqual([
			"whoami",
			"get_status",
			"list_services",
			"list_incidents",
			"get_incident",
			"get_notification_draft",
		]);
		const editor = await names("editor");
		expect(editor).toContain("create_incident");
		expect(editor).toContain("draft_notification");
		expect(editor).not.toContain("create_agent_token");
		const admin = await names("admin");
		expect(admin).toContain("create_agent_token");
		expect(admin).toContain("get_notification_settings");
		expect(admin).toContain("update_notification_channel");
		expect(admin).toHaveLength(40);
		expect(admin).toEqual(
			expect.arrayContaining([
				"create_agent",
				"update_agent",
				"delete_agent",
				"list_agent_activity",
			]),
		);
	});

	it("lets an editor agent run an incident end to end", async () => {
		const { client, call } = await connect(
			t,
			await tokenFor(t, permissionsForRole("editor"), "editor bot"),
		);
		expect(client.getInstructions()).toContain("incident command");
		expect((await call("whoami")).data).toMatchObject({
			type: "agent",
			permissions: permissionsForRole("editor"),
			credential: "token",
		});

		const api = (await call("create_service", { name: "API", group: "Core" }))
			.data;
		const web = (await call("create_service", { name: "Web" })).data;
		expect(
			(
				await call("update_service", {
					id: web.id,
					description: "Marketing site",
					order: 5,
				})
			).data,
		).toMatchObject({
			description: "Marketing site",
			order: 5,
		});
		expect(
			(
				await call("set_service_status", {
					id: web.id,
					status: "degraded_performance",
				})
			).data.status,
		).toBe("degraded_performance");
		expect((await call("list_services")).data).toHaveLength(2);

		const incident = (
			await call("create_incident", {
				title: "API errors",
				message: "Investigating",
				impact: "critical",
				serviceIds: [api.id, web.id],
				serviceStatuses: [{ serviceId: web.id, status: "partial_outage" }],
			})
		).data;
		expect(incident).toMatchObject({
			kind: "incident",
			status: "investigating",
			createdBy: { type: "agent", name: "editor bot" },
		});

		const status = (await call("get_status")).data;
		expect(status).toMatchObject({
			overall: "major_outage",
			uptimeWindowDays: 90,
		});
		expect(status.services[0]).toMatchObject({
			name: "API",
			status: "major_outage",
			uptime: "No data",
		});
		expect(status.services[1]).toMatchObject({
			name: "Web",
			status: "partial_outage",
		});
		expect(status.activeIncidents[0]).toMatchObject({
			id: incident.id,
			latestUpdate: "Investigating",
		});

		await call("post_incident_update", {
			id: incident.id,
			status: "identified",
			message: "Bad deploy",
			serviceStatuses: [{ serviceId: api.id, status: "degraded_performance" }],
		});
		expect((await t.services.catalog.get(api.id)).status).toBe(
			"degraded_performance",
		);
		expect((await t.services.catalog.get(web.id)).status).toBe(
			"partial_outage",
		);
		await call("edit_incident", {
			id: incident.id,
			title: "API errors after deploy",
		});
		const resolved = (
			await call("resolve_incident", {
				id: incident.id,
				message: "Rolled back",
			})
		).data;
		expect(resolved).toMatchObject({
			status: "resolved",
			title: "API errors after deploy",
		});
		expect(resolved.updates).toHaveLength(3);
		expect(
			(await call("get_incident", { id: incident.id })).data.updates,
		).toHaveLength(3);

		const maintenance = (
			await call("schedule_maintenance", {
				title: "DB upgrade",
				message: "Upgrading",
				scheduledStart: "2026-11-03T02:00:00Z",
				scheduledEnd: "2026-11-03T03:00:00Z",
				serviceIds: [api.id],
			})
		).data;
		expect(maintenance).toMatchObject({
			kind: "maintenance",
			status: "scheduled",
		});

		const listed = (await call("list_incidents", { open: false })).data;
		expect(listed.map((i: { id: string }) => i.id)).toEqual([incident.id]);
		expect(
			(await call("list_incidents", { kind: "maintenance" })).data,
		).toHaveLength(1);
		expect((await call("list_incidents")).data).toHaveLength(2);

		expect(
			(await call("delete_incident", { id: maintenance.id })).data,
		).toEqual({ deleted: maintenance.id });
		expect((await call("delete_service", { id: web.id })).data).toEqual({
			deleted: web.id,
		});
		await client.close();
	});

	it("lets an agent draft a notification that a person reviews", async () => {
		const { call } = await connect(
			t,
			await tokenFor(t, permissionsForRole("editor"), "editor bot"),
		);
		const api = await t.services.catalog.create(ADMIN, { name: "API" });
		const drafted = (
			await call("draft_notification", {
				title: "API errors",
				message: "We are looking into errors.",
				impact: "major",
				serviceIds: [api.id],
			})
		).data;
		expect(drafted.reviewUrl).toBe(
			`http://localhost/manage/drafts/${drafted.draft.id}`,
		);
		expect(drafted.draft).toMatchObject({
			action: "create",
			state: "pending",
			createdBy: { type: "agent", name: "editor bot" },
		});
		expect((await call("list_incidents")).data).toEqual([]);

		const rejected = await call("draft_notification", {
			incidentId: "inc_missing",
			message: "x",
		});
		expect(rejected).toMatchObject({
			isError: true,
			text: 'not_found: Incident "inc_missing" was not found',
		});

		const { incident } = await t.services.drafts.approve(
			ADMIN,
			drafted.draft.id,
			drafted.draft.content,
		);
		const viewer = await connect(
			t,
			await tokenFor(t, permissionsForRole("viewer"), "viewer bot"),
		);
		const checked = (
			await viewer.call("get_notification_draft", { id: drafted.draft.id })
		).data;
		expect(checked).toMatchObject({
			reviewUrl: drafted.reviewUrl,
			draft: { state: "approved", incidentId: incident.id },
		});

		const update = (
			await call("draft_notification", {
				incidentId: incident.id,
				message: "A fix is ready.",
				status: "monitoring",
				serviceStatuses: [
					{ serviceId: api.id, status: "degraded_performance" },
				],
			})
		).data;
		expect(update.draft).toMatchObject({
			action: "update",
			kind: "incident",
			incidentId: incident.id,
			content: {
				serviceStatuses: [
					{ serviceId: api.id, status: "degraded_performance" },
				],
			},
		});
	});

	it("returns tool errors for expected failures", async () => {
		const { call } = await connect(
			t,
			await tokenFor(t, permissionsForRole("editor"), "editor bot"),
		);
		const missing = await call("get_incident", { id: "inc_missing" });
		expect(missing).toMatchObject({
			isError: true,
			text: 'not_found: Incident "inc_missing" was not found',
		});
		const invalid = await call("create_incident", { title: "", message: "x" });
		expect(invalid.isError).toBe(true);
		expect(invalid.text).toMatch(/^bad_request: title/);
	});

	it("hides internal errors", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(t.services.status, "summary").mockRejectedValueOnce(
			new Error("secret db details"),
		);
		const { call } = await connect(
			t,
			await tokenFor(t, permissionsForRole("viewer"), "viewer bot"),
		);
		const result = await call("get_status");
		expect(result).toMatchObject({
			isError: true,
			text: "internal_error: Something went wrong",
		});
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it("lets an admin agent manage members, agents, settings and subscribers", async () => {
		const { call } = await connect(
			t,
			await tokenFor(t, permissionsForRole("admin"), "admin bot"),
		);
		const invited = (await call("invite_member", { email: "new@acme.dev" }))
			.data;
		expect(invited.invite).toMatchObject({
			email: "new@acme.dev",
			role: "editor",
			invitedBy: { type: "agent", name: "admin bot" },
		});
		expect(invited.inviteUrl).toMatch(
			/^http:\/\/localhost\/manage\/invite\?token=/,
		);
		expect((await call("list_invites")).data).toEqual([invited.invite]);
		const member = await t.services.members.acceptInvite(
			new URL(invited.inviteUrl).searchParams.get("token") as string,
			{ name: "New", password: "password123" },
		);
		expect(member).toMatchObject({ email: "new@acme.dev", role: "editor" });
		const spare = (await call("invite_member", { email: "spare@acme.dev" }))
			.data;
		expect((await call("revoke_invite", { id: spare.invite.id })).data).toEqual(
			{ revoked: spare.invite.id },
		);
		expect((await call("list_invites")).data).toEqual([]);
		expect(
			(await call("update_member", { id: member.id, role: "viewer" })).data
				.role,
		).toBe("viewer");
		expect((await call("list_members")).data).toHaveLength(1);
		expect((await call("remove_member", { id: member.id })).data).toEqual({
			deleted: member.id,
		});

		const helper = (await call("create_agent", { name: "Helper" })).data;
		const created = (await call("create_agent_token", { agentId: helper.id }))
			.data;
		expect(created.token).toMatch(/^icmd_/);
		expect((await call("list_agents")).data).toHaveLength(2);
		const renamed = (
			await call("update_agent", {
				id: helper.id,
				name: "Helper 2",
				description: "",
				revision: helper.revision,
			})
		).data;
		expect(renamed.name).toBe("Helper 2");
		expect(
			(await call("list_agent_activity", { agentId: helper.id })).data.length,
		).toBeGreaterThan(0);
		expect(
			(await call("list_agent_activity", { agentId: helper.id, limit: 1 }))
				.data,
		).toHaveLength(1);
		expect(
			(await call("revoke_agent_token", { id: created.credentialId })).data
				.revokedAt,
		).toBeDefined();
		expect((await call("delete_agent", { id: helper.id })).data).toEqual({
			deleted: helper.id,
		});

		expect(
			(
				await call("update_settings", {
					siteName: "Acme Status",
					brandColor: "#123456",
				})
			).data,
		).toMatchObject({
			siteName: "Acme Status",
			brandColor: "#123456",
		});
		expect((await call("get_settings")).data.siteName).toBe("Acme Status");
		await call("update_settings", { siteUrl: "https://status.acme.dev" });
		expect(
			(await call("invite_member", { email: "later@acme.dev" })).data.inviteUrl,
		).toMatch(/^https:\/\/status\.acme\.dev\/manage\/invite\?token=/);

		const hook = (
			await call("add_subscriber", {
				type: "webhook",
				target: "https://hooks.example.com/a",
			})
		).data;
		const email = (
			await call("add_subscriber", { type: "email", target: "ops@acme.dev" })
		).data;
		const phone = (
			await call("add_subscriber", { type: "sms", target: "+15551234567" })
		).data;
		expect([hook.type, email.type, phone.type]).toEqual([
			"webhook",
			"email",
			"sms",
		]);
		expect((await call("list_subscribers")).data).toHaveLength(3);

		const channel = (
			await call("update_notification_channel", {
				channel: "sms",
				strategy: "load_balanced",
				from: "ACME",
			})
		).data;
		expect(channel).toMatchObject({
			id: "sms",
			strategy: "load_balanced",
			from: "ACME",
		});
		const channels = (await call("get_notification_settings")).data;
		expect(channels.map((item: { id: string }) => item.id)).toEqual([
			"webhook",
			"email",
			"sms",
		]);
		expect((await call("remove_subscriber", { id: hook.id })).data).toEqual({
			deleted: hook.id,
		});
	});

	it("lets an agent upload and remove the logo and the favicon", async () => {
		const { client, call } = await connect(
			t,
			await tokenFor(t, ["settings.read", "settings.write"], "design bot"),
		);
		expect(client.getInstructions()).toContain("get_design_guide");
		const stored = (kind: "logo" | "favicon") =>
			t.services.settings.getBrandAsset(kind, { consistent: true });
		const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
		const svg = new TextDecoder().decode(SVG_LOGO);

		// The source text of an SVG image.
		const withLogo = (
			await call("upload_brand_asset", { kind: "logo", data: `\n${svg}\n` })
		).data;
		expect(withLogo.logoUrl).toBe(
			`http://localhost/brand/logo?v=${encodeURIComponent(withLogo.logoUpdatedAt)}`,
		);
		expect(withLogo.faviconUrl).toBeUndefined();
		expect(await stored("logo")).toMatchObject({
			contentType: "image/svg+xml",
			data: base64(SVG_LOGO),
		});

		// A base64 data URL with a line break, then base64 text.
		const png = base64(PNG_LOGO);
		await call("upload_brand_asset", {
			kind: "favicon",
			data: `data:image/png;base64,${png.slice(0, 20)}\n${png.slice(20)}`,
		});
		expect(await stored("favicon")).toMatchObject({
			contentType: "image/png",
			data: png,
		});
		await call("upload_brand_asset", {
			kind: "favicon",
			data: base64(ICO_FAVICON),
		});
		expect(await stored("favicon")).toMatchObject({
			contentType: "image/x-icon",
			data: base64(ICO_FAVICON),
		});
		const settings = (await call("get_settings")).data;
		expect(settings.logoUrl).toBe(withLogo.logoUrl);
		expect(settings.faviconUrl).toBe(
			`http://localhost/brand/favicon?v=${encodeURIComponent(settings.faviconUpdatedAt)}`,
		);

		for (const [data, message] of [
			[
				"not base64!",
				"bad_request: Send the file as base64 text or as the source of an SVG image.",
			],
			[
				new TextDecoder().decode(SVG_SCRIPT),
				"bad_request: This SVG logo is not allowed.",
			],
			[
				base64(ICO_FAVICON),
				"bad_request: Use a PNG, JPEG, WebP, GIF or SVG logo.",
			],
		]) {
			const failed = await call("upload_brand_asset", { kind: "logo", data });
			expect(failed.isError).toBe(true);
			expect(failed.text).toBe(message);
		}
		expect(await stored("logo")).toMatchObject({ data: base64(SVG_LOGO) });

		const removed = (await call("remove_brand_asset", { kind: "logo" })).data;
		expect(removed.logoUrl).toBeUndefined();
		expect(removed.logoUpdatedAt).toBeUndefined();
		expect(removed.faviconUrl).toBe(settings.faviconUrl);
		expect(await stored("logo")).toBeUndefined();

		// The log names the file that changed. It does not hold the file.
		const log = await t.store.find("agent_activity");
		for (const tool of ["upload_brand_asset", "remove_brand_asset"]) {
			expect(log).toContainEqual(
				expect.objectContaining({
					tool,
					outcome: "ok",
					target: { type: "brand_asset", id: "logo" },
				}),
			);
		}
		expect(JSON.stringify(log)).not.toContain(png);
	});

	it("gives the limits of the service in the design guide", async () => {
		const { call } = await connect(
			t,
			await tokenFor(t, ["settings.read", "settings.write"], "design bot"),
		);
		const guide = (await call("get_design_guide")).data;
		expect(guide.themes.map((theme: { id: string }) => theme.id)).toContain(
			"carbon",
		);
		expect(guide.tokens).toContainEqual(
			expect.objectContaining({ name: "--ic-brand" }),
		);
		expect(guide.selectors).toContainEqual(
			expect.objectContaining({ selector: ".ic-banner" }),
		);

		// The service accepts a value at each limit and rejects a larger value.
		const { customCssMaxLength, assetMaxBytes } = guide.limits;
		const css = (length: number) =>
			call("update_settings", { customCss: "a".repeat(length) });
		expect((await css(customCssMaxLength)).isError).toBe(false);
		expect((await css(customCssMaxLength + 1)).isError).toBe(true);
		const svg = (length: number) =>
			call("upload_brand_asset", {
				kind: "logo",
				data: "<svg></svg>".padEnd(length, " ").replace(/ $/, "x"),
			});
		expect((await svg(assetMaxBytes)).isError).toBe(false);
		expect((await svg(assetMaxBytes + 1)).text).toBe(
			"bad_request: The logo must be 512 KB or smaller.",
		);
	});

	it("denies a tool the agent cannot call and keeps secrets out of the log", async () => {
		const token = await tokenFor(
			t,
			["status.read", "drafts.read", "drafts.write", "members.manage"] as const,
			"draft bot",
		);
		const { client } = await connect(t, token);
		expect(client.getInstructions()).toContain("draft_notification");
		expect(client.getInstructions()).not.toContain("get_design_guide");
		await client.close();
		const response = await handleMcpRequest(
			new Request("http://localhost/api/mcp", {
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 7,
					method: "tools/call",
					params: {
						name: "create_incident",
						arguments: { title: "Quiet", message: "No send" },
					},
				}),
			}),
			t.services,
		);
		const body = await response.json();
		expect(body.result.isError).toBe(true);
		expect(body.result.content[0].text).toContain("incidents.publish");
		expect(await t.store.count("incidents")).toBe(0);
		const { call } = await connect(t, token);
		const password = "super-secret-password";
		await call("update_member", {
			id: "mem_missing",
			password,
		});
		const logged = JSON.stringify(await t.store.find("agent_activity"));
		expect(logged).not.toContain(password);
		expect(logged).not.toContain(token);
		expect(logged).toContain("create_incident");

		const nameless = await handleMcpRequest(
			new Request("http://localhost/api/mcp", {
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					method: "tools/call",
					params: { name: "create_incident", arguments: {} },
				}),
			}),
			t.services,
		);
		expect(await nameless.json()).toMatchObject({
			id: null,
			result: { isError: true },
		});
	});

	it("records a denial when a tool needs one more permission", async () => {
		const { call } = await connect(
			t,
			await tokenFor(t, ["incidents.publish"], "quiet publisher"),
		);
		const result = await call("create_incident", {
			title: "Quiet",
			message: "No send",
		});
		expect(result.isError).toBe(true);
		expect(result.text).toContain("notifications.send");
		expect(await t.store.find("agent_activity")).toContainEqual(
			expect.objectContaining({
				type: "tool_call",
				tool: "create_incident",
				outcome: "denied",
				permission: "notifications.send",
			}),
		);
	});
});
