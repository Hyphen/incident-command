import { z } from "zod";
import { subscriberServicesSchema, subscribeSchema } from "./domain/schemas";
import { SUBSCRIBER_TYPES, type Subscriber } from "./domain/types";
import {
	publicIncidentSchema,
	publicStatusSchema,
	publicUpdateSchema,
	regionRefSchema,
} from "./public-api";

/** The server URL of the OpenAPI document in the documentation site. */
export const EXAMPLE_SERVER_URL = "https://status.example.com";

const subscriberFields = {
	id: z.string(),
	type: z.enum(SUBSCRIBER_TYPES),
	target: z
		.string()
		.describe("The email address, the phone number or the webhook URL."),
	confirmed: z.boolean(),
	confirmedAt: z.string().optional(),
	createdAt: z.string(),
	serviceIds: z
		.array(z.string())
		.optional()
		.describe(
			"The services that send a notification. When the field is absent, all services send one.",
		),
};

/** A subscriber in an API response. The type check keeps it in step with `Subscriber`. */
const subscriberSchema = z
	.object(subscriberFields)
	.describe("A subscriber. The response has no token.") satisfies z.ZodType<
	Omit<Subscriber, "token">
>;

/** The subscriber that `POST /api/v1/subscribers` returns, with its token. */
const createdSubscriberSchema = z
	.object({
		...subscriberFields,
		token: z
			.string()
			.describe(
				"The secret of the subscriber links (confirm, services and unsubscribe). Keep it secret.",
			),
	})
	.describe("A new subscriber with its token.") satisfies z.ZodType<Subscriber>;

const apiErrorSchema = z
	.object({
		error: z.object({
			code: z.enum([
				"bad_request",
				"unauthorized",
				"forbidden",
				"not_found",
				"conflict",
				"unavailable",
				"internal_error",
			]),
			message: z.string(),
		}),
	})
	.describe("An error.");

const regionNotFoundSchema = z
	.object({ error: z.string() })
	.describe("The region was not found.");

const listSubscribersSchema = z.object({
	subscribers: z.array(subscriberSchema),
});
const subscriberResponseSchema = z.object({ subscriber: subscriberSchema });
const createdSubscriberResponseSchema = z.object({
	subscriber: createdSubscriberSchema,
});

/** The named schemas of the document. Each one becomes `#/components/schemas/<name>`. */
const NAMED_SCHEMAS = {
	PublicStatus: publicStatusSchema,
	Incident: publicIncidentSchema,
	IncidentUpdate: publicUpdateSchema,
	RegionRef: regionRefSchema,
	RegionNotFound: regionNotFoundSchema,
	Subscriber: subscriberSchema,
	CreatedSubscriber: createdSubscriberSchema,
	SubscriberList: listSubscribersSchema,
	SubscriberResponse: subscriberResponseSchema,
	CreatedSubscriberResponse: createdSubscriberResponseSchema,
	SubscribeInput: subscribeSchema,
	SubscriberServicesInput: subscriberServicesSchema,
	ApiError: apiErrorSchema,
} as const;

type SchemaName = keyof typeof NAMED_SCHEMAS;

/** The JSON Schemas of `NAMED_SCHEMAS`. Transforms and refinements describe their input. */
function componentSchemas(): Record<string, unknown> {
	const registry = z.registry<{ id: string }>();
	for (const [id, schema] of Object.entries(NAMED_SCHEMAS)) {
		registry.add(schema, { id });
	}
	const { schemas } = z.toJSONSchema(registry, {
		io: "input",
		unrepresentable: "any",
		uri: (id) => `#/components/schemas/${id}`,
	});
	return Object.fromEntries(
		Object.entries(schemas).map(([id, { $schema, $id, ...rest }]) => [
			id,
			rest,
		]),
	);
}

function ref(name: SchemaName) {
	return { $ref: `#/components/schemas/${name}` };
}

function json(name: SchemaName, description: string) {
	return {
		description,
		content: { "application/json": { schema: ref(name) } },
	};
}

const authErrors = {
	"401": json("ApiError", "The request has no valid bearer token."),
	"403": json("ApiError", "The agent does not have the necessary permission."),
};

/**
 * The OpenAPI 3.1 document of the REST API. `GET /api/v1/openapi.json`
 * serves it, and the documentation site keeps a copy in
 * packages/website/site/api/swagger.json.
 */
export function buildOpenApi(serverUrl: string = EXAMPLE_SERVER_URL) {
	return {
		openapi: "3.1.0",
		info: {
			title: "Incident Command API",
			version: "1",
			description:
				"The REST API of an Incident Command server. The status endpoint is public. The subscriber endpoints need a bearer token: an API token (`icmd_…`) that an admin makes on the agent page, or an OAuth access token of an agent. The agent must have the permission that each operation names. A server serves this document at `/api/v1/openapi.json`.",
			license: { name: "MIT", identifier: "MIT" },
		},
		servers: [{ url: serverUrl }],
		tags: [
			{ name: "Status", description: "The public status of the page." },
			{ name: "Subscribers", description: "The subscribers to notifications." },
		],
		paths: {
			"/api/v1/status": {
				get: {
					tags: ["Status"],
					operationId: "getStatus",
					summary: "Get the status",
					description:
						"Returns the status page in JSON. All origins can call it. The response can be cached for 15 seconds.",
					security: [],
					parameters: [
						{
							name: "region",
							in: "query",
							required: false,
							description:
								"A region id. The response then shows that region tab. Without it, the response shows the Overview.",
							schema: { type: "string" },
						},
					],
					responses: {
						"200": json("PublicStatus", "The status."),
						"404": json("RegionNotFound", "The region was not found."),
					},
				},
			},
			"/api/v1/subscribers": {
				get: {
					tags: ["Subscribers"],
					operationId: "listSubscribers",
					summary: "List the subscribers",
					description:
						"Returns all subscribers, the newest first. The response has no tokens. Permission: `subscribers.read`.",
					responses: {
						"200": json("SubscriberList", "The subscribers."),
						...authErrors,
					},
				},
				post: {
					tags: ["Subscribers"],
					operationId: "addSubscriber",
					summary: "Add a subscriber",
					description:
						"Adds a confirmed subscriber. The subscriber gets no confirmation message, so get consent first. Send `serviceIds` to limit the notifications to those services. Permission: `subscribers.manage`.",
					requestBody: {
						required: true,
						content: { "application/json": { schema: ref("SubscribeInput") } },
					},
					responses: {
						"201": json(
							"CreatedSubscriberResponse",
							"The new subscriber, with its token.",
						),
						"400": json("ApiError", "The body is not valid."),
						...authErrors,
					},
				},
			},
			"/api/v1/subscribers/{id}": {
				patch: {
					tags: ["Subscribers"],
					operationId: "setSubscriberServices",
					summary: "Set the services of a subscriber",
					description:
						"Replaces the services that send a notification to the subscriber. An empty list clears the choice, and all services then send a notification. Permission: `subscribers.manage`.",
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							description: "The subscriber id.",
							schema: { type: "string" },
						},
					],
					requestBody: {
						required: true,
						content: {
							"application/json": { schema: ref("SubscriberServicesInput") },
						},
					},
					responses: {
						"200": json("SubscriberResponse", "The subscriber."),
						"400": json("ApiError", "The body is not valid."),
						...authErrors,
						"404": json(
							"ApiError",
							"The subscriber or a service was not found.",
						),
					},
				},
			},
		},
		components: {
			schemas: componentSchemas(),
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					description:
						"An API token (`icmd_…`) or an OAuth access token of an agent.",
				},
			},
		},
		security: [{ bearerAuth: [] }],
	};
}
