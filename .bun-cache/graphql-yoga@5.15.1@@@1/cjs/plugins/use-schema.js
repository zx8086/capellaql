"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSchema = void 0;
const graphql_1 = require("graphql");
const promise_helpers_1 = require("@whatwg-node/promise-helpers");
const useSchema = (schemaDef) => {
    if (schemaDef == null) {
        return {};
    }
    if ((0, graphql_1.isSchema)(schemaDef)) {
        return {
            onPluginInit({ setSchema }) {
                setSchema(schemaDef);
            },
        };
    }
    if ('then' in schemaDef) {
        let schema;
        return {
            onRequestParse() {
                return {
                    onRequestParseDone() {
                        if (!schema) {
                            return (0, promise_helpers_1.handleMaybePromise)(() => schemaDef, schemaDef => {
                                schema = schemaDef;
                            });
                        }
                    },
                };
            },
            onEnveloped({ setSchema }) {
                if (!schema) {
                    throw new Error(`You provide a promise of a schema but it hasn't been resolved yet. Make sure you use this plugin with GraphQL Yoga.`);
                }
                setSchema(schema);
            },
        };
    }
    const schemaByRequest = new WeakMap();
    return {
        onRequestParse({ request, serverContext }) {
            return {
                onRequestParseDone() {
                    return (0, promise_helpers_1.handleMaybePromise)(() => schemaDef({
                        ...serverContext,
                        request,
                    }), schemaDef => {
                        schemaByRequest.set(request, schemaDef);
                    });
                },
            };
        },
        onEnveloped({ setSchema, context }) {
            if (context?.request == null) {
                throw new Error('Request object is not available in the context. Make sure you use this plugin with GraphQL Yoga.');
            }
            const schema = schemaByRequest.get(context.request);
            if (schema == null) {
                throw new Error(`No schema found for this request. Make sure you use this plugin with GraphQL Yoga.`);
            }
            setSchema(schema);
        },
    };
};
exports.useSchema = useSchema;
