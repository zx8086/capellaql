/* src/graphql/resolvers/optionsSummary.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type OptionsSummaryArgs, OptionsSummaryArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const optionsSummaryResolver = withValidation(
  OptionsSummaryArgsSchema,
  async (_: unknown, args: OptionsSummaryArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { SalesOrganizationCode, StyleSeasonCode, DivisionCode, ActiveOption, SalesChannels } = args;
      
      const cacheKey = SQLiteCacheKeys.optionsSummary(
        SalesOrganizationCode,
        StyleSeasonCode, 
        DivisionCode,
        ActiveOption,
        SalesChannels
      );

      log("Options summary query initiated", {
        requestId: context.requestId,
        SalesOrganizationCode,
        StyleSeasonCode,
        DivisionCode,
        ActiveOption,
        SalesChannelsCount: SalesChannels.length,
        user: context.user?.id
      });

      // Use SQLite cache with 3-minute TTL for options summary data
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const cluster = await getCluster().catch((error) => {
            err("Error in getCluster:", { error, requestId: context.requestId });
            throw error;
          });

          const query = `EXECUTE FUNCTION \`default\`.\`_default\`.get_options_summary($SalesOrganizationCode, $StyleSeasonCode, $DivisionCode, $ActiveOption, $SalesChannels)`;
          const queryOptions = {
            parameters: {
              SalesOrganizationCode,
              StyleSeasonCode,
              DivisionCode,
              ActiveOption,
              SalesChannels,
            },
          };

          log("Executing options summary query (cache miss)", { 
            query, 
            queryOptions,
            requestId: context.requestId
          });

          const result = await cluster.cluster.query(query, queryOptions);
          
          debug("Options summary query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2)
          });

          return result.rows[0][0];
        },
        3 * 60 * 1000 // 3-minute TTL
      );
    } catch (error) {
      err("Error in options summary resolver:", { 
        error, 
        requestId: context.requestId,
        args
      });
      throw error;
    }
  }
);

const optionsSummary = {
  Query: {
    // Wrap the resolver with performance tracking
    optionsSummary: withPerformanceTracking("Query", "optionsSummary", optionsSummaryResolver),
  },
};

export default optionsSummary;
