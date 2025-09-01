/* src/graphql/resolvers/imageDetails.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type ImageDetailsArgs, ImageDetailsArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const imageDetailsResolver = withValidation(
  ImageDetailsArgsSchema,
  async (_: unknown, args: ImageDetailsArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { divisionCode, styleSeasonCode, styleCode } = args;
      
      const cacheKey = SQLiteCacheKeys.imageDetails(
        divisionCode,
        styleSeasonCode,
        styleCode
      );

      log("Image details query initiated", {
        requestId: context.requestId,
        divisionCode,
        styleSeasonCode,
        styleCode,
        user: context.user?.id
      });

      // Use SQLite cache with 10-minute TTL for image details data
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const cluster = await getCluster().catch((error) => {
            err("Error in getCluster:", { error, requestId: context.requestId });
            throw error;
          });

          const query = `EXECUTE FUNCTION \`default\`.\`_default\`.getImageDetails($divisionCode, $styleSeasonCode, $styleCode)`;
          const queryOptions = {
            parameters: {
              divisionCode,
              styleSeasonCode,
              styleCode,
            },
          };

          log("Executing image details query (cache miss)", { 
            query, 
            queryOptions,
            requestId: context.requestId
          });

          const result = await cluster.cluster.query(query, queryOptions);
          
          debug("Image details query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2)
          });

          return result.rows[0][0];
        },
        10 * 60 * 1000 // 10-minute TTL
      );
    } catch (error) {
      err("Error in image details resolver:", { 
        error, 
        requestId: context.requestId,
        args
      });
      throw error;
    }
  }
);

const imageDetails = {
  Query: {
    // Wrap the resolver with performance tracking
    imageDetails: withPerformanceTracking("Query", "imageDetails", imageDetailsResolver),
  },
};

export default imageDetails;
