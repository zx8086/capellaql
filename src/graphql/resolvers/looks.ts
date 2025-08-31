/* src/graphql/resolvers/looks.ts */

import { getCluster } from "$lib/clusterProvider";
import { withPerformanceTracking } from "$lib/graphqlPerformanceTracker";
import { withSQLiteCache, SQLiteCacheKeys } from "$lib/bunSQLiteCache";
import { debug, error as err, log } from "../../telemetry/logger";

// Cached resolver implementation with SQLite cache
const looksResolver = async (_: unknown, args: { brand: string; season: string; division: string }): Promise<any> => {
  try {
    const { brand, season, division } = args;
    const cacheKey = SQLiteCacheKeys.looks(brand, season, division);

    // Use SQLite cache with 5-minute TTL for looks data
    return await withSQLiteCache(
      cacheKey,
      async () => {
        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });
        
        const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.get_looks($brand, $season, $division)`;
        const queryOptions = {
          parameters: { brand, season, division },
        };

        log("Query executed (cache miss)", { query, queryOptions });

        const result = await cluster.cluster.query(query, queryOptions);
        debug(JSON.stringify(result.rows[0], null, 2));

        return result.rows[0];
      },
      5 * 60 * 1000 // 5-minute TTL
    );
  } catch (error) {
    err("Error:", error);
    throw error;
  }
};

const looks = {
  Query: {
    // Wrap the resolver with performance tracking
    looks: withPerformanceTracking("Query", "looks", looksResolver),
  },
};

export default looks;
