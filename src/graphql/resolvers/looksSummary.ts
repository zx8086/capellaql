/* src/graphql/resolvers/looksSummary.ts */

import { withSQLiteCache } from "$lib/bunSQLiteCache";
import { connectionManager, QueryExecutor } from "$lib/couchbase";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type LooksSummaryArgs, LooksSummaryArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const looksSummaryResolver = withValidation(
  LooksSummaryArgsSchema,
  async (_: unknown, args: LooksSummaryArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { brand, season, division } = args;

      // Use QueryFingerprintBuilder for SIMD-accelerated cache key generation
      const cacheKey = QueryFingerprintBuilder.for("looksSummary")
        .withVariables({ brand, season, division })
        .withPrefix("gql")
        .build();

      log("Looks summary query initiated", {
        requestId: context.requestId,
        brand,
        season,
        division,
        user: context.user?.id,
      });

      // Use SQLite cache with 5-minute TTL for looks summary
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const conn = await connectionManager.getConnection();

          const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.get_looks_summary($brand, $season, $division)`;

          log("Executing looks summary query (cache miss)", {
            query,
            parameters: { brand, season, division },
            requestId: context.requestId,
          });

          const result = await QueryExecutor.execute(conn.cluster, query, {
            parameters: { brand, season, division },
            usePreparedStatement: false, // Disabled - causes race condition under high concurrency
            queryContext: "default.media_assets",
            requestId: context.requestId,
          });

          debug("Looks summary query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: result.rows?.[0]?.[0] ? JSON.stringify(result.rows[0][0], null, 2) : "empty",
          });

          // Handle empty results gracefully - return zero counts
          if (!result.rows?.length || !result.rows[0]?.[0]) {
            return {
              totalLooks: 0,
              hasTitle: 0,
              hasTrend: 0,
              hasTag: 0,
              hasDescription: 0,
              hasDeliveryName: 0,
              hasGender: 0,
              hasRelatedStyles: 0,
            };
          }

          return result.rows[0][0];
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("Error in looks summary resolver:", {
        error,
        requestId: context.requestId,
        args,
      });
      throw error;
    }
  }
);

const looksSummary = {
  Query: {
    // Wrap the resolver with performance tracking
    looksSummary: withPerformanceTracking("Query", "looksSummary", looksSummaryResolver),
  },
};

export default looksSummary;
