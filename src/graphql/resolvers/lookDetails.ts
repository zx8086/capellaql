/* src/graphql/resolvers/lookDetails.ts */

import { log, error as err, debug } from "../../telemetry/logger";
import { getCluster } from "$lib/clusterProvider";

const lookDetails = {
  Query: {
    lookDetails: async (
      _: unknown,
      args: { lookDocKey: string },
    ): Promise<any> => {
      try {
        const { lookDocKey } = args;

        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });
        const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.getLookDetails($lookDocKey)`;

        const queryOptions = {
          parameters: {
            lookDocKey,
          },
        };

        log("Query executed", { query, queryOptions });

        let result = await cluster.cluster.query(query, queryOptions);

        debug(JSON.stringify(result, null, 2));

        return result.rows[0][0];
      } catch (error) {
        err("Error:", error);
        throw error;
      }
    },
  },
};

export default lookDetails;
