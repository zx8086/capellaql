/* src/graphql/resolvers/lookDetails.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type LookDetailsArgs, LookDetailsArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const lookDetailsResolver = withValidation(
  LookDetailsArgsSchema,
  async (_: unknown, args: LookDetailsArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { lookDocKey } = args;
      const cacheKey = SQLiteCacheKeys.lookDetails(lookDocKey);

      log("Look details query initiated", {
        requestId: context.requestId,
        lookDocKey: lookDocKey.substring(0, 50) + (lookDocKey.length > 50 ? "..." : ""),
        user: context.user?.id
      });

      return await withSQLiteCache(
        cacheKey,
        async () => {
          const cluster = await getCluster().catch((error) => {
            err("Error in getCluster:", { error, requestId: context.requestId });
            throw error;
          });

          const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.getLookDetails($lookDocKey)`;
          const queryOptions = { parameters: { lookDocKey } };

          log("Executing look details query (cache miss)", { 
            query, 
            queryOptions,
            requestId: context.requestId
          });

          const result = await cluster.cluster.query(query, queryOptions);
          
          debug("Look details query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2)
          });

          return result.rows[0][0];
        },
        10 * 60 * 1000 // 10-minute TTL for look details
      );
    } catch (error) {
      err("Error in look details resolver:", { 
        error, 
        requestId: context.requestId,
        args
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
