// src/cookies.ts
import { parse, serialize } from "cookie";
import decode from "fast-decode-uri-component";

// src/universal/utils.ts
var isBun = typeof Bun < "u";

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
var isNotEmpty = (obj) => {
  if (!obj) return !1;
  for (let _ in obj) return !0;
  return !1;
};
var supportPerMethodInlineHandler = (() => {
  if (typeof Bun > "u") return !0;
  let semver = Bun.version.split(".");
  return !(+semver[0] < 1 || +semver[1] < 2 || +semver[2] < 14);
})();

// src/error.ts
import { Value } from "@sinclair/typebox/value";
var env = typeof Bun < "u" ? Bun.env : typeof process < "u" ? process?.env : void 0, ERROR_CODE = Symbol("ElysiaErrorCode"), isProduction = (env?.NODE_ENV ?? env?.ENV) === "production";

// src/cookies.ts
var serializeCookie = (cookies) => {
  if (!cookies || !isNotEmpty(cookies)) return;
  let set = [];
  for (let [key, property] of Object.entries(cookies)) {
    if (!key || !property) continue;
    let value = property.value;
    value != null && set.push(
      serialize(
        key,
        typeof value == "object" ? JSON.stringify(value) : value + "",
        property
      )
    );
  }
  if (set.length !== 0)
    return set.length === 1 ? set[0] : set;
};

