/* src/graphql/resolvers/optionsProductView.ts */

import { cacheEntities, SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { CouchbaseErrorHandler } from "$lib/couchbaseErrorHandler";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type OptionsProductViewArgs, OptionsProductViewArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const optionsProductViewResolver = withValidation(
  OptionsProductViewArgsSchema,
  async (_: unknown, args: OptionsProductViewArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { BrandCode, SalesOrganizationCode, StyleSeasonCode, DivisionCode, ActiveOption, SalesChannels } = args;

      // Use QueryFingerprintBuilder for SIMD-accelerated cache key generation
      const cacheKey = QueryFingerprintBuilder.for("optionsProductView")
        .withVariables({ BrandCode, SalesOrganizationCode, StyleSeasonCode, DivisionCode, ActiveOption, SalesChannels })
        .withPrefix("gql")
        .build();

      log("Options product view query initiated", {
        requestId: context.requestId,
        BrandCode,
        SalesOrganizationCode,
        StyleSeasonCode,
        DivisionCode,
        ActiveOption,
        SalesChannelsCount: SalesChannels.length,
        user: context.user?.id,
      });

      // Use SQLite cache with 5-minute TTL for options product view data
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const cluster = await CouchbaseErrorHandler.executeWithRetry(
            async () => await getCluster(),
            CouchbaseErrorHandler.createConnectionOperationContext("getCluster", context.requestId)
          );

          const query = `EXECUTE FUNCTION \`default\`.\`_default\`.get_options_product_view($BrandCode, $SalesOrganizationCode, $StyleSeasonCode, $DivisionCode, $ActiveOption, $SalesChannels)`;
          const queryOptions = {
            parameters: {
              BrandCode,
              SalesOrganizationCode,
              StyleSeasonCode,
              DivisionCode,
              ActiveOption,
              SalesChannels,
            },
          };

          log("Executing options product view query (cache miss)", {
            query,
            queryOptions,
            requestId: context.requestId,
          });

          const result = await CouchbaseErrorHandler.executeWithRetry(
            async () => await cluster.cluster.query(query, queryOptions),
            CouchbaseErrorHandler.createQueryOperationContext(
              "get_options_product_view",
              query,
              context.requestId,
              "default"
            )
          );

          debug("Options product view query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2),
          });

          const data = result.rows[0];

          // Cache individual option entities for imageDetails reuse
          cacheEntities(
            data,
            (option: any) => {
              if (option.divisionCode && option.styleCode) {
                return SQLiteCacheKeys.entityImage(option.divisionCode, StyleSeasonCode, option.styleCode);
              }
              return null;
            },
            {
              requiredFields: ["divisionCode", "styleCode", "imageUrl"],
              ttlMs: 10 * 60 * 1000,
              userScoped: false,
            }
          );

          return data;
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("Error in options product view resolver:", {
        error,
        requestId: context.requestId,
        args,
      });
      throw error;
    }
  }
);

const optionsProductView = {
  Query: {
    // Wrap the resolver with performance tracking
    optionsProductView: withPerformanceTracking("Query", "optionsProductView", optionsProductViewResolver),
  },
};

export default optionsProductView;
