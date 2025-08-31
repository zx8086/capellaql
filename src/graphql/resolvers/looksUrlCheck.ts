/* src/graphql/resolvers/looksUrlCheck.ts */

import { log, error as err, debug } from "../../telemetry/logger";
import { getCluster } from "$lib/clusterProvider";

const looksUrlCheck = {
  Query: {
    getLooksUrlCheck: async (
      _: unknown,
      args: { divisions: string[]; season: string },
    ): Promise<any> => {
      try {
        const { divisions, season } = args;

        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });
        const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.getLooksUrlCheck($divisions, $season)`;

        const queryOptions = {
          parameters: {
            divisions,
            season,
          },
        };

        log("Query executed", { query, queryOptions });

        let result = await cluster.cluster.query(query, queryOptions);

        debug(JSON.stringify(result, null, 2));

        // Assuming the Couchbase function returns an array of objects with divisionCode and urls
        return result.rows[0];
      } catch (error) {
        err("Error:", error);
        throw error;
      }
    },
  },
};

export default looksUrlCheck;
