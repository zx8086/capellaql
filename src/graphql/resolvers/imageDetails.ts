/* src/graphql/resolvers/imageDetails.ts */

import { getCluster } from "$lib/clusterProvider";
import { debug, error as err, log } from "../../telemetry/logger";

const imageDetails = {
  Query: {
    imageDetails: async (
      _: unknown,
      args: {
        divisionCode: string;
        styleSeasonCode: string;
        styleCode: string;
      }
    ): Promise<any> => {
      try {
        const { divisionCode, styleSeasonCode, styleCode } = args;

        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });
        const query = `EXECUTE FUNCTION \`default\`.\`_default\`.getImageDetails($divisionCode, $styleSeasonCode, $styleCode)`;

        const queryOptions = {
          parameters: {
            divisionCode,
            styleSeasonCode,
            styleCode,
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

export default imageDetails;
