/* src/graphql/resolvers/getDivisionalAssignment.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type GetDivisionAssignmentArgs, GetDivisionAssignmentArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const getDivisionAssignmentResolver = withValidation(
  GetDivisionAssignmentArgsSchema,
  async (_: unknown, args: GetDivisionAssignmentArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { styleSeasonCode, companyCode, divisionCode } = args;
      
      const cacheKey = SQLiteCacheKeys.getDivisionAssignment(styleSeasonCode, companyCode, divisionCode);

      log("Get division assignment query initiated", {
        requestId: context.requestId,
        styleSeasonCode,
        companyCode,
        divisionCode,
        user: context.user?.id
      });

      // Use SQLite cache with 5-minute TTL for assignments
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const cluster = await getCluster().catch((error) => {
            err("Error in getCluster:", { error, requestId: context.requestId });
            throw error;
          });
          const query = `EXECUTE FUNCTION \`default\`.\`new_model\`.getDivisionAssignment($styleSeasonCode, $companyCode, $divisionCode)`;
          const queryOptions = {
            parameters: {
              styleSeasonCode,
              companyCode,
              divisionCode,
            },
          };

          log("Executing get division assignment query (cache miss)", { 
            query, 
            queryOptions,
            requestId: context.requestId
          });

          const result = await cluster.cluster.query(query, queryOptions);
          
          debug("Get division assignment query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0][0], null, 2)
          });

          return result.rows[0][0];
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("Error in get division assignment resolver:", { 
        error, 
        requestId: context.requestId,
        args
      });
      throw error;
    }
  }
);

const getDivisionAssignment = {
  Query: {
    // Wrap the resolver with performance tracking
    getDivisionAssignment: withPerformanceTracking("Query", "getDivisionAssignment", getDivisionAssignmentResolver),
  },
};

export default getDivisionAssignment;
