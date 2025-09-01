/* src/graphql/resolvers/optionsProductView.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type OptionsProductViewArgs, OptionsProductViewArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const optionsProductViewResolver = withValidation(
  OptionsProductViewArgsSchema,
  async (_: unknown, args: OptionsProductViewArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { BrandCode, SalesOrganizationCode, StyleSeasonCode, DivisionCode, ActiveOption, SalesChannels } = args;
      
      const cacheKey = SQLiteCacheKeys.optionsProductView(
        BrandCode,
        SalesOrganizationCode,
        StyleSeasonCode,
        DivisionCode,
        ActiveOption,
        SalesChannels
      );

      log("Options product view query initiated", {
        requestId: context.requestId,
        BrandCode,
        SalesOrganizationCode,
        StyleSeasonCode,
        DivisionCode,
        ActiveOption,
        SalesChannelsCount: SalesChannels.length,
        user: context.user?.id
      });

      // Use SQLite cache with 5-minute TTL for options product view data
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const cluster = await getCluster().catch((error) => {
            err("Error in getCluster:", { error, requestId: context.requestId });
            throw error;
          });

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
            requestId: context.requestId
          });

          const result = await cluster.cluster.query(query, queryOptions);
          
          debug("Options product view query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2)
          });

          return result.rows[0];
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("Error in options product view resolver:", { 
        error, 
        requestId: context.requestId,
        args
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
