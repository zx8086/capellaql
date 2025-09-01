/* src/graphql/resolvers/imageUrlCheck.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type ImageUrlCheckArgs, ImageUrlCheckArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const imageUrlCheckResolver = withValidation(
  ImageUrlCheckArgsSchema,
  async (_: unknown, args: ImageUrlCheckArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { divisions, season } = args;
      
      const cacheKey = SQLiteCacheKeys.imageUrlCheck(divisions, season);

      log("Image URL check query initiated", {
        requestId: context.requestId,
        divisions: divisions.slice(0, 5), // Show first 5 for logging
        divisionsCount: divisions.length,
        season,
        user: context.user?.id
      });

      // Use SQLite cache with 2-minute TTL for URL checks
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const cluster = await getCluster().catch((error) => {
            err("Error in getCluster:", { error, requestId: context.requestId });
            throw error;
          });

          const query = `EXECUTE FUNCTION \`default\`.\`_default\`.getImageUrlCheck($divisions, $season)`;
          const queryOptions = {
            parameters: {
              divisions,
              season,
            },
          };

          log("Executing image URL check query (cache miss)", { 
            query, 
            queryOptions,
            requestId: context.requestId
          });

          const result = await cluster.cluster.query(query, queryOptions);
          
          debug("Image URL check query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2)
          });

          return result.rows[0];
        },
        2 * 60 * 1000 // 2-minute TTL
      );
    } catch (error) {
      err("Error in image URL check resolver:", { 
        error, 
        requestId: context.requestId,
        args
      });
      throw error;
    }
  }
);

const imageUrlCheck = {
  Query: {
    // Wrap the resolver with performance tracking
    getImageUrlCheck: withPerformanceTracking("Query", "getImageUrlCheck", imageUrlCheckResolver),
  },
};

export default imageUrlCheck;
