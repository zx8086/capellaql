/* src/graphql/schema.ts */

import { makeExecutableSchema } from "@graphql-tools/schema";

import typeDefs from "./typeDefs";
import resolvers from "./resolvers/index";

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});
