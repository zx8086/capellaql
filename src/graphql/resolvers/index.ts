/* src/graphql/resolvers/index.ts */

import documentSearch from "./documentSearch";
import getAllSeasonalAssignments from "./getAllSeasonalAssignments";
import getDivisionAssignment from "./getDivisionalAssignment";
import imageDetails from "./imageDetails";
import imageUrlCheck from "./imageUrlCheck";
import lookDetails from "./lookDetails";
import looks from "./looks";
import looksSummary from "./looksSummary";
import looksUrlCheck from "./looksUrlCheck";
import optionsProductView from "./optionsProductView";
import optionsSummary from "./optionsSummary";

const resolvers = {
  Query: {
    ...looks.Query,
    ...looksSummary.Query,
    ...optionsSummary.Query,
    ...optionsProductView.Query,
    ...imageDetails.Query,
    ...lookDetails.Query,
    ...imageUrlCheck.Query,
    ...looksUrlCheck.Query,
    ...documentSearch.Query,
    ...getDivisionAssignment.Query,
    ...getAllSeasonalAssignments.Query,
  },
};

export default resolvers;
