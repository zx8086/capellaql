/* src/graphql/resolvers/lookDetails.ts */

import { getCluster } from "$lib/clusterProvider";
import { debug, error as err, log } from "../../telemetry/logger";
import { withSQLiteCache, SQLiteCacheKeys } from "$lib/bunSQLiteCache";

const lookDetails = {
  Query: {
    lookDetails: async (_: unknown, args: { lookDocKey: string }): Promise<any> => {
      try {
        const { lookDocKey } = args;
        const cacheKey = SQLiteCacheKeys.lookDetails(lookDocKey);

        return await withSQLiteCache(
          cacheKey,
          async () => {
            const cluster = await getCluster().catch((error) => {
              err("Error in getCluster:", error);
              throw error;
            });
            
            const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.getLookDetails($lookDocKey)`;
            const queryOptions = { parameters: { lookDocKey } };

            log("Query executed (cache miss)", { query, queryOptions });

            const result = await cluster.cluster.query(query, queryOptions);
            debug(JSON.stringify(result, null, 2));

            return result.rows[0][0];
          },
          10 * 60 * 1000 // 10-minute TTL for look details
        );
      } catch (error) {
        err("Error:", error);
        throw error;
      }
    },
  },
};

export default lookDetails;
