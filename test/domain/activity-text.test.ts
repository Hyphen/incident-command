import { activitySentence } from "@/lib/domain/activity-text";
import type { AgentActivity, AgentActivityType } from "@/lib/domain/types";

function entry(
	type: AgentActivityType,
	outcome: AgentActivity["outcome"] = "ok",
): AgentActivity {
	return {
		id: "act_1",
		agentId: "agt_1",
		type,
		actor: { type: "member", id: "mem_1", name: "Ada" },
		outcome,
		createdAt: "2026-11-02T12:00:00.000Z",
		...(type === "tool_call" ? { tool: "create_incident" } : {}),
	};
}

describe("activitySentence", () => {
	it("names each activity for a person", () => {
		expect(activitySentence(entry("tool_call"))).toBe(
			"Called create_incident.",
		);
		expect(activitySentence(entry("tool_call", "denied"))).toBe(
			"Denied create_incident.",
		);
		expect(activitySentence(entry("tool_call", "error"))).toBe(
			"Failed create_incident.",
		);
		expect(activitySentence({ ...entry("tool_call"), tool: undefined })).toBe(
			"Called a tool.",
		);
		expect(activitySentence(entry("agent_created"))).toBe("Created the agent.");
		expect(activitySentence(entry("agent_renamed"))).toBe("Changed the name.");
		expect(activitySentence(entry("permissions_changed"))).toBe(
			"Changed the permissions.",
		);
		expect(activitySentence(entry("token_created"))).toBe(
			"Created an API token.",
		);
		expect(activitySentence(entry("token_revoked"))).toBe(
			"Revoked an API token.",
		);
		expect(activitySentence(entry("oauth_connected"))).toBe(
			"Connected with OAuth.",
		);
		expect(activitySentence(entry("oauth_disconnected"))).toBe(
			"Disconnected OAuth.",
		);
		expect(activitySentence(entry("owner_removed"))).toBe("Removed the owner.");
		expect(activitySentence(entry("draft_approved"))).toBe(
			"A person approved a draft.",
		);
		expect(activitySentence(entry("draft_discarded"))).toBe(
			"A person discarded a draft.",
		);
	});
});
