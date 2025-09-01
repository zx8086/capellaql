"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
  mod
)), __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// src/adapter/web-standard/handler.ts
var handler_exports = {};
__export(handler_exports, {
  createStaticHandler: () => createStaticHandler,
  errorToResponse: () => errorToResponse,
  mapCompactResponse: () => mapCompactResponse,
  mapEarlyResponse: () => mapEarlyResponse,
  mapResponse: () => mapResponse
});
module.exports = __toCommonJS(handler_exports);

// src/cookies.ts
var import_cookie = require("cookie"), import_fast_decode_uri_component = __toESM(require("fast-decode-uri-component"));

// src/universal/utils.ts
var isBun = typeof Bun < "u";

// src/universal/file.ts
var mime = {
  aac: "audio/aac",
  abw: "application/x-abiword",
  ai: "application/postscript",
  arc: "application/octet-stream",
  avi: "video/x-msvideo",
  azw: "application/vnd.amazon.ebook",
  bin: "application/octet-stream",
  bz: "application/x-bzip",
  bz2: "application/x-bzip2",
  csh: "application/x-csh",
  css: "text/css",
  csv: "text/csv",
  doc: "application/msword",
  dll: "application/octet-stream",
  eot: "application/vnd.ms-fontobject",
  epub: "application/epub+zip",
  gif: "image/gif",
  htm: "text/html",
  html: "text/html",
  ico: "image/x-icon",
  ics: "text/calendar",
  jar: "application/java-archive",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "application/javascript",
  json: "application/json",
  mid: "audio/midi",
  midi: "audio/midi",
  mp2: "audio/mpeg",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mpa: "video/mpeg",
  mpe: "video/mpeg",
  mpeg: "video/mpeg",
  mpkg: "application/vnd.apple.installer+xml",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odt: "application/vnd.oasis.opendocument.text",
  oga: "audio/ogg",
  ogv: "video/ogg",
  ogx: "application/ogg",
  otf: "font/otf",
  png: "image/png",
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  rar: "application/x-rar-compressed",
  rtf: "application/rtf",
  sh: "application/x-sh",
  svg: "image/svg+xml",
  swf: "application/x-shockwave-flash",
  tar: "application/x-tar",
  tif: "image/tiff",
  tiff: "image/tiff",
  ts: "application/typescript",
  ttf: "font/ttf",
  txt: "text/plain",
  vsd: "application/vnd.visio",
  wav: "audio/x-wav",
  weba: "audio/webm",
  webm: "video/webm",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xhtml: "application/xhtml+xml",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.ms-excel",
  xlsx_OLD: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xml: "application/xml",
  xul: "application/vnd.mozilla.xul+xml",
  zip: "application/zip",
  "3gp": "video/3gpp",
  "3gp_DOES_NOT_CONTAIN_VIDEO": "audio/3gpp",
  "3gp2": "video/3gpp2",
  "3gp2_DOES_NOT_CONTAIN_VIDEO": "audio/3gpp2",
  "7z": "application/x-7z-compressed"
};

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
var import_value = require("@sinclair/typebox/value");
var env = typeof Bun < "u" ? Bun.env : typeof process < "u" ? process?.env : void 0, ERROR_CODE = Symbol("ElysiaErrorCode"), isProduction = (env?.NODE_ENV ?? env?.ENV) === "production", emptyHttpStatus = {
  101: void 0,
  204: void 0,
  205: void 0,
  304: void 0,
  307: void 0,
  308: void 0
}, ElysiaCustomStatusResponse = class {
  constructor(code, response) {
    let res = response ?? (code in InvertedStatusMap ? (
      // @ts-expect-error Always correct
      InvertedStatusMap[code]
    ) : code);
    this.code = StatusMap[code] ?? code, code in emptyHttpStatus ? this.response = void 0 : this.response = res;
  }
};

