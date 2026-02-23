/* src/graphql/resolvers/getDivisionalAssignment.ts */

import { cacheEntities, getEntity, SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { connectionManager, QueryExecutor } from "$lib/couchbase";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { QueryFingerprintBuilder } from "$lib/queryFingerprint";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type GetDivisionAssignmentArgs, GetDivisionAssignmentArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const getDivisionAssignmentResolver = withValidation(
  GetDivisionAssignmentArgsSchema,
  async (_: unknown, args: GetDivisionAssignmentArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { styleSeasonCode, companyCode, divisionCode } = args;

      // Use QueryFingerprintBuilder for SIMD-accelerated cache key generation
      const _cacheKey = QueryFingerprintBuilder.for("getDivisionAssignment")
        .withVariables({ styleSeasonCode, companyCode, divisionCode })
        .withPrefix("gql")
        .build();

      log("Get division assignment query initiated", {
        requestId: context.requestId,
        styleSeasonCode,
        companyCode,
        divisionCode,
        user: context.user?.id,
      });

      // Check entity cache first (may have been populated by getAllSeasonalAssignments query)
      const entityKey = SQLiteCacheKeys.entityDivisionAssignment(styleSeasonCode, companyCode, divisionCode);
      const cached = await getEntity<any>(entityKey, {
        userScoped: true,
        userId: context.user?.id,
      });
      if (cached) {
        log("Division assignment entity cache hit", {
          requestId: context.requestId,
          styleSeasonCode,
          companyCode,
          divisionCode,
          cacheStatus: "entity-hit",
        });
        return cached;
      }

      // Use entity key for cache (enables reuse from getAllSeasonalAssignments query)
      const userScopedKey = context.user?.id ? `user:${context.user.id}:${entityKey}` : entityKey;
      return await withSQLiteCache(
        userScopedKey,
        async () => {
          const conn = await connectionManager.getConnection();

          const query = `EXECUTE FUNCTION \`default\`.\`new_model\`.getDivisionAssignment($styleSeasonCode, $companyCode, $divisionCode)`;
          const parameters = { styleSeasonCode, companyCode, divisionCode };

          log("Executing get division assignment query (cache miss)", {
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

          debug("Get division assignment query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: result.rows?.[0]?.[0] ? JSON.stringify(result.rows[0][0], null, 2) : "empty",
          });

          // Handle empty results gracefully - return null for missing assignment
          if (!result.rows?.length || !result.rows[0]?.[0]) {
            return null;
          }

          const data = result.rows[0][0];

          // Cache as entity for future reuse
          cacheEntities(data, () => entityKey, {
            requiredFields: ["styleSeasonCode", "companyCode"],
            ttlMs: 5 * 60 * 1000,
            userScoped: true,
            userId: context.user?.id,
          });

          return data;
        },
        5 * 60 * 1000 // 5-minute TTL
      );
    } catch (error) {
      err("Error in get division assignment resolver:", error, {
        requestId: context.requestId,
        args,
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
