/* src/server/handlers/graphql.ts */

import { makeExecutableSchema } from "@graphql-tools/schema";
import { useResponseCache } from "@graphql-yoga/plugin-response-cache";
import { trace } from "@opentelemetry/api";
import depthLimit from "graphql-depth-limit";
import { createYoga } from "graphql-yoga";
import { config } from "../../config";
import { contextFactory } from "../../graphql/context";
import resolvers from "../../graphql/resolvers";
import typeDefs from "../../graphql/typeDefs";
import { debug, err, log, warn } from "../../telemetry";

// Create executable schema from typeDefs and resolvers
const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

/**
 * Response Cache TTL Configuration (milliseconds)
 * Different TTLs for different data types based on update frequency
 */
const CACHE_TTL = {
  // Default TTL from config (15 minutes)
  default: config.application.YOGA_RESPONSE_CACHE_TTL,
  // Looks data - changes infrequently (10 minutes)
  looks: 10 * 60 * 1000,
  lookDetails: 10 * 60 * 1000,
  looksSummary: 10 * 60 * 1000,
  // Options data - changes moderately (5 minutes)
  optionsSummary: 5 * 60 * 1000,
  optionsProductView: 5 * 60 * 1000,
  // Assignments - changes infrequently (5 minutes)
  getAllSeasonalAssignments: 5 * 60 * 1000,
  getDivisionAssignment: 5 * 60 * 1000,
  // Images - static data (15 minutes)
  imageDetails: 15 * 60 * 1000,
  // Document search - dynamic (2 minutes)
  searchDocuments: 2 * 60 * 1000,
};

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
    // Response Cache Plugin with ETag support
    // Automatically sends ETag headers for cache validation
    // Clients can use If-None-Match for conditional requests (304 Not Modified)
    useResponseCache({
      // Session-based caching: extract user identifier from auth header
      // Returns null for global cache (unauthenticated requests)
      session: (request) => {
        const authHeader = request.headers.get("authorization");
        if (authHeader) {
          // Use auth token as session identifier for user-specific caching
          return authHeader;
        }
        // Global cache for unauthenticated requests
        return null;
      },
      // Default TTL for all cached responses
      ttl: CACHE_TTL.default,
      // Per-schema coordinate TTL configuration
      // Note: Use schema coordinate format "TypeName" for types, "Query.fieldName" for fields
      ttlPerSchemaCoordinate: {
        // Looks queries
        "Query.looks": CACHE_TTL.looks,
        "Query.lookDetails": CACHE_TTL.lookDetails,
        "Query.looksSummary": CACHE_TTL.looksSummary,
        // Options queries
        "Query.optionsSummary": CACHE_TTL.optionsSummary,
        "Query.optionsProductView": CACHE_TTL.optionsProductView,
        // Assignment queries
        "Query.getAllSeasonalAssignments": CACHE_TTL.getAllSeasonalAssignments,
        "Query.getDivisionAssignment": CACHE_TTL.getDivisionAssignment,
        // Image queries
        "Query.imageDetails": CACHE_TTL.imageDetails,
        // Document search
        "Query.searchDocuments": CACHE_TTL.searchDocuments,
        // Schema introspection types - long cache (1 hour)
        // These are used by GraphiQL and other dev tools
        __Schema: 60 * 60 * 1000,
        __Type: 60 * 60 * 1000,
        __Field: 60 * 60 * 1000,
        __InputValue: 60 * 60 * 1000,
        __EnumValue: 60 * 60 * 1000,
        __Directive: 60 * 60 * 1000,
      },
      // Invalidate cache automatically when mutations return affected entities
      invalidateViaMutation: true,
      // Include extensions in cached response for debugging
      includeExtensionMetadata: config.runtime.NODE_ENV === "development",
    }),
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
            firstDef?.kind === "OperationDefinition" ? firstDef.name?.value || "Unknown" : "Unknown";
          span.setAttribute("graphql.operation_name", operationName);
        }
      },
    },
    // Cache hit/miss logging plugin
    {
      onResponse({ response, request }) {
        const etag = response.headers.get("etag");
        const cacheStatus = response.headers.get("x-yoga-cache");
        if (etag || cacheStatus) {
          debug("Response cache status", {
            path: new URL(request.url).pathname,
            cacheStatus: cacheStatus || "MISS",
            hasETag: !!etag,
          });
        }
      },
    },
  ],
  // GraphQL Yoga has built-in validation rules support
  validationRules: [depthLimit(10)],
});

// Log cache configuration on startup
log("GraphQL Response Cache enabled", {
  defaultTTL: CACHE_TTL.default,
  etagSupport: true,
  sessionBasedCaching: true,
  invalidateViaMutation: true,
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
