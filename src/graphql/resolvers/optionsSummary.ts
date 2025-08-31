/* src/graphql/resolvers/optionsSummary.ts */

import { getCluster } from "$lib/clusterProvider";
import { debug, error as err, log } from "../../telemetry/logger";

const optionsSummary = {
  Query: {
    optionsSummary: async (
      _: unknown,
      args: {
        SalesOrganizationCode: string;
        StyleSeasonCode: string;
        DivisionCode: string;
        ActiveOption: boolean;
        SalesChannels: string[];
      }
    ): Promise<any> => {
      try {
        const { SalesOrganizationCode, StyleSeasonCode, DivisionCode, ActiveOption, SalesChannels } = args;

        const cluster = await getCluster().catch((error) => {
          err("Error in getCluster:", error);
          throw error;
        });

        const query = `EXECUTE FUNCTION \`default\`.\`_default\`.get_options_summary($SalesOrganizationCode, $StyleSeasonCode, $DivisionCode, $ActiveOption, $SalesChannels)`;

        const queryOptions = {
          parameters: {
            SalesOrganizationCode,
            StyleSeasonCode,
            DivisionCode,
            ActiveOption,
            SalesChannels,
          },
        };

        log("Query executed", { query, queryOptions });

        const result = await cluster.cluster.query(query, queryOptions);

        debug("Result:", JSON.stringify(result, null, 2));

        return result.rows[0][0];
      } catch (error) {
        err("Error:", error);
        throw error;
      }
    },
  },
};

export default optionsSummary;
