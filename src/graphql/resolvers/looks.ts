/* src/graphql/resolvers/looks.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type LooksArgs, LooksArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation and context
const looksResolver = withValidation(
  LooksArgsSchema,
  async (_: unknown, args: LooksArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { brand, season, division } = args;
      const cacheKey = SQLiteCacheKeys.looks(brand, season, division);

      log("Looks query initiated", {
        requestId: context.requestId,
        brand,
        season,
        division,
        user: context.user?.id,
      });

      // Use SQLite cache with 5-minute TTL for looks data
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const cluster = await getCluster().catch((error) => {
            err("Error in getCluster:", { error, requestId: context.requestId });
            throw error;
          });

          const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.get_looks($brand, $season, $division)`;
          const queryOptions = {
            parameters: { brand, season, division },
          };

          log("Executing looks query (cache miss)", {
            query,
            queryOptions,
            requestId: context.requestId,
          });

          const result = await cluster.cluster.query(query, queryOptions);

          debug("Looks query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2),
          });

          return result.rows[0];
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("Error in looks resolver:", {
        error,
        requestId: context.requestId,
        args,
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
