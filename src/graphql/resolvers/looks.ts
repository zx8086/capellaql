/* src/graphql/resolvers/looks.ts */

import { getCluster } from "$lib/clusterProvider";
import { debug, error as err, log } from "../../telemetry/logger";

const looks = {
  Query: {
    looks: async (_: unknown, args: { brand: string; season: string; division: string }): Promise<any> => {
      try {
        const { brand, season, division } = args;

        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });
        const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.get_looks($brand, $season, $division)`;

        const queryOptions = {
          parameters: {
            brand,
            season,
            division,
          },
        };

        log("Query executed", { query, queryOptions });

        const result = await cluster.cluster.query(query, queryOptions);

        debug(JSON.stringify(result.rows[0], null, 2));

        return result.rows[0];
      } catch (error) {
        err("Error:", error);
        throw error;
      }
    },
  },
};

export default looks;
