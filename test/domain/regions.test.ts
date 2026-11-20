import {
	incidentOnRegion,
	regionNameFor,
	serviceStatusOnRegion,
} from "@/lib/domain/regions";
import type {
	Incident,
	Service,
	ServiceStatus,
	ServiceStatusChange,
} from "@/lib/domain/types";

const AT = "2026-11-02T12:00:00.000Z";

function service(status: ServiceStatus = "operational"): Service {
	return {
		id: "svc_api",
		name: "API",
		status,
		order: 0,
		hidden: false,
		createdAt: AT,
		updatedAt: AT,
	};
}

function change(
	id: string,
	at: string,
	status: ServiceStatus,
	previousStatus: ServiceStatus,
	incidentId?: string,
): ServiceStatusChange {
	return {
		id,
		serviceId: "svc_api",
		status,
		previousStatus,
		incidentId,
		createdAt: at,
	};
}

function incident(overrides: Partial<Incident> = {}): Incident {
	return {
		id: "inc_1",
		kind: "incident",
		title: "Outage",
		status: "investigating",
		impact: "major",
		serviceIds: ["svc_api"],
		updates: [],
		startedAt: AT,
		createdBy: { type: "system", id: "system", name: "System" },
		createdAt: AT,
		updatedAt: AT,
		...overrides,
	};
}

describe("incident regions", () => {
	it("treats a missing region as global", () => {
		expect(incidentOnRegion(incident(), "reg_us")).toBe(true);
		expect(incidentOnRegion(incident({ regionId: "reg_us" }), "reg_us")).toBe(
			true,
		);
		expect(incidentOnRegion(incident({ regionId: "reg_eu" }), "reg_us")).toBe(
			false,
		);
	});

	it("names a region only when a region exists", () => {
		const regions = [{ id: "reg_us", name: "United States" }];
		expect(regionNameFor(incident({ regionId: "reg_us" }), [])).toBeUndefined();
		expect(regionNameFor(incident(), regions)).toBe("Global");
		expect(regionNameFor(incident({ regionId: "reg_us" }), regions)).toBe(
			"United States",
		);
		expect(regionNameFor(incident({ regionId: "reg_gone" }), regions)).toBe(
			"Global",
		);
	});

	it("replays the status of one region", () => {
		const api = service();
		const here = "reg_us";
		const status = (
			changes: ServiceStatusChange[],
			open: Incident[],
		): ServiceStatus => serviceStatusOnRegion(api, changes, open, here);

		expect(status([], [])).toBe("operational");
		expect(status([], [incident()])).toBe("partial_outage");
		expect(
			status(
				[change("ch_manual", AT, "degraded_performance", "operational")],
				[],
			),
		).toBe("degraded_performance");
		expect(
			status(
				[change("ch_us", AT, "major_outage", "operational", "inc_us")],
				[incident({ id: "inc_us", regionId: here, impact: "critical" })],
			),
		).toBe("major_outage");
		expect(
			status(
				[change("ch_eu", AT, "major_outage", "operational", "inc_eu")],
				[incident({ id: "inc_eu", regionId: "reg_eu", impact: "critical" })],
			),
		).toBe("operational");
		expect(
			status(
				[change("ch_global", AT, "partial_outage", "operational", "inc_g")],
				[incident({ id: "inc_g" })],
			),
		).toBe("partial_outage");
		expect(
			status(
				[change("ch_closed", AT, "major_outage", "operational", "inc_old")],
				[],
			),
		).toBe("operational");
		expect(
			status(
				[
					change(
						"ch_manual",
						"2026-11-02T10:00:00.000Z",
						"degraded_performance",
						"operational",
					),
					change(
						"ch_fix",
						"2026-11-02T11:00:00.000Z",
						"operational",
						"degraded_performance",
						"inc_us",
					),
				],
				[incident({ id: "inc_us", regionId: here })],
			),
		).toBe("operational");
		expect(
			status(
				[
					change(
						"ch_us",
						"2026-11-02T10:00:00.000Z",
						"major_outage",
						"operational",
						"inc_us",
					),
					change(
						"ch_manual",
						"2026-11-02T11:00:00.000Z",
						"operational",
						"major_outage",
					),
				],
				[incident({ id: "inc_us", regionId: here, impact: "critical" })],
			),
		).toBe("operational");
		expect(
			status([], [incident({ status: "scheduled", kind: "maintenance" })]),
		).toBe("operational");
		expect(
			status(
				[],
				[
					incident({
						id: "mnt",
						kind: "maintenance",
						status: "in_progress",
						impact: "none",
					}),
				],
			),
		).toBe("under_maintenance");
		expect(
			status(
				[change("ch_mnt", AT, "under_maintenance", "operational", "mnt")],
				[
					incident({
						id: "mnt",
						kind: "maintenance",
						status: "in_progress",
						impact: "none",
					}),
				],
			),
		).toBe("under_maintenance");
		expect(
			status(
				[],
				[
					incident({
						kind: "maintenance",
						status: "verifying",
						impact: "none",
					}),
				],
			),
		).toBe("operational");
		expect(status([], [incident({ impact: "none" })])).toBe("operational");
		expect(
			status([], [incident({ serviceIds: ["svc_web"], impact: "critical" })]),
		).toBe("operational");
		expect(
			status(
				[
					change("ch_b", AT, "major_outage", "degraded_performance"),
					change("ch_a", AT, "degraded_performance", "operational"),
					change(
						"ch_early",
						"2026-11-02T11:00:00.000Z",
						"operational",
						"operational",
					),
				],
				[],
			),
		).toBe("major_outage");
	});
});
