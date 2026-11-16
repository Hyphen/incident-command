import type { z } from "zod";
import type { Config } from "../config";
import { can, PERMISSIONS, type Permission } from "../domain/permissions";
import type { Actor, AuthorRef, MemberActor } from "../domain/types";
import { PermissionDeniedError, ValidationError } from "../errors";
import type { Notifier } from "../notifications/notifier";
import type { DocumentStore } from "../store/types";

export interface ServiceContext {
	store: DocumentStore;
	notifier: Notifier;
	config: Config;
	now: () => Date;
}

export const SYSTEM_ACTOR: MemberActor = {
	type: "system",
	id: "system",
	name: "System",
	role: "admin",
};

export function requirePermission(actor: Actor, permission: Permission): void {
	if (can(actor, permission)) {
		return;
	}
	const spec = PERMISSIONS[permission];
	const message =
		actor.type === "agent"
			? `This agent does not have the permission "${spec.label}" (${permission}).`
			: `This action requires the ${spec.role} role`;
	throw new PermissionDeniedError(message, permission);
}

export function authorRef(actor: Actor): AuthorRef {
	return { type: actor.type, id: actor.id, name: actor.name };
}

/** Validates input against a schema, throwing a readable `ValidationError`. */
export function parse<S extends z.ZodType>(
	schema: S,
	input: unknown,
): z.output<S> {
	const result = schema.safeParse(input);
	if (!result.success) {
		const message = result.error.issues
			.map((issue) =>
				issue.path.length > 0
					? `${issue.path.join(".")}: ${issue.message}`
					: issue.message,
			)
			.join("; ");
		throw new ValidationError(message);
	}
	return result.data;
}

export function iso(date: Date): string {
	return date.toISOString();
}
