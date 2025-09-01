/* src/graphql/resolvers/getAllSeasonalAssignments.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type GetAllSeasonalAssignmentsArgs, GetAllSeasonalAssignmentsArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const getAllSeasonalAssignmentsResolver = withValidation(
  GetAllSeasonalAssignmentsArgsSchema,
  async (_: unknown, args: GetAllSeasonalAssignmentsArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { styleSeasonCode, companyCode, isActive } = args;
      
      const cacheKey = SQLiteCacheKeys.getAllSeasonalAssignments(styleSeasonCode, companyCode, isActive);

      log("Get all seasonal assignments query initiated", {
        requestId: context.requestId,
        styleSeasonCode,
        companyCode,
        isActive,
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
          const query = `EXECUTE FUNCTION \`default\`.\`new_model\`.getAllSeasonalAssignments($styleSeasonCode, $companyCode)`;
          const queryOptions = {
            parameters: {
              styleSeasonCode,
              companyCode: companyCode !== undefined ? companyCode : null,
            },
          };

          log("Executing get all seasonal assignments query (cache miss)", { 
            query, 
            queryOptions,
            requestId: context.requestId
          });

          const result = await cluster.cluster.query(query, queryOptions);
          
          debug("Get all seasonal assignments query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2)
          });

          // Filter divisions based on isActive if it's provided
          if (isActive !== undefined) {
            result.rows[0] = result.rows[0].map((assignment: { divisions: any[] }) => ({
              ...assignment,
              divisions: assignment.divisions.filter((div) => div.isActive === isActive),
            }));
          }

          return result.rows[0];
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("Error in get all seasonal assignments resolver:", { 
        error, 
        requestId: context.requestId,
        args
      });
      throw error;
    }
  }
);

const getAllSeasonalAssignments = {
  Query: {
    // Wrap the resolver with performance tracking
    getAllSeasonalAssignments: withPerformanceTracking("Query", "getAllSeasonalAssignments", getAllSeasonalAssignmentsResolver),
  },
};

export default getAllSeasonalAssignments;
