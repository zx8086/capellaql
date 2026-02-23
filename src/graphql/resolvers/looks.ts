/* src/graphql/resolvers/looks.ts */

import { cacheEntities, SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { connectionManager, QueryExecutor } from "$lib/couchbase";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type LooksArgs, LooksArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation and context
const looksResolver = withValidation(
  LooksArgsSchema,
  async (_: unknown, args: LooksArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { brand, season, division } = args;

      // Use QueryFingerprintBuilder for SIMD-accelerated cache key generation
      const cacheKey = QueryFingerprintBuilder.for("looks")
        .withVariables({ brand, season, division })
        .withPrefix("gql")
        .build();

      log("GraphQL looks query initiated", {
        requestId: context.requestId,
        operationName: "looks",
        parameters: { brand, season, division },
        user: context.user?.id,
        clientIp: context.clientIp,
      });

      // Use SQLite cache with 5-minute TTL for looks data
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const conn = await connectionManager.getConnection();

          const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.get_looks($brand, $season, $division)`;

          log("Database query execution (cache miss)", {
            operationName: "looks",
            query: "get_looks",
            parameters: { brand, season, division },
            requestId: context.requestId,
            cacheStatus: "miss",
          });

          const result = await QueryExecutor.execute(conn.cluster, query, {
            parameters: { brand, season, division },
            usePreparedStatement: false, // Disabled - causes race condition under high concurrency
            queryContext: "default.media_assets",
            requestId: context.requestId,
          });

          const queryEndTime = Date.now();
          const queryDuration = queryEndTime - (context.startTime || queryEndTime);

          log("GraphQL looks query completed", {
            requestId: context.requestId,
            operationName: "looks",
            rowCount: result.rows?.length || 0,
            queryDurationMs: queryDuration,
            performanceCategory: queryDuration > 1000 ? "slow" : queryDuration > 500 ? "moderate" : "fast",
            cacheStatus: "populated",
          });

          const data = result.rows?.[0];

          // Handle empty results (e.g., invalid division)
          if (!data || !Array.isArray(data) || data.length === 0) {
            debug("Looks query returned no results", {
              requestId: context.requestId,
              parameters: { brand, season, division },
            });
            return [];
          }

          debug("Looks query result details", {
            requestId: context.requestId,
            resultCount: data.length,
          });

          // Cache individual look entities for lookDetails reuse
          cacheEntities(data, (look: any) => (look.documentKey ? SQLiteCacheKeys.entityLook(look.documentKey) : null), {
            requiredFields: ["documentKey", "divisionCode", "lookType", "assetUrl", "title"],
            ttlMs: 10 * 60 * 1000,
            userScoped: false,
          });

          return data;
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("GraphQL looks query failed", {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : "unknown",
        requestId: context.requestId,
        operationName: "looks",
        parameters: args,
        clientIp: context.clientIp,
      });
      throw error;
    }
  }
);

const looks = {
  Query: {
    // Wrap the resolver with performance tracking
    looks: withPerformanceTracking("Query", "looks", looksResolver),
  },
};

export default looks;
