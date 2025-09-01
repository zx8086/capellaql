/* src/graphql/resolvers/looksSummary.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type LooksSummaryArgs, LooksSummaryArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const looksSummaryResolver = withValidation(
  LooksSummaryArgsSchema,
  async (_: unknown, args: LooksSummaryArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { brand, season, division } = args;
      
      const cacheKey = SQLiteCacheKeys.looksSummary(brand || '', season || '', division || '');

      log("Looks summary query initiated", {
        requestId: context.requestId,
        brand,
        season,
        division,
        user: context.user?.id
      });

      // Use SQLite cache with 5-minute TTL for looks summary
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const cluster = await getCluster().catch((error) => {
            err("Error in getCluster:", { error, requestId: context.requestId });
            throw error;
          });
          const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.get_looks_summary($brand, $season, $division)`;
          const queryOptions = {
            parameters: {
              brand,
              season,
              division,
            },
          };

          log("Executing looks summary query (cache miss)", { 
            query, 
            queryOptions,
            requestId: context.requestId
          });

          const result = await cluster.cluster.query(query, queryOptions);
          
          debug("Looks summary query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0][0], null, 2)
          });

          return result.rows[0][0];
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("Error in looks summary resolver:", { 
        error, 
        requestId: context.requestId,
        args
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
