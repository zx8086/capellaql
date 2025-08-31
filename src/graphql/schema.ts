/* src/graphql/schema.ts */

import { makeExecutableSchema } from "@graphql-tools/schema";
import resolvers from "./resolvers/index";
import typeDefs from "./typeDefs";

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});
