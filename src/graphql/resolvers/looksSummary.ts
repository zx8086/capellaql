/* src/graphql/resolvers/looksSummary.ts */

import { getCluster } from "$lib/clusterProvider";
import { debug, error as err, log } from "../../telemetry/logger";

const looksSummary = {
  Query: {
    looksSummary: async (_: unknown, args: { brand: string; season: string; division: string }): Promise<any> => {
      try {
        const { brand, season, division } = args;

        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });
        const query = `EXECUTE FUNCTION \`default\`.\`media_assets\`.get_looks_summary($brand, $season, $division)`;

        const queryOptions = {
          parameters: {
            brand,
            season,
            division,
          },
        };

        log("Query executed", { query, queryOptions });

        const result = await cluster.cluster.query(query, queryOptions);

        debug(JSON.stringify(result, null, 2));

        return result.rows[0][0];
      } catch (error) {
        err("Error:", error);
        throw error;
      }
    },
  },
};

export default looksSummary;
