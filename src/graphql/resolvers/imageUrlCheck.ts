/* src/graphql/resolvers/imageUrlCheck.ts */

import { getCluster } from "$lib/clusterProvider";
import { debug, error as err, log } from "../../telemetry/logger";

const imageUrlCheck = {
  Query: {
    getImageUrlCheck: async (_: unknown, args: { divisions: string[]; season: string }): Promise<any> => {
      try {
        const { divisions, season } = args;

        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });
        const query = `EXECUTE FUNCTION \`default\`.\`_default\`.getImageUrlCheck($divisions, $season)`;

        const queryOptions = {
          parameters: {
            divisions,
            season,
          },
        };

        log("Query executed", { query, queryOptions });

        const result = await cluster.cluster.query(query, queryOptions);

        debug(JSON.stringify(result, null, 2));

        return result.rows[0];
      } catch (error) {
        err("Error:", error);
        throw error;
      }
    },
  },
};

export default imageUrlCheck;
