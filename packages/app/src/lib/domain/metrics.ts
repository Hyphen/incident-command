import type { Incident } from "./types";

export interface ResolutionStats {
	/** The number of resolved incidents. */
	resolved: number;
	/** The mean time from start to resolution, in milliseconds. `null` when no incident is resolved. */
	meanMs: number | null;
	/** The longest time from start to resolution, in milliseconds. `null` when no incident is resolved. */
	longestMs: number | null;
}

/** The time to resolve the resolved incidents. Open incidents do not count. */
export function resolutionStats(
	incidents: readonly Incident[],
): ResolutionStats {
	const durations = incidents.flatMap((incident) =>
		incident.resolvedAt
			? [Date.parse(incident.resolvedAt) - Date.parse(incident.startedAt)]
			: [],
	);
	if (durations.length === 0) {
		return { resolved: 0, meanMs: null, longestMs: null };
	}
	const total = durations.reduce((sum, duration) => sum + duration, 0);
	return {
		resolved: durations.length,
		meanMs: total / durations.length,
		longestMs: Math.max(...durations),
	};
}
