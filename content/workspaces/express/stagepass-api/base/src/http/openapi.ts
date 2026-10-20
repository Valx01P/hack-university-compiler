// OpenAPI 3.1 built from the zod schemas the routes already validate with, so the document
// cannot drift from what the API accepts. Each module's routes file registers its routes as
// RouteDoc entries next to the routes themselves, app.ts gathers them in routeDocs, and
// GET /openapi.json (and npm run openapi) serve buildOpenApi()'s result.
import { z } from "zod";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

type Schema = z.ZodType;

export type RouteDoc = {
  method: HttpMethod;
  /** OpenAPI path syntax: /v1/events/{eventId}. */
  path: string;
  summary: string;
  tag: string;
  auth?: "required" | "optional";
  /** Roles allowed, when only some are. */
  roles?: readonly string[];
  params?: z.ZodObject;
  query?: z.ZodObject;
  headers?: Record<string, { description: string; required: boolean; schema: Schema }>;
  body?: { schema: Schema; contentType?: "application/json" | "multipart/form-data" };
  responses: Record<number, { description: string; schema?: Schema; contentType?: string }>;
};

type JsonSchema = Record<string, unknown>;

function jsonSchema(schema: Schema, io: "input" | "output"): JsonSchema {
  // unrepresentable: "any" turns things JSON Schema cannot say (a transform's output) into {}.
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as JsonSchema;
  return rest;
}

function parameters(where: "path" | "query", schema: z.ZodObject | undefined): JsonSchema[] {
  if (schema === undefined) return [];
  return Object.entries(schema.shape).map(([name, field]) => ({
    name,
    in: where,
    // A field that accepts undefined (optional or with a default) is not required.
    required: where === "path" || !(field as Schema).safeParse(undefined).success,
    schema: jsonSchema(field as Schema, "input"),
  }));
}

const problemSchema: JsonSchema = {
  type: "object",
  required: ["type", "title", "status"],
  properties: {
    type: { type: "string" },
    title: { type: "string" },
    status: { type: "integer" },
    detail: { type: "string" },
    instance: { type: "string" },
    errors: {
      type: "array",
      items: {
        type: "object",
        required: ["field", "message"],
        properties: { field: { type: "string" }, message: { type: "string" } },
      },
    },
  },
};

function operation(doc: RouteDoc): JsonSchema {
  const responses: JsonSchema = {};
  for (const [status, response] of Object.entries(doc.responses)) {
    if (response.schema !== undefined) {
      const contentType = response.contentType ?? "application/json";
      responses[status] = { description: response.description, content: { [contentType]: { schema: jsonSchema(response.schema, "output") } } };
    } else if (Number(status) >= 400) {
      responses[status] = {
        description: response.description,
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
      };
    } else {
      responses[status] = { description: response.description };
    }
  }
  const headers = Object.entries(doc.headers ?? {}).map(([name, header]) => ({
    name,
    in: "header",
    required: header.required,
    description: header.description,
    schema: jsonSchema(header.schema, "input"),
  }));
  const roles = doc.roles === undefined ? "" : ` Roles: ${doc.roles.join(", ")}.`;
  return {
    summary: doc.summary,
    ...(roles === "" ? {} : { description: roles.trim() }),
    tags: [doc.tag],
    operationId: `${doc.method}${doc.path.replace(/[{}]/g, "").replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ?? "").toUpperCase())}`,
    parameters: [...parameters("path", doc.params), ...parameters("query", doc.query), ...headers],
    ...(doc.body === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: { [doc.body.contentType ?? "application/json"]: { schema: jsonSchema(doc.body.schema, "input") } },
          },
        }),
    responses,
    ...(doc.auth === "required" ? { security: [{ bearerAuth: [] }] } : {}),
    ...(doc.auth === "optional" ? { security: [{}, { bearerAuth: [] }] } : {}),
  };
}

export function buildOpenApi(routes: readonly RouteDoc[], version: string): JsonSchema {
  const paths: Record<string, JsonSchema> = {};
  for (const doc of routes) {
    paths[doc.path] = { ...paths[doc.path], [doc.method]: operation(doc) };
  }
  return {
    openapi: "3.1.1",
    info: {
      title: "StagePass API",
      version,
      description: "Ticketing for small venues: venues, events, ticket types, checkout, and orders.",
    },
    servers: [{ url: "/" }],
    paths,
    components: {
      schemas: { Problem: problemSchema },
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    },
  };
}
