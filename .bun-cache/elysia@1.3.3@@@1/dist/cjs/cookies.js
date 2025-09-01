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

// src/cookies.ts
var cookies_exports = {};
__export(cookies_exports, {
  Cookie: () => Cookie,
  createCookieJar: () => createCookieJar,
  parseCookie: () => parseCookie,
  serializeCookie: () => serializeCookie
});
module.exports = __toCommonJS(cookies_exports);
var import_cookie = require("cookie"), import_fast_decode_uri_component = __toESM(require("fast-decode-uri-component"));

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
function removeTrailingEquals(digest) {
  let trimmedDigest = digest;
  for (; trimmedDigest.endsWith("="); )
    trimmedDigest = trimmedDigest.slice(0, -1);
  return trimmedDigest;
}
var encoder = new TextEncoder(), signCookie = async (val, secret) => {
  if (typeof val != "string")
    throw new TypeError("Cookie value must be provided as a string.");
  if (secret === null) throw new TypeError("Secret key must be provided.");
  let secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    !1,
    ["sign"]
  ), hmacBuffer = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    encoder.encode(val)
  );
  return val + "." + removeTrailingEquals(Buffer.from(hmacBuffer).toString("base64"));
}, unsignCookie = async (input, secret) => {
  if (typeof input != "string")
    throw new TypeError("Signed cookie string must be provided.");
  if (secret === null) throw new TypeError("Secret key must be provided.");
  let tentativeValue = input.slice(0, input.lastIndexOf("."));
  return await signCookie(tentativeValue, secret) === input ? tentativeValue : !1;
};
var ELYSIA_FORM_DATA = Symbol("ElysiaFormData"), ELYSIA_REQUEST_ID = Symbol("ElysiaRequestId");
var isNotEmpty = (obj) => {
  if (!obj) return !1;
  for (let x in obj) return !0;
  return !1;
};
var supportPerMethodInlineHandler = (() => {
  if (typeof Bun > "u") return !0;
  let semver = Bun.version.split(".");
  return !(+semver[0] < 1 || +semver[1] < 2 || +semver[2] < 14);
})();

// src/error.ts
var import_value = require("@sinclair/typebox/value");
var env = typeof Bun < "u" ? Bun.env : typeof process < "u" ? process?.env : void 0, ERROR_CODE = Symbol("ElysiaErrorCode"), isProduction = (env?.NODE_ENV ?? env?.ENV) === "production";
var InvalidCookieSignature = class extends Error {
  constructor(key, message) {
    super(message ?? `"${key}" has invalid cookie signature`);
    this.key = key;
    this.code = "INVALID_COOKIE_SIGNATURE";
    this.status = 400;
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
}, createCookieJar = (set, store, initial) => (set.cookie || (set.cookie = {}), new Proxy(store, {
  get(_, key) {
    return key in store ? new Cookie(
      key,
      set.cookie,
      Object.assign({}, initial ?? {}, store[key])
    ) : new Cookie(
      key,
      set.cookie,
      Object.assign({}, initial)
    );
  }
})), parseCookie = async (set, cookieString, {
  secrets,
  sign,
  ...initial
} = {}) => {
  if (!cookieString) return createCookieJar(set, {}, initial);
  let isStringKey = typeof secrets == "string";
  sign && sign !== !0 && !Array.isArray(sign) && (sign = [sign]);
  let jar = {}, cookies = (0, import_cookie.parse)(cookieString);
  for (let [name, v] of Object.entries(cookies)) {
    if (v === void 0) continue;
    let value = (0, import_fast_decode_uri_component.default)(v);
    if (sign === !0 || sign?.includes(name)) {
      if (!secrets)
        throw new Error("No secret is provided to cookie plugin");
      if (isStringKey) {
        let temp = await unsignCookie(value, secrets);
        if (temp === !1) throw new InvalidCookieSignature(name);
        value = temp;
      } else {
        let decoded = !0;
        for (let i = 0; i < secrets.length; i++) {
          let temp = await unsignCookie(value, secrets[i]);
          if (temp !== !1) {
            decoded = !0, value = temp;
            break;
          }
        }
        if (!decoded) throw new InvalidCookieSignature(name);
      }
    }
    jar[name] = {
      value
    };
  }
  return createCookieJar(set, jar, initial);
}, serializeCookie = (cookies) => {
  if (!cookies || !isNotEmpty(cookies)) return;
  let set = [];
  for (let [key, property] of Object.entries(cookies)) {
    if (!key || !property) continue;
    let value = property.value;
    value != null && set.push(
      (0, import_cookie.serialize)(
        key,
        typeof value == "object" ? JSON.stringify(value) : value + "",
        property
      )
    );
  }
  if (set.length !== 0)
    return set.length === 1 ? set[0] : set;
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Cookie,
  createCookieJar,
  parseCookie,
  serializeCookie
});
