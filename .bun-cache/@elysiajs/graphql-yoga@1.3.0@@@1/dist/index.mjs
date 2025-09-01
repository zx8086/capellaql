// src/index.ts
import {
  createYoga,
  createSchema
} from "graphql-yoga";
var yoga = ({
  path = "/graphql",
  typeDefs,
  resolvers,
  resolverValidationOptions,
  inheritResolversFromInterfaces,
  updateResolversInPlace,
  schemaExtensions,
  schema,
  ...config
}) => (app) => {
  const yoga2 = createYoga({
    cors: false,
    ...config,
    schema: schema || createSchema({
      typeDefs,
      resolvers,
      resolverValidationOptions,
      inheritResolversFromInterfaces,
      updateResolversInPlace,
      schemaExtensions
    })
  });
  return app.get(path, async ({ request }) => yoga2.fetch(request)).post(path, async ({ request }) => yoga2.fetch(request), {
    type: "none"
  });
};
var index_default = yoga;
export {
  index_default as default,
  yoga
};
