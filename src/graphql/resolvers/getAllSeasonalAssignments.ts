/* src/graphql/resolvers/getAllSeasonalAssignments.ts */

import { cacheEntities, SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { connectionManager, QueryExecutor } from "$lib/couchbase";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import {
  type GetAllSeasonalAssignmentsArgs,
  GetAllSeasonalAssignmentsArgsSchema,
  withValidation,
} from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const getAllSeasonalAssignmentsResolver = withValidation(
  GetAllSeasonalAssignmentsArgsSchema,
  async (_: unknown, args: GetAllSeasonalAssignmentsArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { styleSeasonCode, companyCode, isActive } = args;

      // Use QueryFingerprintBuilder for SIMD-accelerated cache key generation
      const cacheKey = QueryFingerprintBuilder.for("getAllSeasonalAssignments")
        .withVariables({ styleSeasonCode, companyCode, isActive })
        .withPrefix("gql")
        .build();

      log("Get all seasonal assignments query initiated", {
        requestId: context.requestId,
        styleSeasonCode,
        companyCode,
        isActive,
        user: context.user?.id,
      });

      // Use SQLite cache with 5-minute TTL for assignments
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const conn = await connectionManager.getConnection();

          const query = `EXECUTE FUNCTION \`default\`.\`new_model\`.getAllSeasonalAssignments($styleSeasonCode, $companyCode)`;
          const parameters = {
            styleSeasonCode,
            companyCode: companyCode !== undefined ? companyCode : null,
          };

          log("Executing get all seasonal assignments query (cache miss)", {
            query,
            parameters,
            requestId: context.requestId,
          });

          const result = await QueryExecutor.execute(conn.cluster, query, {
            parameters,
            usePreparedStatement: true,
            queryContext: "default.new_model",
            requestId: context.requestId,
          });

          debug("Get all seasonal assignments query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: result.rows?.[0] ? JSON.stringify(result.rows[0], null, 2) : "empty",
          });

          // Handle empty results gracefully - return empty array
          if (!result.rows?.length || !result.rows[0]) {
            return [];
          }

          // Filter divisions based on isActive if it's provided
          let data = result.rows[0];
          if (isActive !== undefined) {
            data = data.map((assignment: { divisions: any[] }) => ({
              ...assignment,
              divisions: assignment.divisions?.filter((div) => div.isActive === isActive) || [],
            }));
          }

          // Cache individual division assignments for getDivisionAssignment reuse
          // This iterates through assignments and their divisions
          for (const assignment of data || []) {
            if (assignment.divisions) {
              for (const division of assignment.divisions) {
                cacheEntities(
                  { ...assignment, division },
                  (item: any) =>
                    SQLiteCacheKeys.entityDivisionAssignment(
                      item.styleSeasonCode,
                      item.companyCode,
                      item.division?.code || ""
                    ),
                  {
                    requiredFields: ["styleSeasonCode", "companyCode"],
                    ttlMs: 5 * 60 * 1000,
                    userScoped: true,
                    userId: context.user?.id,
                  }
                );
              }
            }
          }

          return data;
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("Error in get all seasonal assignments resolver:", error, {
        requestId: context.requestId,
        args,
      });
      throw error;
    }
  }
);

const getAllSeasonalAssignments = {
  Query: {
    // Wrap the resolver with performance tracking
    getAllSeasonalAssignments: withPerformanceTracking(
      "Query",
      "getAllSeasonalAssignments",
      getAllSeasonalAssignmentsResolver
    ),
  },
};

export default getAllSeasonalAssignments;
