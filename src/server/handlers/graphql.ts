/* src/server/handlers/graphql.ts */

import { createYoga } from "graphql-yoga";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { trace } from "@opentelemetry/api";
import depthLimit from "graphql-depth-limit";
import type { RouteHandler } from "../types";
import { contextFactory } from "../../graphql/context";
import resolvers from "../../graphql/resolvers";
import typeDefs from "../../graphql/typeDefs";
import { err, warn } from "../../telemetry";

// Create executable schema from typeDefs and resolvers
const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

/**
 * Create GraphQL Yoga instance with all plugins and configuration.
 * This instance works directly with Bun.serve() via yoga.fetch().
 */
const yoga = createYoga({
  schema,
  context: contextFactory,
  batching: {
    limit: 10,
  },
  graphqlEndpoint: "/graphql",
  landingPage: true, // Enable GraphiQL
  plugins: [
    // Query size validation plugin
    {
      onParse({ params, addError }) {
        if (params.source.length > 10000) {
          // 10KB limit
          addError(new Error("Query too large - maximum 10KB allowed"));
        }
      },
    },
    // Error logging plugin
    {
      onError: ({ error }) => {
        err("GraphQL Error", {
          error: error.message,
          stack: error.stack,
        });
      },
    },
    // OpenTelemetry span attributes plugin
    {
      onParse: ({ params }) => {
        const span = trace.getActiveSpan();
        if (span && params) {
          span.setAttribute("graphql.operation_name", params.operationName || "Unknown");
          if (params.source) {
            span.setAttribute("graphql.query", params.source);
          }
        }
      },
      onValidate: ({ document }) => {
        const span = trace.getActiveSpan();
        if (span && document?.definitions) {
          const firstDef = document.definitions[0];
          const operationName =
            firstDef?.kind === "OperationDefinition"
              ? firstDef.name?.value || "Unknown"
              : "Unknown";
          span.setAttribute("graphql.operation_name", operationName);
        }
      },
    },
  ],
  // GraphQL Yoga has built-in validation rules support
  validationRules: [depthLimit(10)],
});

/**
 * GraphQL handler - passes request directly to yoga.fetch()
 * which returns a Response compatible with Bun.serve()
 */
export const graphqlHandler: RouteHandler = async (request, context) => {
  // Log large query warnings
  if (request.method === "POST") {
    try {
      const clonedRequest = request.clone();
      const text = await clonedRequest.text();
      if (text) {
        const body = JSON.parse(text);
        if (body?.query && body.query.length > 1000) {
          warn("Large GraphQL query detected", {
            operationName: body.operationName,
            queryLength: body.query.length,
            requestId: context.requestId,
          });
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // yoga.fetch is WHATWG Fetch API compatible - works directly with Bun.serve()
  return yoga.fetch(request);
};

// Export yoga instance for WebSocket subscriptions
export { yoga };