// src/cookies.ts
var Cookie = class {
  constructor(name, jar, initial = {}) {
    this.name = name;
    this.jar = jar;
    this.initial = initial;
  }
  get cookie() {
    return this.jar[this.name] ?? this.initial;
  }
  set cookie(jar) {
    this.name in this.jar || (this.jar[this.name] = this.initial), this.jar[this.name] = jar;
  }
  get setCookie() {
    return this.name in this.jar || (this.jar[this.name] = this.initial), this.jar[this.name];
  }
  set setCookie(jar) {
    this.cookie = jar;
  }
  get value() {
    return this.cookie.value;
  }
  set value(value) {
    this.setCookie.value = value;
  }
  get expires() {
    return this.cookie.expires;
  }
  set expires(expires) {
    this.setCookie.expires = expires;
  }
  get maxAge() {
    return this.cookie.maxAge;
  }
  set maxAge(maxAge) {
    this.setCookie.maxAge = maxAge;
  }
  get domain() {
    return this.cookie.domain;
  }
  set domain(domain) {
    this.setCookie.domain = domain;
  }
  get path() {
    return this.cookie.path;
  }
  set path(path) {
    this.setCookie.path = path;
  }
  get secure() {
    return this.cookie.secure;
  }
  set secure(secure) {
    this.setCookie.secure = secure;
  }
  get httpOnly() {
    return this.cookie.httpOnly;
  }
  set httpOnly(httpOnly) {
    this.setCookie.httpOnly = httpOnly;
  }
  get sameSite() {
    return this.cookie.sameSite;
  }
  set sameSite(sameSite) {
    this.setCookie.sameSite = sameSite;
  }
  get priority() {
    return this.cookie.priority;
  }
  set priority(priority) {
    this.setCookie.priority = priority;
  }
  get partitioned() {
    return this.cookie.partitioned;
  }
  set partitioned(partitioned) {
    this.setCookie.partitioned = partitioned;
  }
  get secrets() {
    return this.cookie.secrets;
  }
  set secrets(secrets) {
    this.setCookie.secrets = secrets;
  }
  update(config) {
    return this.setCookie = Object.assign(
      this.cookie,
      typeof config == "function" ? config(this.cookie) : config
    ), this;
  }
  set(config) {
    return this.setCookie = Object.assign(
      {
        ...this.initial,
        value: this.value
      },
      typeof config == "function" ? config(this.cookie) : config
    ), this;
  }
  remove() {
    if (this.value !== void 0)
      return this.set({
        expires: /* @__PURE__ */ new Date(0),
        maxAge: 0,
        value: ""
      }), this;
  }
  toString() {
    return typeof this.value == "object" ? JSON.stringify(this.value) : this.value?.toString() ?? "";
  }
};
var serializeCookie = (cookies) => {
  if (!cookies || !isNotEmpty(cookies)) return;
  let set2 = [];
  for (let [key, property] of Object.entries(cookies)) {
    if (!key || !property) continue;
    let value = property.value;
    value != null && set2.push(
      (0, import_cookie.serialize)(
        key,
        typeof value == "object" ? JSON.stringify(value) : value + "",
        property
      )
    );
  }
  if (set2.length !== 0)
    return set2.length === 1 ? set2[0] : set2;
};

