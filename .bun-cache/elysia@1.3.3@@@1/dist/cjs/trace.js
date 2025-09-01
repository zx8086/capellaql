"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// src/trace.ts
var trace_exports = {};
__export(trace_exports, {
  ELYSIA_TRACE: () => ELYSIA_TRACE,
  createTracer: () => createTracer
});
module.exports = __toCommonJS(trace_exports);

// src/utils.ts
var hasHeaderShorthand = "toJSON" in new Headers();
var primitiveHooks = [
  "start",
  "request",
  "parse",
  "transform",
  "resolve",
  "beforeHandle",
  "afterHandle",
  "mapResponse",
  "afterResponse",
  "trace",
  "error",
  "stop",
  "body",
  "headers",
  "params",
  "query",
  "response",
  "type",
  "detail"
], primitiveHookMap = primitiveHooks.reduce(
  (acc, x) => (acc[x] = !0, acc),
  {}
);
var isBun2 = typeof Bun < "u", hasBunHash = isBun2 && typeof Bun.hash == "function";
var StatusMap = {
  Continue: 100,
  "Switching Protocols": 101,
  Processing: 102,
  "Early Hints": 103,
  OK: 200,
  Created: 201,
  Accepted: 202,
  "Non-Authoritative Information": 203,
  "No Content": 204,
  "Reset Content": 205,
  "Partial Content": 206,
  "Multi-Status": 207,
  "Already Reported": 208,
  "Multiple Choices": 300,
  "Moved Permanently": 301,
  Found: 302,
  "See Other": 303,
  "Not Modified": 304,
  "Temporary Redirect": 307,
  "Permanent Redirect": 308,
  "Bad Request": 400,
  Unauthorized: 401,
  "Payment Required": 402,
  Forbidden: 403,
  "Not Found": 404,
  "Method Not Allowed": 405,
  "Not Acceptable": 406,
  "Proxy Authentication Required": 407,
  "Request Timeout": 408,
  Conflict: 409,
  Gone: 410,
  "Length Required": 411,
  "Precondition Failed": 412,
  "Payload Too Large": 413,
  "URI Too Long": 414,
  "Unsupported Media Type": 415,
  "Range Not Satisfiable": 416,
  "Expectation Failed": 417,
  "I'm a teapot": 418,
  "Misdirected Request": 421,
  "Unprocessable Content": 422,
  Locked: 423,
  "Failed Dependency": 424,
  "Too Early": 425,
  "Upgrade Required": 426,
  "Precondition Required": 428,
  "Too Many Requests": 429,
  "Request Header Fields Too Large": 431,
  "Unavailable For Legal Reasons": 451,
  "Internal Server Error": 500,
  "Not Implemented": 501,
  "Bad Gateway": 502,
  "Service Unavailable": 503,
  "Gateway Timeout": 504,
  "HTTP Version Not Supported": 505,
  "Variant Also Negotiates": 506,
  "Insufficient Storage": 507,
  "Loop Detected": 508,
  "Not Extended": 510,
  "Network Authentication Required": 511
}, InvertedStatusMap = Object.fromEntries(
  Object.entries(StatusMap).map(([k, v]) => [v, k])
);
var encoder = new TextEncoder();
var ELYSIA_FORM_DATA = Symbol("ElysiaFormData"), ELYSIA_REQUEST_ID = Symbol("ElysiaRequestId");
var supportPerMethodInlineHandler = (() => {
  if (typeof Bun > "u") return !0;
  let semver = Bun.version.split(".");
  return !(+semver[0] < 1 || +semver[1] < 2 || +semver[2] < 14);
})();

// src/trace.ts
var ELYSIA_TRACE = Symbol("ElysiaTrace"), createProcess = () => {
  let { promise, resolve } = Promise.withResolvers(), { promise: end, resolve: resolveEnd } = Promise.withResolvers(), { promise: error, resolve: resolveError } = Promise.withResolvers(), callbacks = [], callbacksEnd = [];
  return [
    (callback) => (callback && callbacks.push(callback), promise),
    (process) => {
      let processes = [], resolvers = [], groupError = null;
      for (let i = 0; i < (process.total ?? 0); i++) {
        let { promise: promise2, resolve: resolve2 } = Promise.withResolvers(), { promise: end2, resolve: resolveEnd2 } = Promise.withResolvers(), { promise: error2, resolve: resolveError2 } = Promise.withResolvers(), callbacks2 = [], callbacksEnd2 = [];
        processes.push((callback) => (callback && callbacks2.push(callback), promise2)), resolvers.push((process2) => {
          let result2 = {
            ...process2,
            end: end2,
            error: error2,
            index: i,
            onStop(callback) {
              return callback && callbacksEnd2.push(callback), end2;
            }
          };
          resolve2(result2);
          for (let i2 = 0; i2 < callbacks2.length; i2++)
            callbacks2[i2](result2);
          return (error3 = null) => {
            let end3 = performance.now();
            error3 && (groupError = error3);
            let detail = {
              end: end3,
              error: error3,
              get elapsed() {
                return end3 - process2.begin;
              }
            };
            for (let i2 = 0; i2 < callbacksEnd2.length; i2++)
              callbacksEnd2[i2](detail);
            resolveEnd2(end3), resolveError2(error3);
          };
        });
      }
      let result = {
        ...process,
        end,
        error,
        onEvent(callback) {
          for (let i = 0; i < processes.length; i++)
            processes[i](callback);
        },
        onStop(callback) {
          return callback && callbacksEnd.push(callback), end;
        }
      };
      resolve(result);
      for (let i = 0; i < callbacks.length; i++) callbacks[i](result);
      return {
        resolveChild: resolvers,
        resolve(error2 = null) {
          let end2 = performance.now();
          !error2 && groupError && (error2 = groupError);
          let detail = {
            end: end2,
            error: error2,
            get elapsed() {
              return end2 - process.begin;
            }
          };
          for (let i = 0; i < callbacksEnd.length; i++)
            callbacksEnd[i](detail);
          resolveEnd(end2), resolveError(error2);
        }
      };
    }
  ];
}, createTracer = (traceListener) => (context) => {
  let [onRequest, resolveRequest] = createProcess(), [onParse, resolveParse] = createProcess(), [onTransform, resolveTransform] = createProcess(), [onBeforeHandle, resolveBeforeHandle] = createProcess(), [onHandle, resolveHandle] = createProcess(), [onAfterHandle, resolveAfterHandle] = createProcess(), [onError, resolveError] = createProcess(), [onMapResponse, resolveMapResponse] = createProcess(), [onAfterResponse, resolveAfterResponse] = createProcess();
  return traceListener({
    // @ts-ignore
    id: context[ELYSIA_REQUEST_ID],
    context,
    set: context.set,
    // @ts-ignore
    onRequest,
    // @ts-ignore
    onParse,
    // @ts-ignore
    onTransform,
    // @ts-ignore
    onBeforeHandle,
    // @ts-ignore
    onHandle,
    // @ts-ignore
    onAfterHandle,
    // @ts-ignore
    onMapResponse,
    // @ts-ignore
    onAfterResponse,
    // @ts-ignore
    onError,
    time: Date.now(),
    store: context.store
  }), {
    request: resolveRequest,
    parse: resolveParse,
    transform: resolveTransform,
    beforeHandle: resolveBeforeHandle,
    handle: resolveHandle,
    afterHandle: resolveAfterHandle,
    error: resolveError,
    mapResponse: resolveMapResponse,
    afterResponse: resolveAfterResponse
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ELYSIA_TRACE,
  createTracer
});
