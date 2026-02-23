/* src/graphql/resolvers/lookDetails.ts */

import { cacheEntities, getEntity, SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { connectionManager, QueryExecutor } from "$lib/couchbase";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type LookDetailsArgs, LookDetailsArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const lookDetailsResolver = withValidation(
  LookDetailsArgsSchema,
  async (_: unknown, args: LookDetailsArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { lookDocKey } = args;

      // Use QueryFingerprintBuilder for SIMD-accelerated cache key generation
      const _cacheKey = QueryFingerprintBuilder.for("lookDetails")
        .withVariables({ lookDocKey })
        .withPrefix("gql")
        .build();

      log("Look details query initiated", {
        requestId: context.requestId,
        lookDocKey: lookDocKey.substring(0, 50) + (lookDocKey.length > 50 ? "..." : ""),
        user: context.user?.id,
      });

      // Check entity cache first (may have been populated by looks query)
      const entityKey = SQLiteCacheKeys.entityLook(lookDocKey);
      const cached = await getEntity<any>(entityKey);
      if (cached) {
        log("Look details entity cache hit", {
          requestId: context.requestId,
          lookDocKey: lookDocKey.substring(0, 50),
          cacheStatus: "entity-hit",
        });
        return cached;
      }

      // Use entity key for cache (enables reuse from looks query)
      return await withSQLiteCache(
        entityKey,
        async () => {
          const conn = await connectionManager.getConnection();

          const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.getLookDetails($lookDocKey)`;

          log("Executing look details query (cache miss)", {
            query,
            parameters: { lookDocKey },
            requestId: context.requestId,
          });

          const result = await QueryExecutor.execute(conn.cluster, query, {
            parameters: { lookDocKey },
            usePreparedStatement: true,
            queryContext: "default.media_assets",
            requestId: context.requestId,
          });

          debug("Look details query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: result.rows?.[0] ? JSON.stringify(result.rows[0], null, 2) : "empty",
          });

          // Handle empty results gracefully - return null for missing look
          if (!result.rows?.length || !result.rows[0]?.[0]) {
            return null;
          }

          const data = result.rows[0][0];

          // Cache as entity for future reuse
          cacheEntities(data, () => entityKey, {
            requiredFields: ["documentKey", "divisionCode"],
            ttlMs: 10 * 60 * 1000,
            userScoped: false,
          });

          return data;
        },
        10 * 60 * 1000 // 10-minute TTL for look details
      );
    } catch (error) {
      err("Error in look details resolver:", error, {
        requestId: context.requestId,
        args,
      });
      throw error;
    }
  }
);

const lookDetails = {
  Query: {
    // Wrap the resolver with performance tracking
    lookDetails: withPerformanceTracking("Query", "lookDetails", lookDetailsResolver),
  },
};

export default lookDetails;