// src/adapter/utils.ts
var handleFile = (response, set2) => {
  if (!isBun && response instanceof Promise)
    return response.then((res) => handleFile(res, set2));
  let size = response.size, immutable = set2 && (set2.status === 206 || set2.status === 304 || set2.status === 412 || set2.status === 416), defaultHeader = immutable ? {
    "transfer-encoding": "chunked"
  } : {
    "accept-ranges": "bytes",
    "content-range": size ? `bytes 0-${size - 1}/${size}` : void 0,
    "transfer-encoding": "chunked"
  };
  if (!set2 && !size) return new Response(response);
  if (!set2)
    return new Response(response, {
      headers: defaultHeader
    });
  if (set2.headers instanceof Headers) {
    for (let key of Object.keys(defaultHeader))
      key in set2.headers && set2.headers.append(key, defaultHeader[key]);
    return immutable && (set2.headers.delete("content-length"), set2.headers.delete("accept-ranges")), new Response(response, set2);
  }
  return isNotEmpty(set2.headers) ? new Response(response, {
    status: set2.status,
    headers: Object.assign(defaultHeader, set2.headers)
  }) : new Response(response, {
    status: set2.status,
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
}, responseToSetHeaders = (response, set2) => {
  if (set2?.headers) {
    if (response)
      if (hasHeaderShorthand)
        Object.assign(set2.headers, response.headers.toJSON());
      else
        for (let [key, value] of response.headers.entries())
          key in set2.headers && (set2.headers[key] = value);
    return set2.status === 200 && (set2.status = response.status), set2.headers["content-encoding"] && delete set2.headers["content-encoding"], set2;
  }
  if (!response)
    return {
      headers: {},
      status: set2?.status ?? 200
    };
  if (hasHeaderShorthand)
    return set2 = {
      headers: response.headers.toJSON(),
      status: set2?.status ?? 200
    }, set2.headers["content-encoding"] && delete set2.headers["content-encoding"], set2;
  set2 = {
    headers: {},
    status: set2?.status ?? 200
  };
  for (let [key, value] of response.headers.entries())
    key !== "content-encoding" && key in set2.headers && (set2.headers[key] = value);
  return set2;
}, createStreamHandler = ({ mapResponse: mapResponse2, mapCompactResponse: mapCompactResponse2 }) => async (generator, set2, request) => {
  let init = generator.next?.();
  if (init instanceof Promise && (init = await init), init?.value instanceof ReadableStream)
    generator = init.value;
  else if (init && (typeof init?.done > "u" || init?.done))
    return set2 ? mapResponse2(init.value, set2, request) : mapCompactResponse2(init.value, request);
  let isSSE = (
    // @ts-ignore First SSE result is wrapped with sse()
    init?.value?.sse ?? // @ts-ignore ReadableStream is wrapped with sse()
    generator?.sse ?? // User explicitly set content-type to SSE
    set2?.headers["content-type"]?.startsWith("text/event-stream")
  ), format = isSSE ? (data) => `data: ${data}

` : (data) => data, contentType = isSSE ? "text/event-stream" : init?.value && typeof init?.value == "object" ? "application/json" : "text/plain";
  return set2?.headers ? (set2.headers["transfer-encoding"] || (set2.headers["transfer-encoding"] = "chunked"), set2.headers["content-type"] || (set2.headers["content-type"] = contentType), set2.headers["cache-control"] || (set2.headers["cache-control"] = "no-cache")) : set2 = {
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
    set2
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
var handleSet = (set2) => {
  if (typeof set2.status == "string" && (set2.status = StatusMap[set2.status]), set2.cookie && isNotEmpty(set2.cookie)) {
    let cookie = serializeCookie(set2.cookie);
    cookie && (set2.headers["set-cookie"] = cookie);
  }
  set2.headers["set-cookie"] && Array.isArray(set2.headers["set-cookie"]) && (set2.headers = parseSetCookies(
    new Headers(set2.headers),
    set2.headers["set-cookie"]
  ));
}, createResponseHandler = (handler) => {
  let handleStream2 = createStreamHandler(handler);
  return (response, set2, request) => {
    let isCookieSet = !1;
    if (set2.headers instanceof Headers)
      for (let key of set2.headers.keys())
        if (key === "set-cookie") {
          if (isCookieSet) continue;
          isCookieSet = !0;
          for (let cookie of set2.headers.getSetCookie())
            response.headers.append("set-cookie", cookie);
        } else response.headers.append(key, set2.headers?.get(key) ?? "");
    else
      for (let key in set2.headers)
        response.headers.append(
          key,
          set2.headers[key]
        );
    let status = set2.status ?? 200;
    return response.status !== status && status !== 200 && (response.status <= 300 || response.status > 400) ? response.text().then((value) => {
      let newResponse = new Response(value, {
        headers: response.headers,
        status: set2.status
      });
      return !newResponse.headers.has("content-length") && newResponse.headers.get(
        "transfer-encoding"
      ) === "chunked" ? handleStream2(
        streamResponse(newResponse),
        responseToSetHeaders(newResponse, set2),
        request
      ) : newResponse;
    }) : !response.headers.has("content-length") && response.headers.get("transfer-encoding") === "chunked" ? handleStream2(
      streamResponse(response),
      responseToSetHeaders(response, set2),
      request
    ) : response;
  };
};

// src/adapter/web-standard/handler.ts
var handleElysiaFile = (file, set2 = {
  headers: {}
}) => {
  let path = file.path, contentType = mime[path.slice(path.lastIndexOf(".") + 1)];
  return contentType && (set2.headers["content-type"] = contentType), file.stats && set2.status !== 206 && set2.status !== 304 && set2.status !== 412 && set2.status !== 416 ? file.stats.then((stat) => {
    let size = stat.size;
    return size !== void 0 && (set2.headers["content-range"] = `bytes 0-${size - 1}/${size}`, set2.headers["content-length"] = size), handleFile(file.value, set2);
  }) : handleFile(file.value, set2);
}, mapResponse = (response, set2, request) => {
  if (isNotEmpty(set2.headers) || set2.status !== 200 || set2.cookie)
    switch (handleSet(set2), response?.constructor?.name) {
      case "String":
        return set2.headers["content-type"] = "text/plain", new Response(response, set2);
      case "Array":
      case "Object":
        return set2.headers["content-type"] = "application/json", new Response(JSON.stringify(response), set2);
      case "ElysiaFile":
        return handleElysiaFile(response, set2);
      case "File":
        return handleFile(response, set2);
      case "Blob":
        return handleFile(response, set2);
      case "ElysiaCustomStatusResponse":
        return set2.status = response.code, mapResponse(
          response.response,
          set2,
          request
        );
      case void 0:
        return response ? new Response(JSON.stringify(response), set2) : new Response("", set2);
      case "Response":
        return handleResponse(response, set2, request);
      case "Error":
        return errorToResponse(response, set2);
      case "Promise":
        return response.then(
          (x) => mapResponse(x, set2, request)
        );
      case "Function":
        return mapResponse(response(), set2, request);
      case "Number":
      case "Boolean":
        return new Response(
          response.toString(),
          set2
        );
      case "Cookie":
        return response instanceof Cookie ? new Response(response.value, set2) : new Response(response?.toString(), set2);
      case "FormData":
        return new Response(response, set2);
      default:
        if (response instanceof Response)
          return handleResponse(response, set2, request);
        if (response instanceof Promise)
          return response.then((x) => mapResponse(x, set2));
        if (response instanceof Error)
          return errorToResponse(response, set2);
        if (response instanceof ElysiaCustomStatusResponse)
          return set2.status = response.code, mapResponse(
            response.response,
            set2,
            request
          );
        if (
          // @ts-expect-error
          typeof response?.next == "function" || response instanceof ReadableStream
        )
          return handleStream(response, set2, request);
        if (typeof response?.then == "function")
          return response.then((x) => mapResponse(x, set2));
        if (typeof response?.toResponse == "function")
          return mapResponse(response.toResponse(), set2);
        if ("charCodeAt" in response) {
          let code = response.charCodeAt(0);
          if (code === 123 || code === 91)
            return set2.headers["Content-Type"] || (set2.headers["Content-Type"] = "application/json"), new Response(
              JSON.stringify(response),
              set2
            );
        }
        return new Response(response, set2);
    }
  return (
    // @ts-expect-error
    typeof response?.next == "function" || response instanceof ReadableStream ? handleStream(response, set2, request) : mapCompactResponse(response, request)
  );
}, mapEarlyResponse = (response, set2, request) => {
  if (response != null)
    if (isNotEmpty(set2.headers) || set2.status !== 200 || set2.cookie)
      switch (handleSet(set2), response?.constructor?.name) {
        case "String":
          return set2.headers["content-type"] = "text/plain", new Response(response, set2);
        case "Array":
        case "Object":
          return set2.headers["content-type"] = "application/json", new Response(JSON.stringify(response), set2);
        case "ElysiaFile":
          return handleElysiaFile(response, set2);
        case "File":
          return handleFile(response, set2);
        case "Blob":
          return handleFile(response, set2);
        case "ElysiaCustomStatusResponse":
          return set2.status = response.code, mapEarlyResponse(
            response.response,
            set2,
            request
          );
        case void 0:
          return response ? new Response(JSON.stringify(response), set2) : void 0;
        case "Response":
          return handleResponse(response, set2, request);
        case "Promise":
          return response.then(
            (x) => mapEarlyResponse(x, set2)
          );
        case "Error":
          return errorToResponse(response, set2);
        case "Function":
          return mapEarlyResponse(response(), set2);
        case "Number":
        case "Boolean":
          return new Response(
            response.toString(),
            set2
          );
        case "FormData":
          return new Response(response);
        case "Cookie":
          return response instanceof Cookie ? new Response(response.value, set2) : new Response(response?.toString(), set2);
        default:
          if (response instanceof Response)
            return handleResponse(response, set2, request);
          if (response instanceof Promise)
            return response.then((x) => mapEarlyResponse(x, set2));
          if (response instanceof Error)
            return errorToResponse(response, set2);
          if (response instanceof ElysiaCustomStatusResponse)
            return set2.status = response.code, mapEarlyResponse(
              response.response,
              set2,
              request
            );
          if (
            // @ts-expect-error
            typeof response?.next == "function" || response instanceof ReadableStream
          )
            return handleStream(response, set2, request);
          if (typeof response?.then == "function")
            return response.then((x) => mapEarlyResponse(x, set2));
          if (typeof response?.toResponse == "function")
            return mapEarlyResponse(response.toResponse(), set2);
          if ("charCodeAt" in response) {
            let code = response.charCodeAt(0);
            if (code === 123 || code === 91)
              return set2.headers["Content-Type"] || (set2.headers["Content-Type"] = "application/json"), new Response(
                JSON.stringify(response),
                set2
              );
          }
          return new Response(response, set2);
      }
    else
      switch (response?.constructor?.name) {
        case "String":
          return set2.headers["content-type"] = "text/plain", new Response(response);
        case "Array":
        case "Object":
          return set2.headers["content-type"] = "application/json", new Response(JSON.stringify(response), set2);
        case "ElysiaFile":
          return handleElysiaFile(response, set2);
        case "File":
          return handleFile(response, set2);
        case "Blob":
          return handleFile(response, set2);
        case "ElysiaCustomStatusResponse":
          return set2.status = response.code, mapEarlyResponse(
            response.response,
            set2,
            request
          );
        case void 0:
          return response ? new Response(JSON.stringify(response), {
            headers: {
              "content-type": "application/json"
            }
          }) : new Response("");
        case "Response":
          return response;
        case "Promise":
          return response.then((x) => {
            let r = mapEarlyResponse(x, set2);
            if (r !== void 0) return r;
          });
        case "Error":
          return errorToResponse(response, set2);
        case "Function":
          return mapCompactResponse(response(), request);
        case "Number":
        case "Boolean":
          return new Response(response.toString());
        case "Cookie":
          return response instanceof Cookie ? new Response(response.value, set2) : new Response(response?.toString(), set2);
        case "FormData":
          return new Response(response);
        default:
          if (response instanceof Response) return response;
          if (response instanceof Promise)
            return response.then((x) => mapEarlyResponse(x, set2));
          if (response instanceof Error)
            return errorToResponse(response, set2);
          if (response instanceof ElysiaCustomStatusResponse)
            return set2.status = response.code, mapEarlyResponse(
              response.response,
              set2,
              request
            );
          if (
            // @ts-expect-error
            typeof response?.next == "function" || response instanceof ReadableStream
          )
            return handleStream(response, set2, request);
          if (typeof response?.then == "function")
            return response.then((x) => mapEarlyResponse(x, set2));
          if (typeof response?.toResponse == "function")
            return mapEarlyResponse(response.toResponse(), set2);
          if ("charCodeAt" in response) {
            let code = response.charCodeAt(0);
            if (code === 123 || code === 91)
              return set2.headers["Content-Type"] || (set2.headers["Content-Type"] = "application/json"), new Response(
                JSON.stringify(response),
                set2
              );
          }
          return new Response(response);
      }
}, mapCompactResponse = (response, request) => {
  switch (response?.constructor?.name) {
    case "String":
      return new Response(response, {
        headers: {
          "Content-Type": "text/plain"
        }
      });
    case "Object":
    case "Array":
      return new Response(JSON.stringify(response), {
        headers: {
          "Content-Type": "application/json"
        }
      });
    case "ElysiaFile":
      return handleElysiaFile(response);
    case "File":
      return handleFile(response);
    case "Blob":
      return handleFile(response);
    case "ElysiaCustomStatusResponse":
      return mapResponse(
        response.response,
        {
          status: response.code,
          headers: {}
        }
      );
    case void 0:
      return response ? new Response(JSON.stringify(response), {
        headers: {
          "content-type": "application/json"
        }
      }) : new Response("");
    case "Response":
      return response;
    case "Error":
      return errorToResponse(response);
    case "Promise":
      return response.then(
        (x) => mapCompactResponse(x, request)
      );
    // ? Maybe response or Blob
    case "Function":
      return mapCompactResponse(response(), request);
    case "Number":
    case "Boolean":
      return new Response(response.toString());
    case "FormData":
      return new Response(response);
    default:
      if (response instanceof Response) return response;
      if (response instanceof Promise)
        return response.then(
          (x) => mapCompactResponse(x, request)
        );
      if (response instanceof Error)
        return errorToResponse(response);
      if (response instanceof ElysiaCustomStatusResponse)
        return mapResponse(
          response.response,
          {
            status: response.code,
            headers: {}
          }
        );
      if (
        // @ts-expect-error
        typeof response?.next == "function" || response instanceof ReadableStream
      )
        return handleStream(response, void 0, request);
      if (typeof response?.then == "function")
        return response.then((x) => mapResponse(x, set));
      if (typeof response?.toResponse == "function")
        return mapCompactResponse(response.toResponse());
      if ("charCodeAt" in response) {
        let code = response.charCodeAt(0);
        if (code === 123 || code === 91)
          return new Response(JSON.stringify(response), {
            headers: {
              "Content-Type": "application/json"
            }
          });
      }
      return new Response(response);
  }
}, errorToResponse = (error, set2) => new Response(
  JSON.stringify({
    name: error?.name,
    message: error?.message,
    cause: error?.cause
  }),
  {
    status: set2?.status !== 200 ? set2?.status ?? 500 : 500,
    headers: set2?.headers
  }
), createStaticHandler = (handle, hooks, setHeaders = {}) => {
  if (typeof handle == "function") return;
  let response = mapResponse(handle, {
    headers: setHeaders
  });
  if (!hooks.parse?.length && !hooks.transform?.length && !hooks.beforeHandle?.length && !hooks.afterHandle?.length)
    return () => response.clone();
}, handleResponse = createResponseHandler({
  mapResponse,
  mapCompactResponse
}), handleStream = createStreamHandler({
  mapResponse,
  mapCompactResponse
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createStaticHandler,
  errorToResponse,
  mapCompactResponse,
  mapEarlyResponse,
  mapResponse
});
