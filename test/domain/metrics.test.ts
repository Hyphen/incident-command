import { resolutionStats } from "@/lib/domain/metrics";
import type { Incident } from "@/lib/domain/types";

function incident(startedAt: string, resolvedAt?: string): Incident {
	return {
		id: `inc_${startedAt}`,
		kind: "incident",
		title: "Outage",
		status: resolvedAt ? "resolved" : "investigating",
		impact: "major",
		serviceIds: [],
		updates: [],
		startedAt,
		resolvedAt,
		createdBy: { type: "system", id: "system", name: "System" },
		createdAt: startedAt,
		updatedAt: resolvedAt ?? startedAt,
	};
}

describe("resolutionStats", () => {
	it("averages the resolved incidents and skips open incidents", () => {
		expect(
			resolutionStats([
				incident("2026-11-01T10:00:00.000Z", "2026-11-01T11:00:00.000Z"),
				incident("2026-11-01T12:00:00.000Z", "2026-11-01T15:00:00.000Z"),
				incident("2026-11-02T00:00:00.000Z"),
			]),
		).toEqual({ resolved: 2, meanMs: 7_200_000, longestMs: 10_800_000 });
	});

	it("has no times without a resolved incident", () => {
		expect(resolutionStats([incident("2026-11-02T00:00:00.000Z")])).toEqual({
			resolved: 0,
			meanMs: null,
			longestMs: null,
		});
	});
});
