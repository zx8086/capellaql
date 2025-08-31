/* src/graphql/resolvers/getAllSeasonalAssignments.ts */

import { getCluster } from "$lib/clusterProvider";
import { debug, error as err, log } from "../../telemetry/logger";

const getAllSeasonalAssignments = {
  Query: {
    getAllSeasonalAssignments: async (
      _: unknown,
      args: {
        styleSeasonCode: string;
        companyCode?: string;
        isActive?: boolean;
      }
    ): Promise<any> => {
      try {
        const { styleSeasonCode, companyCode, isActive } = args;

        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });
        const query = `EXECUTE FUNCTION \`default\`.\`new_model\`.getAllSeasonalAssignments($styleSeasonCode, $companyCode)`;

        const queryOptions = {
          parameters: {
            styleSeasonCode,
            companyCode: companyCode !== undefined ? companyCode : null,
          },
        };

        log("Query executed", { query, queryOptions });

        const result = await cluster.cluster.query(query, queryOptions);

        debug(JSON.stringify(result, null, 2));

        // Filter divisions based on isActive if it's provided
        if (isActive !== undefined) {
          result.rows[0] = result.rows[0].map((assignment: { divisions: any[] }) => ({
            ...assignment,
            divisions: assignment.divisions.filter((div) => div.isActive === isActive),
          }));
        }

        return result.rows[0];
      } catch (error) {
        err("Error:", error);
        throw error;
      }
    },
  },
};

export default getAllSeasonalAssignments;
