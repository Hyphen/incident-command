import type { AgentActivity } from "./types";

/** One sentence for a row in the agent activity log. */
export function activitySentence(entry: AgentActivity): string {
	const tool = entry.tool ?? "a tool";
	switch (entry.type) {
		case "tool_call":
			if (entry.outcome === "denied") {
				return `Denied ${tool}.`;
			}
			if (entry.outcome === "error") {
				return `Failed ${tool}.`;
			}
			return `Called ${tool}.`;
		case "agent_created":
			return "Created the agent.";
		case "agent_renamed":
			return "Changed the name.";
		case "permissions_changed":
			return "Changed the permissions.";
		case "token_created":
			return "Created an API token.";
		case "token_revoked":
			return "Revoked an API token.";
		case "oauth_connected":
			return "Connected with OAuth.";
		case "oauth_disconnected":
			return "Disconnected OAuth.";
		case "owner_removed":
			return "Removed the owner.";
		case "draft_approved":
			return "A person approved a draft.";
		case "draft_discarded":
			return "A person discarded a draft.";
	}
}
