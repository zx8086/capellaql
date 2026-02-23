/* src/graphql/resolvers/imageDetails.ts */

import { cacheEntities, getEntity, SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { connectionManager, QueryExecutor } from "$lib/couchbase";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type ImageDetailsArgs, ImageDetailsArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const imageDetailsResolver = withValidation(
  ImageDetailsArgsSchema,
  async (_: unknown, args: ImageDetailsArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { divisionCode, styleSeasonCode, styleCode } = args;

      // Use QueryFingerprintBuilder for SIMD-accelerated cache key generation
      const _cacheKey = QueryFingerprintBuilder.for("imageDetails")
        .withVariables({ divisionCode, styleSeasonCode, styleCode })
        .withPrefix("gql")
        .build();

      log("Image details query initiated", {
        requestId: context.requestId,
        divisionCode,
        styleSeasonCode,
        styleCode,
        user: context.user?.id,
      });

      // Check entity cache first (may have been populated by optionsProductView query)
      const entityKey = SQLiteCacheKeys.entityImage(divisionCode, styleSeasonCode, styleCode);
      const cached = await getEntity<any>(entityKey);
      if (cached) {
        log("Image details entity cache hit", {
          requestId: context.requestId,
          divisionCode,
          styleSeasonCode,
          styleCode,
          cacheStatus: "entity-hit",
        });
        return cached;
      }

      // Use entity key for cache (enables reuse from optionsProductView query)
      return await withSQLiteCache(
        entityKey,
        async () => {
          const conn = await connectionManager.getConnection();

          const query = `EXECUTE FUNCTION \`default\`.\`_default\`.getImageDetails($divisionCode, $styleSeasonCode, $styleCode)`;
          const parameters = { divisionCode, styleSeasonCode, styleCode };

          log("Executing image details query (cache miss)", {
            query,
            parameters,
            requestId: context.requestId,
          });

          const result = await QueryExecutor.execute(conn.cluster, query, {
            parameters,
            usePreparedStatement: true,
            queryContext: "default._default",
            requestId: context.requestId,
          });

          debug("Image details query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2),
          });

          const data = result.rows[0][0];

          // Cache as entity for future reuse
          cacheEntities(data, () => entityKey, {
            requiredFields: ["imageKey"],
            ttlMs: 10 * 60 * 1000,
            userScoped: false,
          });

          return data;
        },
        10 * 60 * 1000 // 10-minute TTL
      );
    } catch (error) {
      err("Error in image details resolver:", {
        error,
        requestId: context.requestId,
        args,
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
