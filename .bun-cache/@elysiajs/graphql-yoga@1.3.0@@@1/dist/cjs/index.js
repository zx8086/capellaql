"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default,
  yoga: () => yoga
});
module.exports = __toCommonJS(index_exports);
var import_graphql_yoga = require("graphql-yoga");
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
  const yoga2 = (0, import_graphql_yoga.createYoga)({
    cors: false,
    ...config,
    schema: schema || (0, import_graphql_yoga.createSchema)({
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  yoga
});
