/* src/graphql/resolvers/looksUrlCheck.ts */

import { SQLiteCacheKeys, withSQLiteCache } from "$lib/bunSQLiteCache";
import { connectionManager, QueryExecutor } from "$lib/couchbase";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { debug, error as err, log } from "../../telemetry/logger";
import type { GraphQLContext } from "../context";
import { type LooksUrlCheckArgs, LooksUrlCheckArgsSchema, withValidation } from "../validation/schemas";

// Enhanced resolver with validation, caching, and context
const looksUrlCheckResolver = withValidation(
  LooksUrlCheckArgsSchema,
  async (_: unknown, args: LooksUrlCheckArgs, context: GraphQLContext): Promise<any> => {
    try {
      const { divisions, season } = args;

      const cacheKey = SQLiteCacheKeys.looksUrlCheck(divisions, season);

      log("Looks URL check query initiated", {
        requestId: context.requestId,
        divisions: divisions.slice(0, 5), // Show first 5 for logging
        divisionsCount: divisions.length,
        season,
        user: context.user?.id,
      });

      // Use SQLite cache with 2-minute TTL for URL checks
      return await withSQLiteCache(
        cacheKey,
        async () => {
          const conn = await connectionManager.getConnection();

          const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.getLooksUrlCheck($divisions, $season)`;
          const parameters = { divisions, season };

          log("Executing looks URL check query (cache miss)", {
            query,
            parameters,
            requestId: context.requestId,
          });

          const result = await QueryExecutor.execute(conn.cluster, query, {
            parameters,
            usePreparedStatement: true,
            queryContext: "default.media_assets",
            requestId: context.requestId,
          });

          debug("Looks URL check query result", {
            requestId: context.requestId,
            rowCount: result.rows?.length || 0,
            result: JSON.stringify(result.rows[0], null, 2),
          });

          return result.rows[0];
        },
        2 * 60 * 1000 // 2-minute TTL
      );
    } catch (error) {
      err("Error in looks URL check resolver:", {
        error,
        requestId: context.requestId,
        args,
      });
      throw error;
    }
  }
);

const looksUrlCheck = {
  Query: {
    // Wrap the resolver with performance tracking
    getLooksUrlCheck: withPerformanceTracking("Query", "getLooksUrlCheck", looksUrlCheckResolver),
  },
};

export default looksUrlCheck;