// src/adapter/utils.ts
var handleFile = (response, set) => {
  if (!isBun && response instanceof Promise)
    return response.then((res) => handleFile(res, set));
  let size = response.size, immutable = set && (set.status === 206 || set.status === 304 || set.status === 412 || set.status === 416), defaultHeader = immutable ? {
    "transfer-encoding": "chunked"
  } : {
    "accept-ranges": "bytes",
    "content-range": size ? `bytes 0-${size - 1}/${size}` : void 0,
    "transfer-encoding": "chunked"
  };
  if (!set && !size) return new Response(response);
  if (!set)
    return new Response(response, {
      headers: defaultHeader
    });
  if (set.headers instanceof Headers) {
    for (let key of Object.keys(defaultHeader))
      key in set.headers && set.headers.append(key, defaultHeader[key]);
    return immutable && (set.headers.delete("content-length"), set.headers.delete("accept-ranges")), new Response(response, set);
  }
  return isNotEmpty(set.headers) ? new Response(response, {
    status: set.status,
    headers: Object.assign(defaultHeader, set.headers)
  }) : new Response(response, {
    status: set.status,
    headers: defaultHeader
  });
}, parseSetCookies = (headers, setCookie) => {
  if (!headers) return headers;
  headers.delete("set-cookie");
  for (let i = 0; i < setCookie.length; i++) {
    let index = setCookie[i].indexOf("=");
    headers.append(
      "set-cookie",
      `${setCookie[i].slice(0, index)}=${setCookie[i].slice(index + 1) || ""}`
    );
  }
  return headers;
}, responseToSetHeaders = (response, set) => {
  if (set?.headers) {
    if (response)
      if (hasHeaderShorthand)
        Object.assign(set.headers, response.headers.toJSON());
      else
        for (let [key, value] of response.headers.entries())
          key in set.headers && (set.headers[key] = value);
    return set.status === 200 && (set.status = response.status), set.headers["content-encoding"] && delete set.headers["content-encoding"], set;
  }
  if (!response)
    return {
      headers: {},
      status: set?.status ?? 200
    };
  if (hasHeaderShorthand)
    return set = {
      headers: response.headers.toJSON(),
      status: set?.status ?? 200
    }, set.headers["content-encoding"] && delete set.headers["content-encoding"], set;
  set = {
    headers: {},
    status: set?.status ?? 200
  };
  for (let [key, value] of response.headers.entries())
    key !== "content-encoding" && key in set.headers && (set.headers[key] = value);
  return set;
}, createStreamHandler = ({ mapResponse, mapCompactResponse }) => async (generator, set, request) => {
  let init = generator.next?.();
  if (init instanceof Promise && (init = await init), init?.value instanceof ReadableStream)
    generator = init.value;
  else if (init && (typeof init?.done > "u" || init?.done))
    return set ? mapResponse(init.value, set, request) : mapCompactResponse(init.value, request);
  let isSSE = (
    // @ts-ignore First SSE result is wrapped with sse()
    init?.value?.sse ?? // @ts-ignore ReadableStream is wrapped with sse()
    generator?.sse ?? // User explicitly set content-type to SSE
    set?.headers["content-type"]?.startsWith("text/event-stream")
  ), format = isSSE ? (data) => `data: ${data}

` : (data) => data, contentType = isSSE ? "text/event-stream" : init?.value && typeof init?.value == "object" ? "application/json" : "text/plain";
  return set?.headers ? (set.headers["transfer-encoding"] || (set.headers["transfer-encoding"] = "chunked"), set.headers["content-type"] || (set.headers["content-type"] = contentType), set.headers["cache-control"] || (set.headers["cache-control"] = "no-cache")) : set = {
    status: 200,
    headers: {
      "content-type": contentType,
      "transfer-encoding": "chunked",
      "cache-control": "no-cache",
      connection: "keep-alive"
    }
  }, new Response(
    new ReadableStream({
      async start(controller) {
        let end = !1;
        if (request?.signal?.addEventListener("abort", () => {
          end = !0;
          try {
            controller.close();
          } catch {
          }
        }), !(!init || init.value instanceof ReadableStream)) {
          if (init.value !== void 0 && init.value !== null)
            if (init.value.toSSE)
              controller.enqueue(init.value.toSSE());
            else if (typeof init.value == "object")
              try {
                controller.enqueue(
                  format(JSON.stringify(init.value))
                );
              } catch {
                controller.enqueue(
                  format(init.value.toString())
                );
              }
            else controller.enqueue(format(init.value.toString()));
        }
        try {
          for await (let chunk of generator) {
            if (end) break;
            if (chunk != null)
              if (chunk.toSSE)
                controller.enqueue(chunk.toSSE());
              else {
                if (typeof chunk == "object")
                  try {
                    controller.enqueue(
                      format(JSON.stringify(chunk))
                    );
                  } catch {
                    controller.enqueue(
                      format(chunk.toString())
                    );
                  }
                else
                  controller.enqueue(format(chunk.toString()));
                isSSE || await new Promise(
                  (resolve) => setTimeout(() => resolve(), 0)
                );
              }
          }
        } catch (error) {
          console.warn(error);
        }
        try {
          controller.close();
        } catch {
        }
      }
    }),
    set
  );
};
async function* streamResponse(response) {
  let body = response.body;
  if (!body) return;
  let reader = body.getReader(), decoder = new TextDecoder();
  try {
    for (; ; ) {
      let { done, value } = await reader.read();
      if (done) break;
      typeof value == "string" ? yield value : yield decoder.decode(value);
    }
  } finally {
    reader.releaseLock();
  }
}
var handleSet = (set) => {
  if (typeof set.status == "string" && (set.status = StatusMap[set.status]), set.cookie && isNotEmpty(set.cookie)) {
    let cookie = serializeCookie(set.cookie);
    cookie && (set.headers["set-cookie"] = cookie);
  }
  set.headers["set-cookie"] && Array.isArray(set.headers["set-cookie"]) && (set.headers = parseSetCookies(
    new Headers(set.headers),
    set.headers["set-cookie"]
  ));
}, createResponseHandler = (handler) => {
  let handleStream = createStreamHandler(handler);
  return (response, set, request) => {
    let isCookieSet = !1;
    if (set.headers instanceof Headers)
      for (let key of set.headers.keys())
        if (key === "set-cookie") {
          if (isCookieSet) continue;
          isCookieSet = !0;
          for (let cookie of set.headers.getSetCookie())
            response.headers.append("set-cookie", cookie);
        } else response.headers.append(key, set.headers?.get(key) ?? "");
    else
      for (let key in set.headers)
        response.headers.append(
          key,
          set.headers[key]
        );
    let status = set.status ?? 200;
    return response.status !== status && status !== 200 && (response.status <= 300 || response.status > 400) ? response.text().then((value) => {
      let newResponse = new Response(value, {
        headers: response.headers,
        status: set.status
      });
      return !newResponse.headers.has("content-length") && newResponse.headers.get(
        "transfer-encoding"
      ) === "chunked" ? handleStream(
        streamResponse(newResponse),
        responseToSetHeaders(newResponse, set),
        request
      ) : newResponse;
    }) : !response.headers.has("content-length") && response.headers.get("transfer-encoding") === "chunked" ? handleStream(
      streamResponse(response),
      responseToSetHeaders(response, set),
      request
    ) : response;
  };
};
export {
  createResponseHandler,
  createStreamHandler,
  handleFile,
  handleSet,
  parseSetCookies,
  responseToSetHeaders,
  streamResponse
};
