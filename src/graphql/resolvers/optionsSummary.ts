/* src/graphql/resolvers/optionsSummary.ts */

import { withSQLiteCache } from "$lib/bunSQLiteCache";
import { connectionManager, QueryExecutor } from "$lib/couchbase";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type OptionsSummaryArgs, OptionsSummaryArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const optionsSummaryResolver = withValidation(
  OptionsSummaryArgsSchema,
  async (_: unknown, args: OptionsSummaryArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { SalesOrganizationCode, StyleSeasonCode, DivisionCode, ActiveOption, SalesChannels } = args;

      // Use QueryFingerprintBuilder for SIMD-accelerated cache key generation
      const cacheKey = QueryFingerprintBuilder.for("optionsSummary")
        .withVariables({ SalesOrganizationCode, StyleSeasonCode, DivisionCode, ActiveOption, SalesChannels })
        .withPrefix("gql")
        .build();

      log("Options summary query initiated", {
        requestId: context.requestId,
        SalesOrganizationCode,
        StyleSeasonCode,
        DivisionCode,
        ActiveOption,
        SalesChannelsCount: SalesChannels.length,
        user: context.user?.id,
      });

      // Use SQLite cache with 3-minute TTL for options summary data
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const conn = await connectionManager.getConnection();

          const query = `EXECUTE FUNCTION \`default\`.\`_default\`.get_options_summary($SalesOrganizationCode, $StyleSeasonCode, $DivisionCode, $ActiveOption, $SalesChannels)`;
          const parameters = {
            SalesOrganizationCode,
            StyleSeasonCode,
            DivisionCode,
            ActiveOption,
            SalesChannels,
          };

          log("Executing options summary query (cache miss)", {
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

          debug("Options summary query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: result.rows?.[0] ? JSON.stringify(result.rows[0], null, 2) : "empty",
          });

          // Handle empty results gracefully - return default summary
          if (!result.rows?.length || !result.rows[0]?.[0]) {
            return {
              totalOptions: 0,
              totalUnits: 0,
              totalWholesale: 0,
              totalRetail: 0,
            };
          }

          return result.rows[0][0];
        },
        3 * 60 * 1000 // 3-minute TTL
      );
    } catch (error) {
      err("Error in options summary resolver:", error, {
        requestId: context.requestId,
        args,
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
