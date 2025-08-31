/* src/graphql/resolvers/getDivisionalAssignment.ts */

import { getCluster } from "$lib/clusterProvider";
import { debug, error as err, log } from "../../telemetry/logger";

const getDivisionAssignment = {
  Query: {
    getDivisionAssignment: async (
      _: unknown,
      args: {
        styleSeasonCode: string;
        companyCode: string;
        divisionCode: string;
      }
    ): Promise<any> => {
      try {
        const { styleSeasonCode, companyCode, divisionCode } = args;

        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });
        const query = `EXECUTE FUNCTION \`default\`.\`new_model\`.getDivisionAssignment($styleSeasonCode, $companyCode, $divisionCode)`;

        const queryOptions = {
          parameters: {
            styleSeasonCode,
            companyCode,
            divisionCode,
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

export default getDivisionAssignment;
