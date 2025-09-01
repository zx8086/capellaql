"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withState = withState;
exports.getMostSpecificState = getMostSpecificState;
function withState(pluginFactory) {
    const states = {};
    function getProp(scope, key) {
        return {
            get() {
                if (!states[scope])
                    states[scope] = new WeakMap();
                let value = states[scope].get(key);
                if (!value)
                    states[scope].set(key, (value = {}));
                return value;
            },
            enumerable: true,
        };
    }
    function getState(payload) {
        if (!payload) {
            return undefined;
        }
        let { executionRequest, context, request } = payload;
        const state = {};
        const defineState = (scope, key) => Object.defineProperty(state, scope, getProp(scope, key));
        if (executionRequest) {
            defineState('forSubgraphExecution', executionRequest);
            // ExecutionRequest can happen outside of any Graphql Operation for Gateway internal usage like Introspection queries.
            // We check for `params` to be present, which means it's actually a GraphQL context.
            if (executionRequest.context?.params)
                context = executionRequest.context;
        }
        if (context) {
            defineState('forOperation', context);
            if (context.request)
                request = context.request;
        }
        if (request) {
            defineState('forRequest', request);
        }
        return state;
    }
    function addStateGetters(src) {
        const result = {};
        for (const [hookName, hook] of Object.entries(src)) {
            if (typeof hook !== 'function') {
                result[hookName] = hook;
            }
            else {
                result[hookName] = {
                    [hook.name](payload, ...args) {
                        if (payload && (payload.request || payload.context || payload.executionRequest)) {
                            return hook({
                                ...payload,
                                get state() {
                                    return getState(payload);
                                },
                            }, ...args);
                        }
                        else {
                            return hook(payload, ...args);
                        }
                    },
                }[hook.name];
            }
        }
        return result;
    }
    const { instrumentation, ...hooks } = pluginFactory(getState);
    const pluginWithState = addStateGetters(hooks);
    if (instrumentation) {
        pluginWithState.instrumentation = addStateGetters(instrumentation);
    }
    return pluginWithState;
}
function getMostSpecificState(state = {}) {
    const { forOperation, forRequest, forSubgraphExecution } = state;
    return forSubgraphExecution ?? forOperation ?? forRequest;
}
