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

// src/compose.ts
var compose_exports = {};
__export(compose_exports, {
  composeErrorHandler: () => composeErrorHandler,
  composeGeneralHandler: () => composeGeneralHandler,
  composeHandler: () => composeHandler,
  createHoc: () => createHoc,
  createOnRequestHandler: () => createOnRequestHandler,
  isAsync: () => isAsync
});
module.exports = __toCommonJS(compose_exports);
var import_value4 = require("@sinclair/typebox/value"), import_typebox6 = require("@sinclair/typebox"), import_fast_decode_uri_component3 = __toESM(require("fast-decode-uri-component"));

// src/parse-query.ts
var import_fast_decode_uri_component = __toESM(require("fast-decode-uri-component"));
function parseQueryFromURL(input, startIndex = 0) {
  let result = /* @__PURE__ */ Object.create(null), KEY_PLUS_FLAG = 1, KEY_DECODE_FLAG = 2, VALUE_PLUS_FLAG = 4, VALUE_DECODE_FLAG = 8, flags = 0, startingIndex = startIndex - 1, equalityIndex = startingIndex, inputLength = input.length;
  for (let i = startIndex; i < inputLength; i++)
    switch (input.charCodeAt(i)) {
      // '&'
      case 38:
        processKeyValuePair(i), startingIndex = i, equalityIndex = i, flags = 0;
        break;
      // '='
      case 61:
        equalityIndex <= startingIndex ? equalityIndex = i : flags |= VALUE_DECODE_FLAG;
        break;
      // '+'
      case 43:
        equalityIndex > startingIndex ? flags |= VALUE_PLUS_FLAG : flags |= KEY_PLUS_FLAG;
        break;
      // '%'
      case 37:
        equalityIndex > startingIndex ? flags |= VALUE_DECODE_FLAG : flags |= KEY_DECODE_FLAG;
        break;
    }
  return processKeyValuePair(inputLength), result;
  function processKeyValuePair(endIndex) {
    let hasBothKeyValuePair = equalityIndex > startingIndex, keyEndIndex = hasBothKeyValuePair ? equalityIndex : endIndex;
    if (keyEndIndex <= startingIndex + 1) return;
    let keySlice = input.slice(startingIndex + 1, keyEndIndex);
    if (flags & KEY_PLUS_FLAG && (keySlice = keySlice.replace(/\+/g, " ")), flags & KEY_DECODE_FLAG && (keySlice = (0, import_fast_decode_uri_component.default)(keySlice) || keySlice), result[keySlice] !== void 0) return;
    let finalValue = "";
    hasBothKeyValuePair && (finalValue = input.slice(equalityIndex + 1, endIndex), flags & VALUE_PLUS_FLAG && (finalValue = finalValue.replace(/\+/g, " ")), flags & VALUE_DECODE_FLAG && (finalValue = (0, import_fast_decode_uri_component.default)(finalValue) || finalValue)), result[keySlice] = finalValue;
  }
}
function parseQuery(input) {
  let result = /* @__PURE__ */ Object.create(null), flags = 0, KEY_HAS_PLUS = 1, KEY_NEEDS_DECODE = 2, VALUE_HAS_PLUS = 4, VALUE_NEEDS_DECODE = 8, inputLength = input.length, startingIndex = -1, equalityIndex = -1;
  for (let i = 0; i < inputLength; i++)
    switch (input.charCodeAt(i)) {
      // '&'
      case 38:
        processKeyValuePair(input, i), startingIndex = i, equalityIndex = i, flags = 0;
        break;
      // '='
      case 61:
        equalityIndex <= startingIndex ? equalityIndex = i : flags |= VALUE_NEEDS_DECODE;
        break;
      // '+'
      case 43:
        equalityIndex > startingIndex ? flags |= VALUE_HAS_PLUS : flags |= KEY_HAS_PLUS;
        break;
      // '%'
      case 37:
        equalityIndex > startingIndex ? flags |= VALUE_NEEDS_DECODE : flags |= KEY_NEEDS_DECODE;
        break;
    }
  return startingIndex < inputLength && processKeyValuePair(input, inputLength), result;
  function processKeyValuePair(input2, endIndex) {
    let hasBothKeyValuePair = equalityIndex > startingIndex, effectiveEqualityIndex = hasBothKeyValuePair ? equalityIndex : endIndex, keySlice = input2.slice(startingIndex + 1, effectiveEqualityIndex);
    if (!hasBothKeyValuePair && keySlice.length === 0) return;
    let finalKey = keySlice;
    flags & KEY_HAS_PLUS && (finalKey = finalKey.replace(/\+/g, " ")), flags & KEY_NEEDS_DECODE && (finalKey = (0, import_fast_decode_uri_component.default)(finalKey) || finalKey);
    let finalValue = "";
    if (hasBothKeyValuePair) {
      let valueSlice = input2.slice(equalityIndex + 1, endIndex);
      flags & VALUE_HAS_PLUS && (valueSlice = valueSlice.replace(/\+/g, " ")), flags & VALUE_NEEDS_DECODE && (valueSlice = (0, import_fast_decode_uri_component.default)(valueSlice) || valueSlice), finalValue = valueSlice;
    }
    let currentValue = result[finalKey];
    currentValue === void 0 ? result[finalKey] = finalValue : Array.isArray(currentValue) ? currentValue.push(finalValue) : result[finalKey] = [currentValue, finalValue];
  }
}

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
}, getFileExtension = (path) => {
  let index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index + 1);
};
var createReadStream, stat, ElysiaFile = class {
  constructor(path) {
    this.path = path;
    if (isBun) this.value = Bun.file(path);
    else if (typeof window < "u")
      console.warn("Browser environment does not support file");
    else if (!createReadStream || !stat)
      try {
        this.value = import("fs").then((fs) => (createReadStream = fs.createReadStream, fs.createReadStream(path))), this.stats = import("fs/promises").then((fs) => (stat = fs.stat, fs.stat(path)));
      } catch {
      }
    else
      this.value = createReadStream(path), this.stats = stat(path);
  }
  get type() {
    return (
      // @ts-ignore
      mime[getFileExtension(this.path)] || "application/octet-stream"
    );
  }
  get length() {
    return isBun ? this.value.size : this.stats?.then((x) => x.size) ?? 0;
  }
};

// src/utils.ts
var hasHeaderShorthand = "toJSON" in new Headers();
var isClass = (v) => typeof v == "function" && /^\s*class\s+/.test(v.toString()) || // Handle Object.create(null)
v.toString && // Handle import * as Sentry from '@sentry/bun'
// This also handle [object Date], [object Array]
// and FFI value like [object Prisma]
v.toString().startsWith("[object ") && v.toString() !== "[object Object]" || // If object prototype is not pure, then probably a class-like object
isNotEmpty(Object.getPrototypeOf(v)), isObject = (item) => item && typeof item == "object" && !Array.isArray(item), mergeDeep = (target, source, options) => {
  let skipKeys = options?.skipKeys, override = options?.override ?? !0;
  if (!isObject(target) || !isObject(source)) return target;
  for (let [key, value] of Object.entries(source))
    if (!skipKeys?.includes(key)) {
      if (!isObject(value) || !(key in target) || isClass(value)) {
        (override || !(key in target)) && (target[key] = value);
        continue;
      }
      target[key] = mergeDeep(
        target[key],
        value,
        { skipKeys, override }
      );
    }
  return target;
}, mergeCookie = (a, b) => {
  let v = mergeDeep(Object.assign({}, a), b, {
    skipKeys: ["properties"]
  });
  return v.properties && delete v.properties, v;
};
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
var isBun2 = typeof Bun < "u", hasBunHash = isBun2 && typeof Bun.hash == "function", checksum = (s) => {
  let h = 9;
  for (let i = 0; i < s.length; ) h = Math.imul(h ^ s.charCodeAt(i++), 9 ** 9);
  return h = h ^ h >>> 9;
};
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
var lifeCycleToFn = (a) => (a.start?.map && (a.start = a.start.map((x) => x.fn)), a.request?.map && (a.request = a.request.map((x) => x.fn)), a.parse?.map && (a.parse = a.parse.map((x) => x.fn)), a.transform?.map && (a.transform = a.transform.map((x) => x.fn)), a.beforeHandle?.map && (a.beforeHandle = a.beforeHandle.map((x) => x.fn)), a.afterHandle?.map && (a.afterHandle = a.afterHandle.map((x) => x.fn)), a.mapResponse?.map && (a.mapResponse = a.mapResponse.map((x) => x.fn)), a.afterResponse?.map && (a.afterResponse = a.afterResponse.map((x) => x.fn)), a.trace?.map ? a.trace = a.trace.map((x) => x.fn) : a.trace = [], a.error?.map && (a.error = a.error.map((x) => x.fn)), a.stop?.map && (a.stop = a.stop.map((x) => x.fn)), a);
var redirect = (url, status2 = 302) => Response.redirect(url, status2), ELYSIA_FORM_DATA = Symbol("ElysiaFormData"), ELYSIA_REQUEST_ID = Symbol("ElysiaRequestId"), form = (items) => {
  let formData = new FormData();
  if (formData[ELYSIA_FORM_DATA] = {}, items)
    for (let [key, value] of Object.entries(items)) {
      if (Array.isArray(value)) {
        formData[ELYSIA_FORM_DATA][key] = [];
        for (let v of value)
          value instanceof File ? formData.append(key, value, value.name) : value instanceof ElysiaFile ? formData.append(key, value.value, value.value?.name) : formData.append(key, value), formData[ELYSIA_FORM_DATA][key].push(value);
        continue;
      }
      value instanceof File ? formData.append(key, value, value.name) : value instanceof ElysiaFile ? formData.append(key, value.value, value.value?.name) : formData.append(key, value), formData[ELYSIA_FORM_DATA][key] = value;
    }
  return formData;
}, randomId = () => {
  let uuid = crypto.randomUUID();
  return uuid.slice(0, 8) + uuid.slice(24, 32);
};
var getLoosePath = (path) => path.charCodeAt(path.length - 1) === 47 ? path.slice(0, path.length - 1) : path + "/", isNotEmpty = (obj) => {
  if (!obj) return !1;
  for (let x in obj) return !0;
  return !1;
};
var encodePath = (path, { dynamic = !1 } = {}) => {
  let encoded = encodeURIComponent(path).replace(/%2F/g, "/");
  return dynamic && (encoded = encoded.replace(/%3A/g, ":").replace(/%3F/g, "?")), encoded;
}, supportPerMethodInlineHandler = (() => {
  if (typeof Bun > "u") return !0;
  let semver = Bun.version.split(".");
  return !(+semver[0] < 1 || +semver[1] < 2 || +semver[2] < 14);
})();

// src/error.ts
var import_value = require("@sinclair/typebox/value");
var env = typeof Bun < "u" ? Bun.env : typeof process < "u" ? process?.env : void 0, ERROR_CODE = Symbol("ElysiaErrorCode"), isProduction = (env?.NODE_ENV ?? env?.ENV) === "production", ElysiaCustomStatusResponse = class {
  constructor(code, response) {
    let res = response ?? (code in InvertedStatusMap ? (
      // @ts-expect-error Always correct
      InvertedStatusMap[code]
    ) : code);
    this.code = StatusMap[code] ?? code, this.response = res;
  }
}, status = (code, response) => new ElysiaCustomStatusResponse(code, response);
var NotFoundError = class extends Error {
  constructor(message) {
    super(message ?? "NOT_FOUND");
    this.code = "NOT_FOUND";
    this.status = 404;
  }
}, ParseError = class extends Error {
  constructor(cause) {
    super("Bad Request", {
      cause
    });
    this.code = "PARSE";
    this.status = 400;
  }
}, InvalidCookieSignature = class extends Error {
  constructor(key, message) {
    super(message ?? `"${key}" has invalid cookie signature`);
    this.key = key;
    this.code = "INVALID_COOKIE_SIGNATURE";
    this.status = 400;
  }
}, mapValueError = (error) => {
  if (!error)
    return {
      summary: void 0
    };
  let { message, path, value, type } = error, property = path.slice(1).replaceAll("/", "."), isRoot = path === "";
  switch (type) {
    case 42:
      return {
        ...error,
        summary: isRoot ? "Value should not be provided" : `Property '${property}' should not be provided`
      };
    case 45:
      return {
        ...error,
        summary: isRoot ? "Value is missing" : `Property '${property}' is missing`
      };
    case 50:
      let quoteIndex = message.indexOf("'"), format = message.slice(
        quoteIndex + 1,
        message.indexOf("'", quoteIndex + 1)
      );
      return {
        ...error,
        summary: isRoot ? "Value should be an email" : `Property '${property}' should be ${format}`
      };
    case 54:
      return {
        ...error,
        summary: `${message.slice(0, 9).trim()} property '${property}' to be ${message.slice(8).trim()} but found: ${value}`
      };
    case 62:
      let union = error.schema.anyOf.map((x) => `'${x?.format ?? x.type}'`).join(", ");
      return {
        ...error,
        summary: isRoot ? `Value should be one of ${union}` : `Property '${property}' should be one of: ${union}`
      };
    default:
      return { summary: message, ...error };
  }
}, InvalidFileType = class _InvalidFileType extends Error {
  constructor(property, expected, message = `"${property}" has invalid file type`) {
    super(message);
    this.property = property;
    this.expected = expected;
    this.message = message;
    this.code = "INVALID_FILE_TYPE";
    this.status = 422;
    Object.setPrototypeOf(this, _InvalidFileType.prototype);
  }
  toResponse(headers) {
    return isProduction ? new Response(
      JSON.stringify({
        type: "validation",
        on: "body"
      }),
      {
        status: 422,
        headers: {
          ...headers,
          "content-type": "application/json"
        }
      }
    ) : new Response(
      JSON.stringify({
        type: "validation",
        on: "body",
        summary: "Invalid file type",
        message: this.message,
        property: this.property,
        expected: this.expected
      }),
      {
        status: 422,
        headers: {
          ...headers,
          "content-type": "application/json"
        }
      }
    );
  }
}, ValidationError = class _ValidationError extends Error {
  constructor(type, validator, value, errors) {
    value && typeof value == "object" && value instanceof ElysiaCustomStatusResponse && (value = value.response);
    let error = errors?.First() || (isProduction ? void 0 : "Errors" in validator ? validator.Errors(value).First() : import_value.Value.Errors(validator, value).First()), customError = error?.schema?.message || error?.schema?.error !== void 0 ? typeof error.schema.error == "function" ? error.schema.error({
      type,
      validator,
      value,
      get errors() {
        return [...validator.Errors(value)].map(
          mapValueError
        );
      }
    }) : error.schema.error : void 0, accessor = error?.path || "root", message = "";
    if (customError !== void 0)
      message = typeof customError == "object" ? JSON.stringify(customError) : customError + "";
    else if (isProduction)
      message = JSON.stringify({
        type: "validation",
        on: type,
        summary: mapValueError(error).summary,
        message: error?.message,
        found: value
      });
    else {
      let schema = validator?.schema ?? validator, errors2 = "Errors" in validator ? [...validator.Errors(value)].map(mapValueError) : [...import_value.Value.Errors(validator, value)].map(mapValueError), expected;
      try {
        expected = import_value.Value.Create(schema);
      } catch (error2) {
        expected = {
          type: "Could not create expected value",
          // @ts-expect-error
          message: error2?.message,
          error: error2
        };
      }
      message = JSON.stringify(
        {
          type: "validation",
          on: type,
          summary: mapValueError(error).summary,
          property: accessor,
          message: error?.message,
          expected,
          found: value,
          errors: errors2
        },
        null,
        2
      );
    }
    super(message);
    this.type = type;
    this.validator = validator;
    this.value = value;
    this.code = "VALIDATION";
    this.status = 422;
    Object.setPrototypeOf(this, _ValidationError.prototype);
  }
  get all() {
    return "Errors" in this.validator ? [...this.validator.Errors(this.value)].map(mapValueError) : (
      // @ts-ignore
      [...import_value.Value.Errors(this.validator, this.value)].map(mapValueError)
    );
  }
  static simplifyModel(validator) {
    let model = "schema" in validator ? validator.schema : validator;
    try {
      return import_value.Value.Create(model);
    } catch {
      return model;
    }
  }
  get model() {
    return _ValidationError.simplifyModel(this.validator);
  }
  toResponse(headers) {
    return new Response(this.message, {
      status: 400,
      headers: {
        ...headers,
        "content-type": "application/json"
      }
    });
  }
};

// src/trace.ts
var ELYSIA_TRACE = Symbol("ElysiaTrace");

// src/schema.ts
var import_typebox5 = require("@sinclair/typebox"), import_value3 = require("@sinclair/typebox/value"), import_compiler3 = require("@sinclair/typebox/compiler"), import_exact_mirror = require("exact-mirror");

// src/type-system/index.ts
var import_typebox3 = require("@sinclair/typebox");

// src/type-system/format.ts
var import_typebox = require("@sinclair/typebox"), fullFormats = {
  // date: http://tools.ietf.org/html/rfc3339#section-5.6
  date,
  // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
  time: getTime(!0),
  "date-time": getDateTime(!0),
  "iso-time": getTime(!1),
  "iso-date-time": getDateTime(!1),
  // duration: https://tools.ietf.org/html/rfc3339#appendix-A
  duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
  uri,
  "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
  // uri-template: https://tools.ietf.org/html/rfc6570
  "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
  // For the source: https://gist.github.com/dperini/729294
  // For test cases: https://mathiasbynens.be/demo/url-regex
  url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
  email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
  hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
  // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
  ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
  ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
  regex,
  // uuid: http://tools.ietf.org/html/rfc4122
  uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
  // JSON-pointer: https://tools.ietf.org/html/rfc6901
  // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
  "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
  "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
  // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
  "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
  // the following formats are used by the openapi specification: https://spec.openapis.org/oas/v3.0.0#data-types
  // byte: https://github.com/miguelmota/is-base64
  byte,
  // signed 32 bit integer
  int32: { type: "number", validate: validateInt32 },
  // signed 64 bit integer
  int64: { type: "number", validate: validateInt64 },
  // C-type float
  float: { type: "number", validate: validateNumber },
  // C-type double
  double: { type: "number", validate: validateNumber },
  // hint to the UI to hide input strings
  password: !0,
  // unchecked string payload
  binary: !0
};
function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/, DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function date(str) {
  let matches = DATE.exec(str);
  if (!matches) return !1;
  let year = +matches[1], month = +matches[2], day = +matches[3];
  return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
}
var TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
function getTime(strictTimeZone) {
  return function(str) {
    let matches = TIME.exec(str);
    if (!matches) return !1;
    let hr = +matches[1], min = +matches[2], sec = +matches[3], tz = matches[4], tzSign = matches[5] === "-" ? -1 : 1, tzH = +(matches[6] || 0), tzM = +(matches[7] || 0);
    if (tzH > 23 || tzM > 59 || strictTimeZone && !tz) return !1;
    if (hr <= 23 && min <= 59 && sec < 60) return !0;
    let utcMin = min - tzM * tzSign, utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
    return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
  };
}
var parseDateTimeEmptySpace = (str) => str.charCodeAt(str.length - 6) === 32 ? str.slice(0, -6) + "+" + str.slice(-5) : str, DATE_TIME_SEPARATOR = /t|\s/i;
function getDateTime(strictTimeZone) {
  let time = getTime(strictTimeZone);
  return function(str) {
    let dateTime = str.split(DATE_TIME_SEPARATOR);
    return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
  };
}
var NOT_URI_FRAGMENT = /\/|:/, URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
function uri(str) {
  return NOT_URI_FRAGMENT.test(str) && URI.test(str);
}
var BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
function byte(str) {
  return BYTE.lastIndex = 0, BYTE.test(str);
}
var MIN_INT32 = -(2 ** 31), MAX_INT32 = 2 ** 31 - 1;
function validateInt32(value) {
  return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
}
function validateInt64(value) {
  return Number.isInteger(value);
}
function validateNumber() {
  return !0;
}
var Z_ANCHOR = /[^\\]\\Z/;
function regex(str) {
  if (Z_ANCHOR.test(str)) return !1;
  try {
    return new RegExp(str), !0;
  } catch {
    return !1;
  }
}
var isISO8601 = /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/, isFormalDate = /(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{2}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT(?:\+|-)\d{4}\s\([^)]+\)/, isShortenDate = /^(?:(?:(?:(?:0?[1-9]|[12][0-9]|3[01])[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:19|20)\d{2})|(?:(?:19|20)\d{2}[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:0?[1-9]|[12][0-9]|3[01]))))(?:\s(?:1[012]|0?[1-9]):[0-5][0-9](?::[0-5][0-9])?(?:\s[AP]M)?)?$/, _validateDate = fullFormats.date, _validateDateTime = fullFormats["date-time"];
import_typebox.FormatRegistry.Has("date") || import_typebox.FormatRegistry.Set("date", (value) => {
  let temp = parseDateTimeEmptySpace(value).replace(/"/g, "");
  if (isISO8601.test(temp) || isFormalDate.test(temp) || isShortenDate.test(temp) || _validateDate(temp)) {
    let date2 = new Date(temp);
    if (!Number.isNaN(date2.getTime())) return !0;
  }
  return !1;
});
import_typebox.FormatRegistry.Has("date-time") || import_typebox.FormatRegistry.Set("date-time", (value) => {
  let temp = value.replace(/"/g, "");
  if (isISO8601.test(temp) || isFormalDate.test(temp) || isShortenDate.test(temp) || _validateDateTime(temp)) {
    let date2 = new Date(temp);
    if (!Number.isNaN(date2.getTime())) return !0;
  }
  return !1;
});
Object.entries(fullFormats).forEach((formatEntry) => {
  let [formatName, formatValue] = formatEntry;
  import_typebox.FormatRegistry.Has(formatName) || (formatValue instanceof RegExp ? import_typebox.FormatRegistry.Set(formatName, (value) => formatValue.test(value)) : typeof formatValue == "function" && import_typebox.FormatRegistry.Set(formatName, formatValue));
});
import_typebox.FormatRegistry.Has("numeric") || import_typebox.FormatRegistry.Set("numeric", (value) => !!value && !isNaN(+value));
import_typebox.FormatRegistry.Has("integer") || import_typebox.FormatRegistry.Set(
  "integer",
  (value) => !!value && Number.isInteger(+value)
);
import_typebox.FormatRegistry.Has("boolean") || import_typebox.FormatRegistry.Set(
  "boolean",
  (value) => value === "true" || value === "false"
);
import_typebox.FormatRegistry.Has("ObjectString") || import_typebox.FormatRegistry.Set("ObjectString", (value) => {
  let start = value.charCodeAt(0);
  if ((start === 9 || start === 10 || start === 32) && (start = value.trimStart().charCodeAt(0)), start !== 123 && start !== 91) return !1;
  try {
    return JSON.parse(value), !0;
  } catch {
    return !1;
  }
});
import_typebox.FormatRegistry.Has("ArrayString") || import_typebox.FormatRegistry.Set("ArrayString", (value) => {
  let start = value.charCodeAt(0);
  if ((start === 9 || start === 10 || start === 32) && (start = value.trimStart().charCodeAt(0)), start !== 123 && start !== 91) return !1;
  try {
    return JSON.parse(value), !0;
  } catch {
    return !1;
  }
});

// src/type-system/utils.ts
var import_typebox2 = require("@sinclair/typebox"), import_value2 = require("@sinclair/typebox/value"), import_compiler = require("@sinclair/typebox/compiler");
var tryParse = (v, schema) => {
  try {
    return JSON.parse(v);
  } catch {
    throw new ValidationError("property", schema, v);
  }
};
function createType(kind, func) {
  return import_typebox2.TypeRegistry.Has(kind) || import_typebox2.TypeRegistry.Set(kind, func), (options = {}) => (0, import_typebox2.Unsafe)({ ...options, [import_typebox2.Kind]: kind });
}
var compile = (schema) => {
  try {
    let compiler = import_compiler.TypeCompiler.Compile(schema);
    return compiler.Create = () => import_value2.Value.Create(schema), compiler.Error = (v) => new ValidationError("property", schema, v, compiler.Errors(v)), compiler;
  } catch {
    return {
      Check: (v) => import_value2.Value.Check(schema, v),
      CheckThrow: (v) => {
        if (!import_value2.Value.Check(schema, v))
          throw new ValidationError(
            "property",
            schema,
            v,
            import_value2.Value.Errors(schema, v)
          );
      },
      Decode: (v) => import_value2.Value.Decode(schema, v),
      Create: () => import_value2.Value.Create(schema),
      Error: (v) => new ValidationError(
        "property",
        schema,
        v,
        import_value2.Value.Errors(schema, v)
      )
    };
  }
}, parseFileUnit = (size) => {
  if (typeof size == "string")
    switch (size.slice(-1)) {
      case "k":
        return +size.slice(0, size.length - 1) * 1024;
      case "m":
        return +size.slice(0, size.length - 1) * 1048576;
      default:
        return +size;
    }
  return size;
}, checkFileExtension = (type, extension) => type.startsWith(extension) ? !0 : extension.charCodeAt(extension.length - 1) === 42 && extension.charCodeAt(extension.length - 2) === 47 && type.startsWith(extension.slice(0, -1)), _fileTypeFromBlobWarn = !1, warnIfFileTypeIsNotInstalled = () => {
  _fileTypeFromBlobWarn || (console.warn(
    "[Elysia] Attempt to validate file type without 'file-type'. This may lead to security risks. We recommend installing 'file-type' to properly validate file extension."
  ), _fileTypeFromBlobWarn = !0);
}, loadFileType = async () => import("file-type").then((x) => (_fileTypeFromBlob = x.fileTypeFromBlob, _fileTypeFromBlob)).catch(warnIfFileTypeIsNotInstalled), _fileTypeFromBlob, fileTypeFromBlob = (file) => _fileTypeFromBlob ? _fileTypeFromBlob(file) : loadFileType().then((mod) => {
  if (mod) return mod(file);
}), validateFileExtension = async (file, extension, name = file?.name ?? "") => {
  if (!file) return;
  let result = await fileTypeFromBlob(file);
  if (!result) throw new InvalidFileType(name, extension);
  if (typeof extension == "string" && !checkFileExtension(result.mime, extension))
    throw new InvalidFileType(name, extension);
  for (let i = 0; i < extension.length; i++)
    if (checkFileExtension(result.mime, extension[i])) return !0;
  throw new InvalidFileType(name, extension);
}, validateFile = (options, value) => {
  if (value instanceof ElysiaFile) return !0;
  if (!(value instanceof Blob) || options.minSize && value.size < parseFileUnit(options.minSize) || options.maxSize && value.size > parseFileUnit(options.maxSize))
    return !1;
  if (options.extension) {
    if (typeof options.extension == "string")
      return checkFileExtension(value.type, options.extension);
    for (let i = 0; i < options.extension.length; i++)
      if (checkFileExtension(value.type, options.extension[i]))
        return !0;
    return !1;
  }
  return !0;
};

// src/type-system/index.ts
var import_system = require("@sinclair/typebox/system"), import_typebox4 = require("@sinclair/typebox"), import_compiler2 = require("@sinclair/typebox/compiler"), t = Object.assign({}, import_typebox3.Type);
createType(
  "UnionEnum",
  (schema, value) => (typeof value == "number" || typeof value == "string" || value === null) && schema.enum.includes(value)
);
var internalFiles = createType(
  "Files",
  (options, value) => {
    if (!Array.isArray(value)) return validateFile(options, value);
    if (options.minItems && value.length < options.minItems || options.maxItems && value.length > options.maxItems) return !1;
    for (let i = 0; i < value.length; i++)
      if (!validateFile(options, value[i])) return !1;
    return !0;
  }
), internalFormData = createType(
  "ElysiaForm",
  ({ compiler, ...schema }, value) => {
    if (!(value instanceof FormData)) return !1;
    if (compiler) {
      if (!(ELYSIA_FORM_DATA in value))
        throw new ValidationError("property", schema, value);
      if (!compiler.Check(value[ELYSIA_FORM_DATA]))
        throw compiler.Error(value[ELYSIA_FORM_DATA]);
    }
    return !0;
  }
), ElysiaType = {
  // @ts-ignore
  String: (property) => import_typebox3.Type.String(property),
  Numeric: (property) => {
    let schema = import_typebox3.Type.Number(property), compiler = compile(schema);
    return t.Transform(
      t.Union(
        [
          t.String({
            format: "numeric",
            default: 0
          }),
          t.Number(property)
        ],
        property
      )
    ).Decode((value) => {
      let number = +value;
      if (isNaN(number)) return value;
      if (property && !compiler.Check(number))
        throw compiler.Error(value);
      return number;
    }).Encode((value) => value);
  },
  Integer: (property) => {
    let schema = import_typebox3.Type.Integer(property), compiler = compile(schema);
    return t.Transform(
      t.Union(
        [
          t.String({
            format: "integer",
            default: 0
          }),
          import_typebox3.Type.Integer(property)
        ],
        property
      )
    ).Decode((value) => {
      let number = +value;
      if (!compiler.Check(number)) throw compiler.Error(number);
      return number;
    }).Encode((value) => value);
  },
  Date: (property) => {
    let schema = import_typebox3.Type.Date(property), compiler = compile(schema), _default = property?.default ? new Date(property.default) : void 0;
    return t.Transform(
      t.Union(
        [
          import_typebox3.Type.Date(property),
          t.String({
            format: "date-time",
            default: _default?.toISOString()
          }),
          t.String({
            format: "date",
            default: _default?.toISOString()
          }),
          t.Number({ default: _default?.getTime() })
        ],
        property
      )
    ).Decode((value) => {
      if (typeof value == "number") {
        let date3 = new Date(value);
        if (!compiler.Check(date3)) throw compiler.Error(date3);
        return date3;
      }
      if (value instanceof Date) return value;
      let date2 = new Date(parseDateTimeEmptySpace(value));
      if (!date2 || isNaN(date2.getTime()))
        throw new ValidationError("property", schema, date2);
      if (!compiler.Check(date2)) throw compiler.Error(date2);
      return date2;
    }).Encode((value) => value.toISOString());
  },
  BooleanString: (property) => {
    let schema = import_typebox3.Type.Boolean(property), compiler = compile(schema);
    return t.Transform(
      t.Union(
        [
          t.Boolean(property),
          t.String({
            format: "boolean",
            default: !1
          })
        ],
        property
      )
    ).Decode((value) => {
      if (typeof value == "string") return value === "true";
      if (value !== void 0 && !compiler.Check(value))
        throw compiler.Error(value);
      return value;
    }).Encode((value) => value);
  },
  ObjectString: (properties, options) => {
    let schema = t.Object(properties, options), compiler = compile(schema), defaultValue = JSON.stringify(compiler.Create());
    return t.Transform(
      t.Union([
        t.String({
          format: "ObjectString",
          default: defaultValue
        }),
        schema
      ])
    ).Decode((value) => {
      if (typeof value == "string") {
        if (value.charCodeAt(0) !== 123)
          throw new ValidationError("property", schema, value);
        if (!compiler.Check(value = tryParse(value, schema)))
          throw compiler.Error(value);
        return compiler.Decode(value);
      }
      return value;
    }).Encode((value) => {
      let original;
      if (typeof value == "string" && (value = tryParse(original = value, schema)), !compiler.Check(value)) throw compiler.Error(value);
      return original ?? JSON.stringify(value);
    });
  },
  ArrayString: (children = t.String(), options) => {
    let schema = t.Array(children, options), compiler = compile(schema), decode4 = (value, isProperty = !1) => {
      if (value.charCodeAt(0) === 91) {
        if (!compiler.Check(value = tryParse(value, schema)))
          throw compiler.Error(value);
        return compiler.Decode(value);
      }
      if (value.indexOf(",") !== -1) {
        if (!compiler.Check(value)) throw compiler.Error(value);
        return compiler.Decode(value);
      }
      if (isProperty) return value;
      throw new ValidationError("property", schema, value);
    };
    return t.Transform(
      t.Union([
        t.String({
          format: "ArrayString",
          default: options?.default
        }),
        schema
      ])
    ).Decode((value) => {
      if (Array.isArray(value)) {
        let values = [];
        for (let i = 0; i < value.length; i++) {
          let v = value[i];
          if (typeof v == "string") {
            let t2 = decode4(v, !0);
            Array.isArray(t2) ? values = values.concat(t2) : values.push(t2);
            continue;
          }
          values.push(v);
        }
        return values;
      }
      return typeof value == "string" ? decode4(value) : value;
    }).Encode((value) => {
      let original;
      if (typeof value == "string" && (value = tryParse(original = value, schema)), !compiler.Check(value))
        throw new ValidationError("property", schema, value);
      return original ?? JSON.stringify(value);
    });
  },
  File: createType(
    "File",
    validateFile
  ),
  Files: (options = {}) => t.Transform(internalFiles(options)).Decode((value) => Array.isArray(value) ? value : [value]).Encode((value) => value),
  Nullable: (schema, options) => t.Union([schema, t.Null()], options),
  /**
   * Allow Optional, Nullable and Undefined
   */
  MaybeEmpty: (schema, options) => t.Union([schema, t.Null(), t.Undefined()], options),
  Cookie: (properties, {
    domain,
    expires,
    httpOnly,
    maxAge,
    path,
    priority,
    sameSite,
    secure,
    secrets,
    sign,
    ...options
  } = {}) => {
    let v = t.Object(properties, options);
    return v.config = {
      domain,
      expires,
      httpOnly,
      maxAge,
      path,
      priority,
      sameSite,
      secure,
      secrets,
      sign
    }, v;
  },
  UnionEnum: (values, options = {}) => {
    let type = values.every((value) => typeof value == "string") ? { type: "string" } : values.every((value) => typeof value == "number") ? { type: "number" } : values.every((value) => value === null) ? { type: "null" } : {};
    if (values.some((x) => typeof x == "object" && x !== null))
      throw new Error("This type does not support objects or arrays");
    return {
      // default is need for generating error message
      default: values[0],
      ...options,
      [import_typebox3.Kind]: "UnionEnum",
      ...type,
      enum: values
    };
  },
  NoValidate: (v, enabled = !0) => (v.noValidate = enabled, v),
  Form: (v, options = {}) => {
    let schema = t.Object(v, {
      default: form({}),
      ...options
    }), compiler = compile(schema);
    return t.Union([
      schema,
      // @ts-expect-error
      internalFormData({
        compiler
      })
    ]);
  }
};
t.BooleanString = ElysiaType.BooleanString;
t.ObjectString = ElysiaType.ObjectString;
t.ArrayString = ElysiaType.ArrayString;
t.Numeric = ElysiaType.Numeric;
t.Integer = ElysiaType.Integer;
t.File = (arg) => (arg?.type && loadFileType(), ElysiaType.File({
  default: "File",
  ...arg,
  extension: arg?.type,
  type: "string",
  format: "binary"
}));
t.Files = (arg) => (arg?.type && loadFileType(), ElysiaType.Files({
  ...arg,
  elysiaMeta: "Files",
  default: "Files",
  extension: arg?.type,
  type: "array",
  items: {
    ...arg,
    default: "Files",
    type: "string",
    format: "binary"
  }
}));
t.Nullable = (schema) => ElysiaType.Nullable(schema);
t.MaybeEmpty = ElysiaType.MaybeEmpty;
t.Cookie = ElysiaType.Cookie;
t.Date = ElysiaType.Date;
t.UnionEnum = ElysiaType.UnionEnum;
t.NoValidate = ElysiaType.NoValidate;
t.Form = ElysiaType.Form;

// src/schema.ts
var isOptional = (schema) => schema ? schema?.[import_typebox5.Kind] === "Import" && schema.References ? schema.References().some(isOptional) : (schema.schema && (schema = schema.schema), !!schema && import_typebox5.OptionalKind in schema) : !1, hasAdditionalProperties = (_schema) => {
  if (!_schema) return !1;
  let schema = _schema?.schema ?? _schema;
  if (schema[import_typebox5.Kind] === "Import" && _schema.References)
    return _schema.References().some(hasAdditionalProperties);
  if (schema.anyOf) return schema.anyOf.some(hasAdditionalProperties);
  if (schema.someOf) return schema.someOf.some(hasAdditionalProperties);
  if (schema.allOf) return schema.allOf.some(hasAdditionalProperties);
  if (schema.not) return schema.not.some(hasAdditionalProperties);
  if (schema.type === "object") {
    let properties = schema.properties;
    if ("additionalProperties" in schema) return schema.additionalProperties;
    if ("patternProperties" in schema) return !1;
    for (let key of Object.keys(properties)) {
      let property = properties[key];
      if (property.type === "object") {
        if (hasAdditionalProperties(property)) return !0;
      } else if (property.anyOf) {
        for (let i = 0; i < property.anyOf.length; i++)
          if (hasAdditionalProperties(property.anyOf[i])) return !0;
      }
      return property.additionalProperties;
    }
    return !1;
  }
  return schema.type === "array" && schema.items && !Array.isArray(schema.items) ? hasAdditionalProperties(schema.items) : !1;
}, hasType = (type, schema) => {
  if (!schema) return !1;
  if (import_typebox5.Kind in schema && schema[import_typebox5.Kind] === type) return !0;
  if (schema.type === "object") {
    let properties = schema.properties;
    if (!properties) return !1;
    for (let key of Object.keys(properties)) {
      let property = properties[key];
      if (property.type === "object") {
        if (hasType(type, property)) return !0;
      } else if (property.anyOf) {
        for (let i = 0; i < property.anyOf.length; i++)
          if (hasType(type, property.anyOf[i])) return !0;
      }
      if (import_typebox5.Kind in property && property[import_typebox5.Kind] === type) return !0;
    }
    return !1;
  }
  return !!schema.properties && import_typebox5.Kind in schema.properties && schema.properties[import_typebox5.Kind] === type;
}, hasProperty = (expectedProperty, _schema) => {
  if (!_schema) return;
  let schema = _schema.schema ?? _schema;
  if (schema[import_typebox5.Kind] === "Import" && _schema.References)
    return _schema.References().some((schema2) => hasProperty(expectedProperty, schema2));
  if (schema.type === "object") {
    let properties = schema.properties;
    if (!properties) return !1;
    for (let key of Object.keys(properties)) {
      let property = properties[key];
      if (expectedProperty in property) return !0;
      if (property.type === "object") {
        if (hasProperty(expectedProperty, property)) return !0;
      } else if (property.anyOf) {
        for (let i = 0; i < property.anyOf.length; i++)
          if (hasProperty(expectedProperty, property.anyOf[i]))
            return !0;
      }
    }
    return !1;
  }
  return expectedProperty in schema;
}, hasRef = (schema) => {
  if (!schema) return !1;
  if (schema.oneOf) {
    for (let i = 0; i < schema.oneOf.length; i++)
      if (hasRef(schema.oneOf[i])) return !0;
  }
  if (schema.anyOf) {
    for (let i = 0; i < schema.anyOf.length; i++)
      if (hasRef(schema.anyOf[i])) return !0;
  }
  if (schema.oneOf) {
    for (let i = 0; i < schema.oneOf.length; i++)
      if (hasRef(schema.oneOf[i])) return !0;
  }
  if (schema.allOf) {
    for (let i = 0; i < schema.allOf.length; i++)
      if (hasRef(schema.allOf[i])) return !0;
  }
  if (schema.not && hasRef(schema.not)) return !0;
  if (schema.type === "object" && schema.properties) {
    let properties = schema.properties;
    for (let key of Object.keys(properties)) {
      let property = properties[key];
      if (hasRef(property) || property.type === "array" && property.items && hasRef(property.items))
        return !0;
    }
  }
  return schema.type === "array" && schema.items && hasRef(schema.items) ? !0 : schema[import_typebox5.Kind] === "Ref" && "$ref" in schema;
}, hasTransform = (schema) => {
  if (!schema) return !1;
  if (schema.$ref && schema.$defs && schema.$ref in schema.$defs && hasTransform(schema.$defs[schema.$ref]))
    return !0;
  if (schema.oneOf) {
    for (let i = 0; i < schema.oneOf.length; i++)
      if (hasTransform(schema.oneOf[i])) return !0;
  }
  if (schema.anyOf) {
    for (let i = 0; i < schema.anyOf.length; i++)
      if (hasTransform(schema.anyOf[i])) return !0;
  }
  if (schema.allOf) {
    for (let i = 0; i < schema.allOf.length; i++)
      if (hasTransform(schema.allOf[i])) return !0;
  }
  if (schema.not && hasTransform(schema.not)) return !0;
  if (schema.type === "object" && schema.properties) {
    let properties = schema.properties;
    for (let key of Object.keys(properties)) {
      let property = properties[key];
      if (hasTransform(property) || property.type === "array" && property.items && hasTransform(property.items))
        return !0;
    }
  }
  return schema.type === "array" && schema.items && hasTransform(schema.items) ? !0 : import_typebox5.TransformKind in schema;
}, replaceSchemaType = (schema, options, _config = {}) => {
  let config = _config;
  if (config.root = !0, !Array.isArray(options))
    return options.original = schema, _replaceSchemaType(schema, options, config);
  for (let option of options)
    option.original = schema, schema = _replaceSchemaType(schema, option, config);
  return schema;
}, _replaceSchemaType = (schema, options, config) => {
  if (!schema) return schema;
  let root = config.root;
  if (options.untilObjectFound && !root && schema.type === "object")
    return schema;
  let fromSymbol = options.from[import_typebox5.Kind];
  if (schema.oneOf) {
    for (let i = 0; i < schema.oneOf.length; i++)
      schema.oneOf[i] = _replaceSchemaType(
        schema.oneOf[i],
        options,
        config
      );
    return schema;
  }
  if (schema.anyOf) {
    for (let i = 0; i < schema.anyOf.length; i++)
      schema.anyOf[i] = _replaceSchemaType(
        schema.anyOf[i],
        options,
        config
      );
    return schema;
  }
  if (schema.allOf) {
    for (let i = 0; i < schema.allOf.length; i++)
      schema.allOf[i] = _replaceSchemaType(
        schema.allOf[i],
        options,
        config
      );
    return schema;
  }
  if (schema.not) return _replaceSchemaType(schema.not, options, config);
  let isRoot = root && !!options.excludeRoot;
  if (schema[import_typebox5.Kind] === fromSymbol) {
    let { anyOf, oneOf, allOf, not, properties: properties2, items, ...rest } = schema, to = options.to(rest);
    if (!to) return schema;
    let transform, composeProperties = (schema2) => {
      let v = _composeProperties(schema2);
      return v.$id && delete v.$id, v;
    }, _composeProperties = (v) => {
      if (properties2 && v.type === "object") {
        let newProperties = {};
        for (let [key, value2] of Object.entries(properties2))
          newProperties[key] = _replaceSchemaType(
            value2,
            options,
            {
              ...config,
              root: !1
            }
          );
        return {
          ...rest,
          ...v,
          properties: newProperties
        };
      }
      if (items && v.type === "array")
        return {
          ...rest,
          ...v,
          items: _replaceSchemaType(items, options, {
            ...config,
            root: !1
          })
        };
      let value = {
        ...rest,
        ...v
      };
      return delete value.required, properties2 && v.type === "string" && v.format === "ObjectString" && v.default === "{}" && (transform = t.ObjectString(properties2, rest), value.default = JSON.stringify(
        import_value3.Value.Create(t.Object(properties2))
      ), value.properties = properties2), items && v.type === "string" && v.format === "ArrayString" && v.default === "[]" && (transform = t.ArrayString(items, rest), value.default = JSON.stringify(import_value3.Value.Create(t.Array(items))), value.items = items), value;
    };
    if (isRoot) {
      if (properties2) {
        let newProperties = {};
        for (let [key, value] of Object.entries(properties2))
          newProperties[key] = _replaceSchemaType(
            value,
            options,
            {
              ...config,
              root: !1
            }
          );
        return {
          ...rest,
          properties: newProperties
        };
      } else if (items?.map)
        return {
          ...rest,
          items: items.map(
            (v) => _replaceSchemaType(v, options, {
              ...config,
              root: !1
            })
          )
        };
      return rest;
    }
    if (to.anyOf)
      for (let i = 0; i < to.anyOf.length; i++)
        to.anyOf[i] = composeProperties(to.anyOf[i]);
    else if (to.oneOf)
      for (let i = 0; i < to.oneOf.length; i++)
        to.oneOf[i] = composeProperties(to.oneOf[i]);
    else if (to.allOf)
      for (let i = 0; i < to.allOf.length; i++)
        to.allOf[i] = composeProperties(to.allOf[i]);
    else to.not && (to.not = composeProperties(to.not));
    if (transform && (to[import_typebox5.TransformKind] = transform[import_typebox5.TransformKind]), to.anyOf || to.oneOf || to.allOf || to.not) return to;
    if (properties2) {
      let newProperties = {};
      for (let [key, value] of Object.entries(properties2))
        newProperties[key] = _replaceSchemaType(
          value,
          options,
          {
            ...config,
            root: !1
          }
        );
      return {
        ...rest,
        ...to,
        properties: newProperties
      };
    } else if (items?.map)
      return {
        ...rest,
        ...to,
        items: items.map(
          (v) => _replaceSchemaType(v, options, {
            ...config,
            root: !1
          })
        )
      };
    return {
      ...rest,
      ...to
    };
  }
  let properties = schema?.properties;
  if (properties && root && options.rootOnly !== !0)
    for (let [key, value] of Object.entries(properties))
      switch (value[import_typebox5.Kind]) {
        case fromSymbol:
          let { anyOf, oneOf, allOf, not, type, ...rest } = value, to = options.to(rest);
          if (!to) return schema;
          if (to.anyOf)
            for (let i = 0; i < to.anyOf.length; i++)
              to.anyOf[i] = { ...rest, ...to.anyOf[i] };
          else if (to.oneOf)
            for (let i = 0; i < to.oneOf.length; i++)
              to.oneOf[i] = { ...rest, ...to.oneOf[i] };
          else if (to.allOf)
            for (let i = 0; i < to.allOf.length; i++)
              to.allOf[i] = { ...rest, ...to.allOf[i] };
          else to.not && (to.not = { ...rest, ...to.not });
          properties[key] = {
            ...rest,
            ..._replaceSchemaType(rest, options, {
              ...config,
              root: !1
            })
          };
          break;
        case "Object":
        case "Union":
          properties[key] = _replaceSchemaType(value, options, {
            ...config,
            root: !1
          });
          break;
        default:
          if (Array.isArray(value.items))
            for (let i = 0; i < value.items.length; i++)
              value.items[i] = _replaceSchemaType(
                value.items[i],
                options,
                {
                  ...config,
                  root: !1
                }
              );
          else value.anyOf || value.oneOf || value.allOf || value.not ? properties[key] = _replaceSchemaType(value, options, {
            ...config,
            root: !1
          }) : value.type === "array" && (value.items = _replaceSchemaType(value.items, options, {
            ...config,
            root: !1
          }));
          break;
      }
  return schema;
}, createCleaner = (schema) => (value) => {
  if (typeof value == "object")
    try {
      return import_value3.Value.Clean(schema, value);
    } catch {
      try {
        return import_value3.Value.Clean(schema, value);
      } catch {
        return value;
      }
    }
  return value;
}, getSchemaValidator = (s, {
  models = {},
  dynamic = !1,
  modules,
  normalize = !1,
  additionalProperties = !1,
  coerce = !1,
  additionalCoerce = [],
  validators,
  sanitize
} = {}) => {
  if (validators = validators?.filter((x) => x), !s) {
    if (!validators?.length) return;
    s = validators[0], validators = validators.slice(1);
  }
  let doesHaveRef, replaceSchema = (schema2) => coerce ? replaceSchemaType(schema2, [
    {
      from: t.Number(),
      to: (options) => t.Numeric(options),
      untilObjectFound: !0
    },
    {
      from: t.Boolean(),
      to: (options) => t.BooleanString(options),
      untilObjectFound: !0
    },
    ...Array.isArray(additionalCoerce) ? additionalCoerce : [additionalCoerce]
  ]) : replaceSchemaType(schema2, additionalCoerce), mapSchema = (s2) => {
    let schema2;
    if (!s2) return;
    if (typeof s2 != "string") schema2 = s2;
    else {
      let isArray = s2.endsWith("[]"), key = isArray ? s2.substring(0, s2.length - 2) : s2;
      schema2 = modules?.Import(
        key
      ) ?? models[key], isArray && (schema2 = t.Array(schema2));
    }
    if (!schema2) return;
    let _doesHaveRef;
    if (schema2[import_typebox5.Kind] !== "Import" && (_doesHaveRef = hasRef(schema2))) {
      let id = randomId();
      doesHaveRef === void 0 && (doesHaveRef = _doesHaveRef), schema2 = t.Module({
        // @ts-expect-error private property
        ...modules?.$defs,
        [id]: schema2
      }).Import(id);
    }
    if (schema2[import_typebox5.Kind] === "Import") {
      let newDefs = {};
      for (let [key2, value] of Object.entries(schema2.$defs))
        newDefs[key2] = replaceSchema(value);
      let key = schema2.$ref;
      schema2 = t.Module(newDefs).Import(key);
    } else (coerce || additionalCoerce) && (schema2 = replaceSchema(schema2));
    return schema2;
  }, schema = mapSchema(s);
  if (validators?.length) {
    let hasAdditional = !1, { schema: mergedObjectSchema, notObjects } = mergeObjectSchemas([
      schema,
      ...validators.map(mapSchema)
    ]);
    notObjects && (schema = t.Intersect([
      ...mergedObjectSchema ? [mergedObjectSchema] : [],
      ...notObjects.map((x) => {
        let schema2 = mapSchema(x);
        return schema2.type === "object" && "additionalProperties" in schema2 && (!hasAdditional && schema2.additionalProperties === !1 && (hasAdditional = !0), delete schema2.additionalProperties), schema2;
      })
    ]), schema.type === "object" && hasAdditional && (schema.additionalProperties = !1));
  } else
    schema.type === "object" && !("additionalProperties" in schema) && (schema.additionalProperties = additionalProperties);
  if (dynamic) {
    let validator = {
      schema,
      references: "",
      checkFunc: () => {
      },
      code: "",
      // @ts-expect-error
      Check: (value) => import_value3.Value.Check(schema, value),
      Errors: (value) => import_value3.Value.Errors(schema, value),
      Code: () => "",
      Clean: createCleaner(schema),
      Decode: (value) => import_value3.Value.Decode(schema, value),
      Encode: (value) => import_value3.Value.Encode(schema, value),
      get hasAdditionalProperties() {
        return "~hasAdditionalProperties" in this ? this["~hasAdditionalProperties"] : this["~hasAdditionalProperties"] = hasAdditionalProperties(schema);
      },
      get hasDefault() {
        return "~hasDefault" in this ? this["~hasDefault"] : this["~hasDefault"] = hasProperty("default", schema);
      },
      get isOptional() {
        return "~isOptional" in this ? this["~isOptional"] : this["~isOptional"] = isOptional(schema);
      },
      get hasTransform() {
        return "~hasTransform" in this ? this["~hasTransform"] : this["~hasTransform"] = hasTransform(schema);
      },
      "~hasRef": doesHaveRef,
      get hasRef() {
        return "~hasRef" in this ? this["~hasRef"] : this["~hasRef"] = hasTransform(schema);
      }
    };
    if (schema.config && (validator.config = schema.config, validator?.schema?.config && delete validator.schema.config), normalize && schema.additionalProperties === !1)
      if (normalize === !0 || normalize === "exactMirror")
        try {
          validator.Clean = (0, import_exact_mirror.createMirror)(schema, {
            TypeCompiler: import_compiler3.TypeCompiler,
            sanitize: sanitize?.(),
            modules
          });
        } catch {
          console.warn(
            "Failed to create exactMirror. Please report the following code to https://github.com/elysiajs/elysia/issues"
          ), console.warn(schema), validator.Clean = createCleaner(schema);
        }
      else validator.Clean = createCleaner(schema);
    return validator.parse = (v) => {
      try {
        return validator.Decode(v);
      } catch {
        throw [...validator.Errors(v)].map(mapValueError);
      }
    }, validator.safeParse = (v) => {
      try {
        return { success: !0, data: validator.Decode(v), error: null };
      } catch {
        let errors = [...compiled.Errors(v)].map(mapValueError);
        return {
          success: !1,
          data: null,
          error: errors[0]?.summary,
          errors
        };
      }
    }, validator;
  }
  let compiled = import_compiler3.TypeCompiler.Compile(
    schema,
    Object.values(models)
  );
  if (schema.config && (compiled.config = schema.config, compiled?.schema?.config && delete compiled.schema.config), normalize === !0 || normalize === "exactMirror")
    try {
      compiled.Clean = (0, import_exact_mirror.createMirror)(schema, {
        TypeCompiler: import_compiler3.TypeCompiler,
        sanitize: sanitize?.(),
        modules
      });
    } catch {
      console.warn(
        "Failed to create exactMirror. Please report the following code to https://github.com/elysiajs/elysia/issues"
      ), console.warn(schema), compiled.Clean = createCleaner(schema);
    }
  else compiled.Clean = createCleaner(schema);
  return compiled.parse = (v) => {
    try {
      return compiled.Decode(v);
    } catch {
      throw [...compiled.Errors(v)].map(mapValueError);
    }
  }, compiled.safeParse = (v) => {
    try {
      return { success: !0, data: compiled.Decode(v), error: null };
    } catch {
      let errors = [...compiled.Errors(v)].map(mapValueError);
      return {
        success: !1,
        data: null,
        error: errors[0]?.summary,
        errors
      };
    }
  }, Object.assign(compiled, {
    get hasAdditionalProperties() {
      return "~hasAdditionalProperties" in this ? this["~hasAdditionalProperties"] : this["~hasAdditionalProperties"] = hasAdditionalProperties(compiled);
    },
    get hasDefault() {
      return "~hasDefault" in this ? this["~hasDefault"] : this["~hasDefault"] = hasProperty("default", compiled);
    },
    get isOptional() {
      return "~isOptional" in this ? this["~isOptional"] : this["~isOptional"] = isOptional(compiled);
    },
    get hasTransform() {
      return "~hasTransform" in this ? this["~hasTransform"] : this["~hasTransform"] = hasTransform(schema);
    },
    get hasRef() {
      return "~hasRef" in this ? this["~hasRef"] : this["~hasRef"] = hasRef(schema);
    },
    "~hasRef": doesHaveRef
  }), compiled;
}, isUnion = (schema) => schema[import_typebox5.Kind] === "Union" || !schema.schema && !!schema.anyOf, mergeObjectSchemas = (schemas) => {
  if (schemas.length === 0)
    return {
      schema: void 0,
      notObjects: []
    };
  if (schemas.length === 1)
    return schemas[0].type === "object" ? {
      schema: schemas[0],
      notObjects: []
    } : {
      schema: void 0,
      notObjects: schemas
    };
  let newSchema, notObjects = [], additionalPropertiesIsTrue = !1, additionalPropertiesIsFalse = !1;
  for (let schema of schemas) {
    if (schema.type !== "object") {
      notObjects.push(schema);
      continue;
    }
    if ("additionalProperties" in schema && (schema.additionalProperties === !0 ? additionalPropertiesIsTrue = !0 : schema.additionalProperties === !1 && (additionalPropertiesIsFalse = !0)), !newSchema) {
      newSchema = schema;
      continue;
    }
    newSchema = {
      ...newSchema,
      ...schema,
      properties: {
        ...newSchema.properties,
        ...schema.properties
      },
      required: [...newSchema?.required ?? [], ...schema.required]
    };
  }
  return newSchema && (newSchema.required && (newSchema.required = [...new Set(newSchema.required)]), additionalPropertiesIsFalse ? newSchema.additionalProperties = !1 : additionalPropertiesIsTrue && (newSchema.additionalProperties = !0)), {
    schema: newSchema,
    notObjects
  };
};
var _stringToStructureCoercions, stringToStructureCoercions = () => (_stringToStructureCoercions || (_stringToStructureCoercions = [
  {
    from: t.Object({}),
    to: () => t.ObjectString({}),
    excludeRoot: !0
  },
  {
    from: t.Array(t.Any()),
    to: () => t.ArrayString(t.Any())
  }
]), _stringToStructureCoercions), _coercePrimitiveRoot, coercePrimitiveRoot = () => (_coercePrimitiveRoot || (_coercePrimitiveRoot = [
  {
    from: t.Number(),
    to: (options) => t.Numeric(options),
    rootOnly: !0
  },
  {
    from: t.Boolean(),
    to: (options) => t.BooleanString(options),
    rootOnly: !0
  }
]), _coercePrimitiveRoot), getCookieValidator = ({
  validator,
  modules,
  defaultConfig = {},
  config,
  dynamic,
  models,
  validators,
  sanitize
}) => {
  let cookieValidator = getSchemaValidator(validator, {
    modules,
    dynamic,
    models,
    additionalProperties: !0,
    coerce: !0,
    additionalCoerce: stringToStructureCoercions(),
    validators,
    sanitize
  });
  return cookieValidator ? cookieValidator.config = mergeCookie(cookieValidator.config, config) : (cookieValidator = getSchemaValidator(t.Cookie(t.Any()), {
    modules,
    dynamic,
    models,
    additionalProperties: !0,
    validators,
    sanitize
  }), cookieValidator.config = defaultConfig), cookieValidator;
};

// src/sucrose.ts
var separateFunction = (code) => {
  code.startsWith("async") && (code = code.slice(5)), code = code.trimStart();
  let index = -1;
  if (code.charCodeAt(0) === 40 && (index = code.indexOf("=>", code.indexOf(")")), index !== -1)) {
    let bracketEndIndex = index;
    for (; bracketEndIndex > 0 && code.charCodeAt(--bracketEndIndex) !== 41; )
      ;
    let body = code.slice(index + 2);
    return body.charCodeAt(0) === 32 && (body = body.trimStart()), [
      code.slice(1, bracketEndIndex),
      body,
      {
        isArrowReturn: body.charCodeAt(0) !== 123
      }
    ];
  }
  if (/^(\w+)=>/g.test(code) && (index = code.indexOf("=>"), index !== -1)) {
    let body = code.slice(index + 2);
    return body.charCodeAt(0) === 32 && (body = body.trimStart()), [
      code.slice(0, index),
      body,
      {
        isArrowReturn: body.charCodeAt(0) !== 123
      }
    ];
  }
  if (code.startsWith("function")) {
    index = code.indexOf("(");
    let end = code.indexOf(")");
    return [
      code.slice(index + 1, end),
      code.slice(end + 2),
      {
        isArrowReturn: !1
      }
    ];
  }
  let start = code.indexOf("(");
  if (start !== -1) {
    let sep = code.indexOf(`
`, 2), parameter = code.slice(0, sep), end = parameter.lastIndexOf(")") + 1, body = code.slice(sep + 1);
    return [
      parameter.slice(start, end),
      "{" + body,
      {
        isArrowReturn: !1
      }
    ];
  }
  let x = code.split(`
`, 2);
  return [x[0], x[1], { isArrowReturn: !1 }];
}, bracketPairRange = (parameter) => {
  let start = parameter.indexOf("{");
  if (start === -1) return [-1, 0];
  let end = start + 1, deep = 1;
  for (; end < parameter.length; end++) {
    let char = parameter.charCodeAt(end);
    if (char === 123 ? deep++ : char === 125 && deep--, deep === 0) break;
  }
  return deep !== 0 ? [0, parameter.length] : [start, end + 1];
}, bracketPairRangeReverse = (parameter) => {
  let end = parameter.lastIndexOf("}");
  if (end === -1) return [-1, 0];
  let start = end - 1, deep = 1;
  for (; start >= 0; start--) {
    let char = parameter.charCodeAt(start);
    if (char === 125 ? deep++ : char === 123 && deep--, deep === 0) break;
  }
  return deep !== 0 ? [-1, 0] : [start, end + 1];
}, removeColonAlias = (parameter) => {
  for (; ; ) {
    let start = parameter.indexOf(":");
    if (start === -1) break;
    let end = parameter.indexOf(",", start);
    end === -1 && (end = parameter.indexOf("}", start) - 1), end === -2 && (end = parameter.length), parameter = parameter.slice(0, start) + parameter.slice(end);
  }
  return parameter;
}, retrieveRootParamters = (parameter) => {
  let hasParenthesis = !1;
  parameter.charCodeAt(0) === 40 && (parameter = parameter.slice(1, -1)), parameter.charCodeAt(0) === 123 && (hasParenthesis = !0, parameter = parameter.slice(1, -1)), parameter = parameter.replace(/( |\t|\n)/g, "").trim();
  let parameters = [];
  for (; ; ) {
    let [start, end] = bracketPairRange(parameter);
    if (start === -1) break;
    parameters.push(parameter.slice(0, start - 1)), parameter.charCodeAt(end) === 44 && end++, parameter = parameter.slice(end);
  }
  parameter = removeColonAlias(parameter), parameter && (parameters = parameters.concat(parameter.split(",")));
  let parameterMap = /* @__PURE__ */ Object.create(null);
  for (let p of parameters) {
    if (p.indexOf(",") === -1) {
      parameterMap[p] = !0;
      continue;
    }
    for (let q of p.split(",")) parameterMap[q.trim()] = !0;
  }
  return {
    hasParenthesis,
    parameters: parameterMap
  };
}, findParameterReference = (parameter, inference) => {
  let { parameters, hasParenthesis } = retrieveRootParamters(parameter);
  return parameters.query && (inference.query = !0), parameters.headers && (inference.headers = !0), parameters.body && (inference.body = !0), parameters.cookie && (inference.cookie = !0), parameters.set && (inference.set = !0), parameters.server && (inference.server = !0), parameters.route && (inference.route = !0), parameters.url && (inference.url = !0), parameters.path && (inference.path = !0), hasParenthesis ? `{ ${Object.keys(parameters).join(", ")} }` : Object.keys(parameters).join(", ");
}, findEndIndex = (type, content, index) => {
  let regex2 = new RegExp(
    `${type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\n\\t,; ]`
  );
  index !== void 0 && (regex2.lastIndex = index);
  let match = regex2.exec(content);
  return match ? match.index : -1;
};
var findAlias = (type, body, depth = 0) => {
  if (depth > 5) return [];
  let aliases = [], content = body;
  for (; ; ) {
    let index = findEndIndex(" = " + type, content);
    if (index === -1 && (index = findEndIndex("=" + type, content)), index === -1) {
      let lastIndex = content.indexOf(" = " + type);
      if (lastIndex === -1 && (lastIndex = content.indexOf("=" + type)), lastIndex + 3 + type.length !== content.length) break;
      index = lastIndex;
    }
    let part = content.slice(0, index), lastPart = part.lastIndexOf(" "), variable = part.slice(lastPart !== -1 ? lastPart + 1 : -1);
    if (variable === "}") {
      let [start, end] = bracketPairRangeReverse(part);
      aliases.push(removeColonAlias(content.slice(start, end))), content = content.slice(index + 3 + type.length);
      continue;
    }
    for (; variable.charCodeAt(0) === 44; ) variable = variable.slice(1);
    for (; variable.charCodeAt(0) === 9; ) variable = variable.slice(1);
    variable.includes("(") || aliases.push(variable), content = content.slice(index + 3 + type.length);
  }
  for (let alias of aliases) {
    if (alias.charCodeAt(0) === 123) continue;
    let deepAlias = findAlias(alias, body);
    deepAlias.length > 0 && aliases.push(...deepAlias);
  }
  return aliases;
}, extractMainParameter = (parameter) => {
  if (!parameter) return;
  if (parameter.charCodeAt(0) !== 123) return parameter;
  if (parameter = parameter.slice(2, -2), !parameter.includes(","))
    return parameter.indexOf("...") !== -1 ? parameter.slice(parameter.indexOf("...") + 3) : void 0;
  let spreadIndex = parameter.indexOf("...");
  if (spreadIndex !== -1)
    return parameter.slice(spreadIndex + 3).trimEnd();
}, inferBodyReference = (code, aliases, inference) => {
  let access = (type, alias) => new RegExp(
    `${alias}\\.(${type})|${alias}\\["${type}"\\]|${alias}\\['${type}'\\]`
  ).test(code);
  for (let alias of aliases)
    if (alias) {
      if (alias.charCodeAt(0) === 123) {
        let parameters = retrieveRootParamters(alias).parameters;
        parameters.query && (inference.query = !0), parameters.headers && (inference.headers = !0), parameters.body && (inference.body = !0), parameters.cookie && (inference.cookie = !0), parameters.set && (inference.set = !0), parameters.server && (inference.server = !0), parameters.url && (inference.url = !0), parameters.route && (inference.route = !0), parameters.path && (inference.path = !0);
        continue;
      }
      if (!inference.query && (access("query", alias) || code.includes("return " + alias) || code.includes("return " + alias + ".query")) && (inference.query = !0), !inference.headers && access("headers", alias) && (inference.headers = !0), !inference.body && access("body", alias) && (inference.body = !0), !inference.cookie && access("cookie", alias) && (inference.cookie = !0), !inference.set && access("set", alias) && (inference.set = !0), !inference.server && access("server", alias) && (inference.server = !0), !inference.route && access("route", alias) && (inference.route = !0), !inference.url && access("url", alias) && (inference.url = !0), !inference.path && access("path", alias) && (inference.path = !0), inference.query && inference.headers && inference.body && inference.cookie && inference.set && inference.server && inference.route && inference.url && inference.path)
        break;
    }
  return aliases;
};
var isContextPassToFunction = (context, body, inference) => {
  try {
    let captureFunction = new RegExp(`\\w\\((.*?)?${context}`, "gs");
    captureFunction.test(body);
    let nextChar = body.charCodeAt(captureFunction.lastIndex);
    return nextChar === 41 || nextChar === 44 ? (inference.query = !0, inference.headers = !0, inference.body = !0, inference.cookie = !0, inference.set = !0, inference.server = !0, inference.url = !0, inference.route = !0, inference.path = !0, !0) : !1;
  } catch {
    return console.log(
      "[Sucrose] warning: unexpected isContextPassToFunction error, you may continue development as usual but please report the following to maintainers:"
    ), console.log("--- body ---"), console.log(body), console.log("--- context ---"), console.log(context), !0;
  }
};
var caches = {};
var mergeInference = (a, b) => ({
  body: a.body || b.body,
  cookie: a.cookie || b.cookie,
  headers: a.headers || b.headers,
  query: a.query || b.query,
  set: a.set || b.set,
  server: a.server || b.server,
  url: a.url || b.url,
  route: a.route || b.route,
  path: a.path || b.path
}), sucrose = (lifeCycle, inference = {
  query: !1,
  headers: !1,
  body: !1,
  cookie: !1,
  set: !1,
  server: !1,
  url: !1,
  route: !1,
  path: !1
}) => {
  let events = [];
  lifeCycle.request?.length && events.push(...lifeCycle.request), lifeCycle.beforeHandle?.length && events.push(...lifeCycle.beforeHandle), lifeCycle.parse?.length && events.push(...lifeCycle.parse), lifeCycle.error?.length && events.push(...lifeCycle.error), lifeCycle.transform?.length && events.push(...lifeCycle.transform), lifeCycle.afterHandle?.length && events.push(...lifeCycle.afterHandle), lifeCycle.mapResponse?.length && events.push(...lifeCycle.mapResponse), lifeCycle.afterResponse?.length && events.push(...lifeCycle.afterResponse), lifeCycle.handler && typeof lifeCycle.handler == "function" && events.push(lifeCycle.handler);
  for (let i = 0; i < events.length; i++) {
    let e = events[i];
    if (!e) continue;
    let event = typeof e == "object" ? e.fn : e;
    if (typeof event != "function") continue;
    let content = event.toString(), key = checksum(content), cachedInference = caches[key];
    if (cachedInference) {
      inference = mergeInference(inference, cachedInference);
      continue;
    }
    let fnInference = {
      query: !1,
      headers: !1,
      body: !1,
      cookie: !1,
      set: !1,
      server: !1,
      url: !1,
      route: !1,
      path: !1
    }, [parameter, body] = separateFunction(content), rootParameters = findParameterReference(parameter, fnInference), mainParameter = extractMainParameter(rootParameters);
    if (mainParameter) {
      let aliases = findAlias(mainParameter, body.slice(1, -1));
      aliases.splice(0, -1, mainParameter);
      let code = body;
      code.charCodeAt(0) === 123 && code.charCodeAt(body.length - 1) === 125 && (code = code.slice(1, -1)), isContextPassToFunction(mainParameter, code, fnInference) || inferBodyReference(code, aliases, fnInference), !fnInference.query && code.includes("return " + mainParameter + ".query") && (fnInference.query = !0);
    }
    if (caches[key] || (caches[key] = fnInference), inference = mergeInference(inference, fnInference), inference.query && inference.headers && inference.body && inference.cookie && inference.set && inference.server && inference.url && inference.route && inference.path)
      break;
  }
  return inference;
};

// src/cookies.ts
var import_cookie = require("cookie"), import_fast_decode_uri_component2 = __toESM(require("fast-decode-uri-component"));
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
    let value = (0, import_fast_decode_uri_component2.default)(v);
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
};

// src/compose.ts
var allocateIf = (value, condition) => condition ? value : "", defaultParsers = [
  "json",
  "text",
  "urlencoded",
  "arrayBuffer",
  "formdata",
  "application/json",
  // eslint-disable-next-line sonarjs/no-duplicate-string
  "text/plain",
  // eslint-disable-next-line sonarjs/no-duplicate-string
  "application/x-www-form-urlencoded",
  // eslint-disable-next-line sonarjs/no-duplicate-string
  "application/octet-stream",
  // eslint-disable-next-line sonarjs/no-duplicate-string
  "multipart/form-data"
], createReport = ({
  context = "c",
  trace = [],
  addFn
}) => {
  if (!trace.length)
    return () => ({
      resolveChild() {
        return () => {
        };
      },
      resolve() {
      }
    });
  for (let i = 0; i < trace.length; i++)
    addFn(
      `let report${i},reportChild${i},reportErr${i},reportErrChild${i};let trace${i}=${context}[ELYSIA_TRACE]?.[${i}]??trace[${i}](${context});
`
    );
  return (event, {
    name,
    total = 0
  } = {}) => {
    name || (name = "anonymous");
    let reporter = event === "error" ? "reportErr" : "report";
    for (let i = 0; i < trace.length; i++)
      addFn(
        `${reporter}${i} = trace${i}.${event}({id,event:'${event}',name:'${name}',begin:performance.now(),total:${total}})
`
      );
    return {
      resolve() {
        for (let i = 0; i < trace.length; i++)
          addFn(`${reporter}${i}.resolve()
`);
      },
      resolveChild(name2) {
        for (let i = 0; i < trace.length; i++)
          addFn(
            `${reporter}Child${i}=${reporter}${i}.resolveChild?.shift()?.({id,event:'${event}',name:'${name2}',begin:performance.now()})
`
          );
        return (binding) => {
          for (let i = 0; i < trace.length; i++)
            addFn(
              binding ? `if(${binding} instanceof Error){${reporter}Child${i}?.(${binding}) }else{${reporter}Child${i}?.()}` : `${reporter}Child${i}?.()
`
            );
        };
      }
    };
  };
}, composeCleaner = ({
  schema,
  name,
  type,
  typeAlias = type,
  normalize,
  ignoreTryCatch = !1
}) => !normalize || !schema.Clean || schema.hasAdditionalProperties ? "" : normalize === !0 || normalize === "exactMirror" ? ignoreTryCatch ? `${name}=validator.${typeAlias}.Clean(${name})
` : `try{${name}=validator.${typeAlias}.Clean(${name})
}catch{}` : normalize === "typebox" ? `${name}=validator.${typeAlias}.Clean(${name})
` : "", composeValidationFactory = ({
  injectResponse = "",
  normalize = !1,
  validator,
  encodeSchema = !1,
  isStaticResponse = !1,
  hasSanitize = !1
}) => ({
  validate: (type, value = `c.${type}`) => `c.set.status=422;throw new ValidationError('${type}',validator.${type},${value})`,
  response: (name = "r") => {
    if (isStaticResponse) return "";
    let code = injectResponse + `
`;
    code += `if(${name} instanceof ElysiaCustomStatusResponse){c.set.status=${name}.code
${name}=${name}.response}switch(c.set.status){`;
    for (let [status2, value] of Object.entries(validator.response)) {
      code += `
case ${status2}:if(${name} instanceof Response)break
`;
      let noValidate = value.schema?.noValidate === !0, appliedCleaner = noValidate || hasSanitize, clean = ({ ignoreTryCatch = !1 } = {}) => composeCleaner({
        name,
        schema: value,
        type: "response",
        typeAlias: `response[${status2}]`,
        normalize,
        ignoreTryCatch
      });
      appliedCleaner && (code += clean());
      let applyErrorCleaner = !appliedCleaner && normalize && !noValidate;
      encodeSchema && value.hasTransform ? code += `try{${name}=validator.response[${status2}].Encode(${name})
c.set.status=${status2}}catch{` + (applyErrorCleaner ? `try{
` + clean({ ignoreTryCatch: !0 }) + `${name}=validator.response[${status2}].Encode(${name})
}catch{throw new ValidationError('response',validator.response[${status2}],${name})}` : `throw new ValidationError('response',validator.response[${status2}],${name})`) + "}" : (appliedCleaner || (code += clean()), noValidate || (code += `if(validator.response[${status2}].Check(${name})===false)throw new ValidationError('response',validator.response[${status2}],${name})
c.set.status=${status2}
`)), code += `break
`;
    }
    return code + "}";
  }
}), isAsyncName = (v) => (v?.fn ?? v).constructor.name === "AsyncFunction", matchResponseClone = /=>\s?response\.clone\(/, matchFnReturn = /(?:return|=>)\s?\S+\(|a(?:sync|wait)/, isAsync = (v) => {
  let isObject2 = typeof v == "object";
  if (isObject2 && v.isAsync !== void 0) return v.isAsync;
  let fn = isObject2 ? v.fn : v;
  if (fn.constructor.name === "AsyncFunction") return !0;
  let literal = fn.toString();
  if (matchResponseClone.test(literal))
    return isObject2 && (v.isAsync = !1), !1;
  let result = matchFnReturn.test(literal);
  return isObject2 && (v.isAsync = result), result;
}, hasReturn = (v) => {
  let isObject2 = typeof v == "object";
  if (isObject2 && v.hasReturn !== void 0) return v.hasReturn;
  let fnLiteral = isObject2 ? v.fn.toString() : typeof v == "string" ? v.toString() : v, parenthesisEnd = fnLiteral.indexOf(")");
  if (fnLiteral.charCodeAt(parenthesisEnd + 2) === 61 && fnLiteral.charCodeAt(parenthesisEnd + 5) !== 123)
    return isObject2 && (v.hasReturn = !0), !0;
  let result = fnLiteral.includes("return");
  return isObject2 && (v.hasReturn = result), result;
}, isGenerator = (v) => {
  let fn = v?.fn ?? v;
  return fn.constructor.name === "AsyncGeneratorFunction" || fn.constructor.name === "GeneratorFunction";
}, composeHandler = ({
  app,
  path,
  method,
  hooks,
  validator,
  handler,
  allowMeta = !1,
  inference
}) => {
  let adapter = app["~adapter"].composeHandler, adapterHandler = app["~adapter"].handler, isHandleFn = typeof handler == "function";
  if (!isHandleFn && (handler = adapterHandler.mapResponse(handler, {
    // @ts-expect-error private property
    headers: app.setHeaders ?? {}
  }), hooks.parse?.length && hooks.transform?.length && hooks.beforeHandle?.length && hooks.afterHandle?.length))
    return handler instanceof Response ? Function(
      "a",
      `"use strict";
return function(){return a.clone()}`
    )(handler) : Function(
      "a",
      `"use strict";
return function(){return a}`
    )(handler);
  let handle = isHandleFn ? "handler(c)" : "handler", hasAfterResponse = !!hooks.afterResponse?.length, hasTrace = !!hooks.trace?.length, fnLiteral = "";
  if (inference = sucrose(hooks, inference), inference = sucrose(
    {
      handler
    },
    inference
  ), adapter.declare) {
    let literal = adapter.declare(inference);
    literal && (fnLiteral += literal);
  }
  inference.server && (fnLiteral += `Object.defineProperty(c,'server',{get:function(){return getServer()}})
`), validator.createBody?.(), validator.createQuery?.(), validator.createHeaders?.(), validator.createParams?.(), validator.createCookie?.(), validator.createResponse?.();
  let hasValidation = !!validator.body || !!validator.headers || !!validator.params || !!validator.query || !!validator.cookie || !!validator.response, hasQuery = inference.query || !!validator.query, requestNoBody = hooks.parse?.length === 1 && // @ts-expect-error
  hooks.parse[0].fn === "none", hasBody = method !== "" && method !== "GET" && method !== "HEAD" && (inference.body || !!validator.body || !!hooks.parse?.length) && !requestNoBody, defaultHeaders = app.setHeaders, hasDefaultHeaders = defaultHeaders && !!Object.keys(defaultHeaders).length, hasHeaders = inference.headers || !!validator.headers || adapter.preferWebstandardHeaders !== !0 && inference.body, hasCookie = inference.cookie || !!validator.cookie, cookieMeta = validator.cookie?.config ? mergeCookie(validator?.cookie?.config, app.config.cookie) : app.config.cookie, _encodeCookie = "", encodeCookie = () => {
    if (_encodeCookie) return _encodeCookie;
    if (cookieMeta?.sign) {
      if (!cookieMeta.secrets)
        throw new Error(
          `t.Cookie required secret which is not set in (${method}) ${path}.`
        );
      let secret = cookieMeta.secrets ? typeof cookieMeta.secrets == "string" ? cookieMeta.secrets : cookieMeta.secrets[0] : void 0;
      if (_encodeCookie += `const _setCookie = c.set.cookie
if(_setCookie){`, cookieMeta.sign === !0)
        _encodeCookie += `for(const [key, cookie] of Object.entries(_setCookie)){c.set.cookie[key].value=await signCookie(cookie.value,'${secret}')}`;
      else
        for (let name of cookieMeta.sign)
          _encodeCookie += `if(_setCookie['${name}']?.value)c.set.cookie['${name}'].value=await signCookie(_setCookie['${name}'].value,'${secret}')
`;
      _encodeCookie += `}
`;
    }
    return _encodeCookie;
  }, normalize = app.config.normalize, encodeSchema = app.config.encodeSchema, validation = composeValidationFactory({
    normalize,
    validator,
    encodeSchema,
    isStaticResponse: handler instanceof Response,
    hasSanitize: !!app.config.sanitize
  });
  hasHeaders && (fnLiteral += adapter.headers), hasTrace && (fnLiteral += `const id=c[ELYSIA_REQUEST_ID]
`);
  let report = createReport({
    trace: hooks.trace,
    addFn: (word) => {
      fnLiteral += word;
    }
  });
  if (fnLiteral += "try{", hasCookie) {
    let get = (name, defaultValue) => {
      let value = cookieMeta?.[name] ?? defaultValue;
      return value ? typeof value == "string" ? `${name}:'${value}',` : value instanceof Date ? `${name}: new Date(${value.getTime()}),` : `${name}:${value},` : typeof defaultValue == "string" ? `${name}:"${defaultValue}",` : `${name}:${defaultValue},`;
    }, options = cookieMeta ? `{secrets:${cookieMeta.secrets !== void 0 ? typeof cookieMeta.secrets == "string" ? `'${cookieMeta.secrets}'` : "[" + cookieMeta.secrets.reduce(
      (a, b) => a + `'${b}',`,
      ""
    ) + "]" : "undefined"},sign:${cookieMeta.sign === !0 ? !0 : cookieMeta.sign !== void 0 ? "[" + cookieMeta.sign.reduce(
      (a, b) => a + `'${b}',`,
      ""
    ) + "]" : "undefined"},` + get("domain") + get("expires") + get("httpOnly") + get("maxAge") + get("path", "/") + get("priority") + get("sameSite") + get("secure") + "}" : "undefined";
    hasHeaders ? fnLiteral += `
c.cookie=await parseCookie(c.set,c.headers.cookie,${options})
` : fnLiteral += `
c.cookie=await parseCookie(c.set,c.request.headers.get('cookie'),${options})
`;
  }
  if (hasQuery) {
    let destructured = [];
    if (validator.query && validator.query.schema.type === "object") {
      let properties = validator.query.schema.properties;
      if (!validator.query.hasAdditionalProperties)
        for (let [key, _value] of Object.entries(properties)) {
          let value = _value, isArray = value.type === "array" || !!value.anyOf?.some(
            (v) => v.type === "string" && v.format === "ArrayString"
          );
          value && import_typebox6.OptionalKind in value && value.type === "array" && value.items && (value = value.items);
          let { type, anyOf } = value;
          destructured.push({
            key,
            isArray,
            isNestedObjectArray: isArray && value.items?.type === "object" || !!value.items?.anyOf?.some(
              (x) => x.type === "object" || x.type === "array"
            ),
            isObject: type === "object" || anyOf?.some(
              (v) => v.type === "string" && v.format === "ArrayString"
            ),
            anyOf: !!anyOf
          });
        }
    }
    if (!destructured.length)
      fnLiteral += "if(c.qi===-1){c.query={}}else{c.query=parseQueryFromURL(c.url,c.qi+1)}";
    else {
      fnLiteral += `if(c.qi!==-1){let url='&'+c.url.slice(c.qi+1)
`;
      let index = 0;
      for (let {
        key,
        isArray,
        isObject: isObject2,
        isNestedObjectArray,
        anyOf
      } of destructured) {
        let init2 = (index === 0 ? "let " : "") + `memory=url.indexOf('&${key}=')
let a${index}
`;
        isArray ? (fnLiteral += init2, isNestedObjectArray ? fnLiteral += `while(memory!==-1){const start=memory+${key.length + 2}
memory=url.indexOf('&',start)
if(a${index}===undefined)
a${index}=''
else
a${index}+=','
let temp
if(memory===-1)temp=decodeURIComponent(url.slice(start).replace(/\\+/g,' '))
else temp=decodeURIComponent(url.slice(start, memory).replace(/\\+/g,' '))
const charCode=temp.charCodeAt(0)
if(charCode!==91&&charCode !== 123)
temp='"'+temp+'"'
a${index}+=temp
if(memory===-1)break
memory=url.indexOf('&${key}=',memory)
if(memory===-1)break}try{if(a${index}.charCodeAt(0)===91)a${index} = JSON.parse(a${index})
else
a${index}=JSON.parse('['+a${index}+']')}catch{}
` : fnLiteral += `while(memory!==-1){const start=memory+${key.length + 2}
memory=url.indexOf('&',start)
if(a${index}===undefined)a${index}=[]
if(memory===-1){const temp=decodeURIComponent(url.slice(start)).replace(/\\+/g,' ')
if(temp.includes(',')){a${index}=a${index}.concat(temp.split(','))}else{a${index}.push(decodeURIComponent(url.slice(start)).replace(/\\+/g,' '))}
break}else{const temp=decodeURIComponent(url.slice(start, memory)).replace(/\\+/g,' ')
if(temp.includes(',')){a${index}=a${index}.concat(temp.split(','))}else{a${index}.push(temp)}
}memory=url.indexOf('&${key}=',memory)
if(memory===-1) break
}`) : isObject2 ? fnLiteral += init2 + `if(memory!==-1){const start=memory+${key.length + 2}
memory=url.indexOf('&',start)
if(memory===-1)a${index}=decodeURIComponent(url.slice(start).replace(/\\+/g,' '))else a${index}=decodeURIComponent(url.slice(start,memory).replace(/\\+/g,' '))if(a${index}!==undefined)try{a${index}=JSON.parse(a${index})}catch{}}` : (fnLiteral += init2 + `if(memory!==-1){const start=memory+${key.length + 2}
memory=url.indexOf('&',start)
if(memory===-1)a${index}=decodeURIComponent(url.slice(start).replace(/\\+/g,' '))
else{a${index}=decodeURIComponent(url.slice(start,memory).replace(/\\+/g,' '))`, anyOf && (fnLiteral += `
let deepMemory=url.indexOf('&${key}=',memory)
if(deepMemory!==-1){a${index}=[a${index}]
let first=true
while(true){const start=deepMemory+${key.length + 2}
if(first)first=false
else deepMemory = url.indexOf('&', start)
let value
if(deepMemory===-1)value=url.slice(start).replace(/\\+/g,' ')
else value=url.slice(start, deepMemory).replace(/\\+/g,' ')
value=decodeURIComponent(value)
if(value===null){if(deepMemory===-1){break}else{continue}}
const vStart=value.charCodeAt(0)
const vEnd=value.charCodeAt(value.length - 1)
if((vStart===91&&vEnd===93)||(vStart===123&&vEnd===125))
try{a${index}.push(JSON.parse(value))}catch{a${index}.push(value)}if(deepMemory===-1)break}}`), fnLiteral += "}}"), index++, fnLiteral += `
`;
      }
      fnLiteral += "c.query={" + destructured.map(({ key }, index2) => `'${key}':a${index2}`).join(",") + "}", fnLiteral += `} else c.query = {}
`;
    }
  }
  let isAsyncHandler = typeof handler == "function" && isAsync(handler), saveResponse = hasTrace || hooks.afterResponse?.length ? "c.response= " : "", maybeAsync = hasCookie || hasBody || isAsyncHandler || !!hooks.parse?.length || !!hooks.afterHandle?.some(isAsync) || !!hooks.beforeHandle?.some(isAsync) || !!hooks.transform?.some(isAsync) || !!hooks.mapResponse?.some(isAsync), maybeStream = (typeof handler == "function" ? isGenerator(handler) : !1) || !!hooks.beforeHandle?.some(isGenerator) || !!hooks.afterHandle?.some(isGenerator) || !!hooks.transform?.some(isGenerator), responseKeys = Object.keys(validator.response ?? {}), hasMultipleResponses = responseKeys.length > 1, hasSingle200 = responseKeys.length === 0 || responseKeys.length === 1 && responseKeys[0] === "200", hasSet = inference.cookie || inference.set || hasHeaders || hasTrace || hasMultipleResponses || !hasSingle200 || isHandleFn && hasDefaultHeaders || maybeStream, mapResponse = (r = "r") => `return ${hasSet ? "mapResponse" : "mapCompactResponse"}(${saveResponse}${r}${hasSet ? ",c.set" : ""}${mapResponseContext})
`, mapResponseContext = maybeStream || adapter.mapResponseContext ? `,${adapter.mapResponseContext}` : "";
  (hasTrace || inference.route) && (fnLiteral += `c.route=\`${path}\`
`);
  let parseReporter = report("parse", {
    total: hooks.parse?.length
  });
  if (hasBody) {
    let hasBodyInference = !!hooks.parse?.length || inference.body || validator.body;
    adapter.parser.declare && (fnLiteral += adapter.parser.declare), fnLiteral += `
try{`;
    let parser = typeof hooks.parse == "string" ? hooks.parse : Array.isArray(hooks.parse) && hooks.parse.length === 1 ? typeof hooks.parse[0] == "string" ? hooks.parse[0] : typeof hooks.parse[0].fn == "string" ? hooks.parse[0].fn : void 0 : void 0;
    if (!parser && validator.body && !hooks.parse?.length) {
      let schema = validator.body.schema;
      schema && schema.anyOf && schema[import_typebox6.Kind] === "Union" && schema.anyOf?.length === 2 && schema.anyOf?.find((x) => x[import_typebox6.Kind] === "ElysiaForm") && (parser = "formdata");
    }
    if (parser && defaultParsers.includes(parser)) {
      let reporter = report("parse", {
        total: hooks.parse?.length
      }), isOptionalBody = !!validator.body?.isOptional;
      switch (parser) {
        case "json":
        case "application/json":
          fnLiteral += adapter.parser.json(isOptionalBody);
          break;
        case "text":
        case "text/plain":
          fnLiteral += adapter.parser.text(isOptionalBody);
          break;
        case "urlencoded":
        case "application/x-www-form-urlencoded":
          fnLiteral += adapter.parser.urlencoded(isOptionalBody);
          break;
        case "arrayBuffer":
        case "application/octet-stream":
          fnLiteral += adapter.parser.arrayBuffer(isOptionalBody);
          break;
        case "formdata":
        case "multipart/form-data":
          fnLiteral += adapter.parser.formData(isOptionalBody);
          break;
        default:
          parser[0] in app["~parser"] && (fnLiteral += hasHeaders ? "let contentType = c.headers['content-type']" : "let contentType = c.request.headers.get('content-type')", fnLiteral += `
if(contentType){const index=contentType.indexOf(';')
if(index!==-1)contentType=contentType.substring(0,index)}
else{contentType=''}c.contentType=contentType
let result=parser['${parser}'](c, contentType)
if(result instanceof Promise)result=await result
if(result instanceof ElysiaCustomStatusResponse)throw result
if(result!==undefined)c.body=result
delete c.contentType
`);
          break;
      }
      reporter.resolve();
    } else if (hasBodyInference) {
      fnLiteral += `
`;
      let declaration = hooks.parse?.length ? "let" : "const";
      fnLiteral += hasHeaders ? `${declaration} contentType=c.headers['content-type']
` : `${declaration} contentType=c.request.headers.get('content-type')
`;
      let hasDefaultParser = !1;
      if (hooks.parse?.length)
        fnLiteral += `if(contentType){
const index=contentType.indexOf(';')

if(index!==-1)contentType=contentType.substring(0,index)}else{contentType=''}let used=false
c.contentType=contentType
`;
      else {
        hasDefaultParser = !0;
        let isOptionalBody = !!validator.body?.isOptional;
        fnLiteral += `if(contentType)switch(contentType.charCodeAt(12)){
case 106:` + adapter.parser.json(isOptionalBody) + `break
case 120:` + adapter.parser.urlencoded(isOptionalBody) + `break
case 111:` + adapter.parser.arrayBuffer(isOptionalBody) + `break
case 114:` + adapter.parser.formData(isOptionalBody) + `break
default:if(contentType.charCodeAt(0)===116){` + adapter.parser.text(isOptionalBody) + `}break
}`;
      }
      let reporter = report("parse", {
        total: hooks.parse?.length
      });
      if (hooks.parse)
        for (let i = 0; i < hooks.parse.length; i++) {
          let name = `bo${i}`;
          if (i !== 0 && (fnLiteral += `
if(!used){`), typeof hooks.parse[i].fn == "string") {
            let endUnit = reporter.resolveChild(
              hooks.parse[i].fn
            ), isOptionalBody = !!validator.body?.isOptional;
            switch (hooks.parse[i].fn) {
              case "json":
              case "application/json":
                hasDefaultParser = !0, fnLiteral += adapter.parser.json(isOptionalBody);
                break;
              case "text":
              case "text/plain":
                hasDefaultParser = !0, fnLiteral += adapter.parser.text(isOptionalBody);
                break;
              case "urlencoded":
              case "application/x-www-form-urlencoded":
                hasDefaultParser = !0, fnLiteral += adapter.parser.urlencoded(isOptionalBody);
                break;
              case "arrayBuffer":
              case "application/octet-stream":
                hasDefaultParser = !0, fnLiteral += adapter.parser.arrayBuffer(isOptionalBody);
                break;
              case "formdata":
              case "multipart/form-data":
                hasDefaultParser = !0, fnLiteral += adapter.parser.formData(isOptionalBody);
                break;
              default:
                fnLiteral += `let ${name}=parser['${hooks.parse[i].fn}'](c,contentType)
if(${name} instanceof Promise)${name}=await ${name}
if(${name}!==undefined){c.body=${name};used=true;}
`;
            }
            endUnit();
          } else {
            let endUnit = reporter.resolveChild(
              hooks.parse[i].fn.name
            );
            fnLiteral += `let ${name}=e.parse[${i}]
${name}=${name}(c,contentType)
if(${name} instanceof Promise)${name}=await ${name}
if(${name}!==undefined){c.body=${name};used=true}`, endUnit();
          }
          if (i !== 0 && (fnLiteral += "}"), hasDefaultParser) break;
        }
      if (reporter.resolve(), !hasDefaultParser) {
        let isOptionalBody = !!validator.body?.isOptional;
        hooks.parse?.length && (fnLiteral += `
if(!used){
if(!contentType) throw new ParseError()
`), fnLiteral += "switch(contentType){", fnLiteral += `case 'application/json':
` + adapter.parser.json(isOptionalBody) + `break
case 'text/plain':` + adapter.parser.text(isOptionalBody) + `break
case 'application/x-www-form-urlencoded':` + adapter.parser.urlencoded(isOptionalBody) + `break
case 'application/octet-stream':` + adapter.parser.arrayBuffer(isOptionalBody) + `break
case 'multipart/form-data':` + adapter.parser.formData(isOptionalBody) + `break
`;
        for (let key of Object.keys(app["~parser"]))
          fnLiteral += `case '${key}':let bo${key}=parser['${key}'](c,contentType)
if(bo${key} instanceof Promise)bo${key}=await bo${key}
if(bo${key} instanceof ElysiaCustomStatusResponse)throw result
if(bo${key}!==undefined)c.body=bo${key}
break
`;
        hooks.parse?.length && (fnLiteral += "}"), fnLiteral += "}";
      }
      hooks.parse?.length && (fnLiteral += `
delete c.contentType`);
    }
    fnLiteral += "}catch(error){throw new ParseError(error)}";
  }
  if (parseReporter.resolve(), hooks?.transform) {
    let reporter = report("transform", {
      total: hooks.transform.length
    });
    hooks.transform.length && (fnLiteral += `let transformed
`);
    for (let i = 0; i < hooks.transform.length; i++) {
      let transform = hooks.transform[i], endUnit = reporter.resolveChild(transform.fn.name);
      fnLiteral += isAsync(transform) ? `transformed=await e.transform[${i}](c)
` : `transformed=e.transform[${i}](c)
`, transform.subType === "mapDerive" ? fnLiteral += `if(transformed instanceof ElysiaCustomStatusResponse)throw transformed
else{transformed.request=c.request
transformed.store=c.store
transformed.qi=c.qi
transformed.path=c.path
transformed.url=c.url
transformed.redirect=c.redirect
transformed.set=c.set
transformed.error=c.error
c=transformed}` : fnLiteral += `if(transformed instanceof ElysiaCustomStatusResponse)throw transformed
else Object.assign(c,transformed)
`, endUnit();
    }
    reporter.resolve();
  }
  let fileUnions = [];
  if (validator) {
    if (validator.headers) {
      if (validator.headers.hasDefault)
        for (let [key, value] of Object.entries(
          import_value4.Value.Default(
            // @ts-ignore
            validator.headers.schema,
            {}
          )
        )) {
          let parsed = typeof value == "object" ? JSON.stringify(value) : typeof value == "string" ? `'${value}'` : value;
          parsed !== void 0 && (fnLiteral += `c.headers['${key}']??=${parsed}
`);
        }
      fnLiteral += composeCleaner({
        name: "c.headers",
        schema: validator.headers,
        type: "headers",
        normalize
      }), validator.headers.isOptional && (fnLiteral += "if(isNotEmpty(c.headers)){"), validator.body?.schema?.noValidate !== !0 && (fnLiteral += "if(validator.headers.Check(c.headers) === false){" + validation.validate("headers") + "}"), validator.headers.hasTransform && (fnLiteral += `c.headers=validator.headers.Decode(c.headers)
`), validator.headers.isOptional && (fnLiteral += "}");
    }
    if (validator.params) {
      if (validator.params.hasDefault)
        for (let [key, value] of Object.entries(
          import_value4.Value.Default(
            // @ts-ignore
            validator.params.schema,
            {}
          )
        )) {
          let parsed = typeof value == "object" ? JSON.stringify(value) : typeof value == "string" ? `'${value}'` : value;
          parsed !== void 0 && (fnLiteral += `c.params['${key}']??=${parsed}
`);
        }
      validator.params?.schema?.noValidate !== !0 && (fnLiteral += "if(validator.params.Check(c.params)===false){" + validation.validate("params") + "}"), validator.params.hasTransform && (fnLiteral += `c.params=validator.params.Decode(c.params)
`);
    }
    if (validator.query) {
      if (validator.query.hasDefault)
        for (let [key, value] of Object.entries(
          import_value4.Value.Default(
            // @ts-ignore
            validator.query.schema,
            {}
          )
        )) {
          let parsed = typeof value == "object" ? JSON.stringify(value) : typeof value == "string" ? `'${value}'` : value;
          parsed !== void 0 && (fnLiteral += `if(c.query['${key}']===undefined)c.query['${key}']=${parsed}
`), fnLiteral += composeCleaner({
            name: "c.query",
            schema: validator.query,
            type: "query",
            normalize
          });
        }
      validator.query.isOptional && (fnLiteral += "if(isNotEmpty(c.query)){"), validator.query?.schema?.noValidate !== !0 && (fnLiteral += "if(validator.query.Check(c.query)===false){" + validation.validate("query") + "}"), validator.query.hasTransform && (fnLiteral += `c.query=validator.query.Decode(Object.assign({},c.query))
`), validator.query.isOptional && (fnLiteral += "}");
    }
    if (hasBody && validator.body) {
      (validator.body.hasTransform || validator.body.isOptional) && (fnLiteral += `const isNotEmptyObject=c.body&&(typeof c.body==="object"&&isNotEmpty(c.body))
`);
      let hasUnion = isUnion(validator.body.schema), hasNonUnionFileWithDefault = !1;
      if (validator.body.hasDefault) {
        let value = import_value4.Value.Default(
          validator.body.schema,
          validator.body.schema.type === "object" || validator.body.schema[import_typebox6.Kind] === "Import" && validator.body.schema.$defs[validator.body.schema.$ref][import_typebox6.Kind] === "Object" ? {} : void 0
        );
        if (!hasUnion && value && typeof value == "object" && (hasType("File", validator.body.schema) || hasType("Files", validator.body.schema))) {
          hasNonUnionFileWithDefault = !0;
          for (let [k, v] of Object.entries(value))
            (v === "File" || v === "Files") && delete value[k];
          isNotEmpty(value) || (value = void 0);
        }
        let parsed = typeof value == "object" ? JSON.stringify(value) : typeof value == "string" ? `'${value}'` : value;
        value != null && (Array.isArray(value) ? fnLiteral += `if(!c.body)c.body=${parsed}
` : typeof value == "object" ? fnLiteral += `c.body=Object.assign(${parsed},c.body)
` : fnLiteral += `c.body=${parsed}
`), fnLiteral += composeCleaner({
          name: "c.body",
          schema: validator.body,
          type: "body",
          normalize
        }), validator.body?.schema?.noValidate !== !0 && (validator.body.isOptional ? fnLiteral += "if(isNotEmptyObject&&validator.body.Check(c.body)===false){" + validation.validate("body") + "}" : fnLiteral += "if(validator.body.Check(c.body)===false){" + validation.validate("body") + "}");
      } else
        fnLiteral += composeCleaner({
          name: "c.body",
          schema: validator.body,
          type: "body",
          normalize
        }), validator.body?.schema?.noValidate !== !0 && (validator.body.isOptional ? fnLiteral += "if(isNotEmptyObject&&validator.body.Check(c.body)===false){" + validation.validate("body") + "}" : fnLiteral += "if(validator.body.Check(c.body)===false){" + validation.validate("body") + "}");
      if (validator.body.hasTransform && (fnLiteral += `if(isNotEmptyObject)c.body=validator.body.Decode(c.body)
`), hasUnion && validator.body.schema.anyOf?.length) {
        let iterator = Object.values(
          validator.body.schema.anyOf
        );
        for (let i = 0; i < iterator.length; i++) {
          let type = iterator[i];
          if (hasType("File", type) || hasType("Files", type)) {
            let candidate = getSchemaValidator(type, {
              // @ts-expect-error private property
              modules: app.definitions.typebox,
              dynamic: !app.config.aot,
              // @ts-expect-error private property
              models: app.definitions.type,
              normalize: app.config.normalize,
              additionalCoerce: coercePrimitiveRoot(),
              sanitize: () => app.config.sanitize
            });
            if (candidate) {
              let isFirst = fileUnions.length === 0, iterator2 = Object.entries(
                type.properties
              ), validator2 = isFirst ? `
` : " else ";
              validator2 += `if(fileUnions[${fileUnions.length}].Check(c.body)){`;
              let validateFile2 = "", validatorLength = 0;
              for (let i2 = 0; i2 < iterator2.length; i2++) {
                let [k, v] = iterator2[i2];
                !v.extension || v[import_typebox6.Kind] !== "File" && v[import_typebox6.Kind] !== "Files" || (validatorLength && (validateFile2 += ","), validateFile2 += `validateFileExtension(c.body.${k},${JSON.stringify(v.extension)},'body.${k}')`, validatorLength++);
              }
              validateFile2 && (validatorLength === 1 ? validator2 += `await ${validateFile2}
` : validatorLength > 1 && (validator2 += `await Promise.all([${validateFile2}])
`), validator2 += "}", fnLiteral += validator2, fileUnions.push(candidate));
            }
          }
        }
      } else if (hasNonUnionFileWithDefault || !hasUnion && (hasType("File", validator.body.schema) || hasType("Files", validator.body.schema))) {
        let validateFile2 = "", i = 0;
        for (let [k, v] of Object.entries(
          validator.body.schema.properties
        ))
          !v.extension || v[import_typebox6.Kind] !== "File" && v[import_typebox6.Kind] !== "Files" || (i && (validateFile2 += ","), validateFile2 += `validateFileExtension(c.body.${k},${JSON.stringify(v.extension)},'body.${k}')`, i++);
        i && (fnLiteral += `
`), i === 1 ? fnLiteral += `await ${validateFile2}
` : i > 1 && (fnLiteral += `await Promise.all([${validateFile2}])
`);
      }
    }
    if (validator.cookie) {
      let cookieValidator = getCookieValidator({
        // @ts-expect-error private property
        modules: app.definitions.typebox,
        validator: validator.cookie,
        defaultConfig: app.config.cookie,
        dynamic: !!app.config.aot,
        config: validator.cookie?.config ?? {},
        // @ts-expect-error
        models: app.definitions.type
      });
      if (fnLiteral += `const cookieValue={}
for(const [key,value] of Object.entries(c.cookie))cookieValue[key]=value.value
`, cookieValidator.hasDefault)
        for (let [key, value] of Object.entries(
          import_value4.Value.Default(cookieValidator.schema, {})
        ))
          fnLiteral += `cookieValue['${key}'] = ${typeof value == "object" ? JSON.stringify(value) : value}
`;
      cookieValidator.isOptional && (fnLiteral += "if(isNotEmpty(c.cookie)){"), validator.body?.schema?.noValidate !== !0 && (fnLiteral += "if(validator.cookie.Check(cookieValue)===false){" + validation.validate("cookie", "cookieValue") + "}"), cookieValidator.hasTransform && (fnLiteral += `for(const [key,value] of Object.entries(validator.cookie.Decode(cookieValue)))c.cookie[key].value=value
`), cookieValidator.isOptional && (fnLiteral += "}");
    }
  }
  if (hooks?.beforeHandle) {
    let reporter = report("beforeHandle", {
      total: hooks.beforeHandle.length
    }), hasResolve = !1;
    for (let i = 0; i < hooks.beforeHandle.length; i++) {
      let beforeHandle = hooks.beforeHandle[i], endUnit = reporter.resolveChild(beforeHandle.fn.name), returning = hasReturn(beforeHandle);
      if (beforeHandle.subType === "resolve" || beforeHandle.subType === "mapResolve")
        hasResolve || (hasResolve = !0, fnLiteral += `
let resolved
`), fnLiteral += isAsync(beforeHandle) ? `resolved=await e.beforeHandle[${i}](c);
` : `resolved=e.beforeHandle[${i}](c);
`, beforeHandle.subType === "mapResolve" ? fnLiteral += `if(resolved instanceof ElysiaCustomStatusResponse)throw resolved
else{resolved.request=c.request
resolved.store=c.store
resolved.qi=c.qi
resolved.path=c.path
resolved.url=c.url
resolved.redirect=c.redirect
resolved.set=c.set
resolved.error=c.error
c=resolved}` : fnLiteral += `if(resolved instanceof ElysiaCustomStatusResponse)throw resolved
else Object.assign(c, resolved)
`;
      else if (!returning)
        fnLiteral += isAsync(beforeHandle) ? `await e.beforeHandle[${i}](c)
` : `e.beforeHandle[${i}](c)
`, endUnit();
      else {
        if (fnLiteral += isAsync(beforeHandle) ? `be=await e.beforeHandle[${i}](c)
` : `be=e.beforeHandle[${i}](c)
`, endUnit("be"), fnLiteral += "if(be!==undefined){", reporter.resolve(), hooks.afterHandle?.length) {
          report("handle", {
            name: isHandleFn ? handler.name : void 0
          }).resolve();
          let reporter2 = report("afterHandle", {
            total: hooks.afterHandle.length
          });
          for (let i2 = 0; i2 < hooks.afterHandle.length; i2++) {
            let hook = hooks.afterHandle[i2], returning2 = hasReturn(hook), endUnit2 = reporter2.resolveChild(hook.fn.name);
            fnLiteral += `c.response = be
`, returning2 ? (fnLiteral += isAsync(hook.fn) ? `af=await e.afterHandle[${i2}](c)
` : `af=e.afterHandle[${i2}](c)
`, fnLiteral += `if(af!==undefined) c.response=be=af
`) : fnLiteral += isAsync(hook.fn) ? `await e.afterHandle[${i2}](c, be)
` : `e.afterHandle[${i2}](c, be)
`, endUnit2("af");
          }
          reporter2.resolve();
        }
        validator.response && (fnLiteral += validation.response("be"));
        let mapResponseReporter = report("mapResponse", {
          total: hooks.mapResponse?.length
        });
        if (hooks.mapResponse?.length) {
          fnLiteral += `c.response=be
`;
          for (let i2 = 0; i2 < hooks.mapResponse.length; i2++) {
            let mapResponse2 = hooks.mapResponse[i2], endUnit2 = mapResponseReporter.resolveChild(
              mapResponse2.fn.name
            );
            fnLiteral += `if(mr===undefined){mr=${isAsyncName(mapResponse2) ? "await " : ""}e.mapResponse[${i2}](c)
if(mr!==undefined)be=c.response=mr}`, endUnit2();
          }
        }
        mapResponseReporter.resolve(), fnLiteral += encodeCookie(), fnLiteral += `return mapEarlyResponse(${saveResponse}be,c.set${mapResponseContext})}
`;
      }
    }
    reporter.resolve();
  }
  if (hooks.afterHandle?.length) {
    let handleReporter = report("handle", {
      name: isHandleFn ? handler.name : void 0
    });
    hooks.afterHandle.length ? fnLiteral += isAsyncHandler ? `let r=c.response=await ${handle}
` : `let r=c.response=${handle}
` : fnLiteral += isAsyncHandler ? `let r=await ${handle}
` : `let r=${handle}
`, handleReporter.resolve();
    let reporter = report("afterHandle", {
      total: hooks.afterHandle.length
    });
    for (let i = 0; i < hooks.afterHandle.length; i++) {
      let hook = hooks.afterHandle[i], returning = hasReturn(hook), endUnit = reporter.resolveChild(hook.fn.name);
      returning ? (fnLiteral += isAsync(hook.fn) ? `af=await e.afterHandle[${i}](c)
` : `af=e.afterHandle[${i}](c)
`, endUnit("af"), validator.response ? (fnLiteral += "if(af!==undefined){", reporter.resolve(), fnLiteral += validation.response("af"), fnLiteral += "c.response=af}") : (fnLiteral += "if(af!==undefined){", reporter.resolve(), fnLiteral += "c.response=af}")) : (fnLiteral += isAsync(hook.fn) ? `await e.afterHandle[${i}](c)
` : `e.afterHandle[${i}](c)
`, endUnit());
    }
    reporter.resolve(), fnLiteral += `r=c.response
`, validator.response && (fnLiteral += validation.response()), fnLiteral += encodeCookie();
    let mapResponseReporter = report("mapResponse", {
      total: hooks.mapResponse?.length
    });
    if (hooks.mapResponse?.length)
      for (let i = 0; i < hooks.mapResponse.length; i++) {
        let mapResponse2 = hooks.mapResponse[i], endUnit = mapResponseReporter.resolveChild(
          mapResponse2.fn.name
        );
        fnLiteral += `mr=${isAsyncName(mapResponse2) ? "await " : ""}e.mapResponse[${i}](c)
if(mr!==undefined)r=c.response=mr
`, endUnit();
      }
    mapResponseReporter.resolve(), fnLiteral += mapResponse();
  } else {
    let handleReporter = report("handle", {
      name: isHandleFn ? handler.name : void 0
    });
    if (validator.response || hooks.mapResponse?.length) {
      fnLiteral += isAsyncHandler ? `let r=await ${handle}
` : `let r=${handle}
`, handleReporter.resolve(), validator.response && (fnLiteral += validation.response()), report("afterHandle").resolve();
      let mapResponseReporter = report("mapResponse", {
        total: hooks.mapResponse?.length
      });
      if (hooks.mapResponse?.length) {
        fnLiteral += `
c.response=r
`;
        for (let i = 0; i < hooks.mapResponse.length; i++) {
          let mapResponse2 = hooks.mapResponse[i], endUnit = mapResponseReporter.resolveChild(
            mapResponse2.fn.name
          );
          fnLiteral += `
if(mr===undefined){mr=${isAsyncName(mapResponse2) ? "await " : ""}e.mapResponse[${i}](c)
if(mr!==undefined)r=c.response=mr}
`, endUnit();
        }
      }
      mapResponseReporter.resolve(), fnLiteral += encodeCookie(), handler instanceof Response ? (fnLiteral += inference.set ? `if(isNotEmpty(c.set.headers)||c.set.status!==200||c.set.redirect||c.set.cookie)return mapResponse(${saveResponse}${handle}.clone(),c.set${mapResponseContext})else return ${handle}.clone()` : `return ${handle}.clone()`, fnLiteral += `
`) : fnLiteral += mapResponse();
    } else if (hasCookie || hasTrace) {
      fnLiteral += isAsyncHandler ? `let r=await ${handle}
` : `let r=${handle}
`, handleReporter.resolve(), report("afterHandle").resolve();
      let mapResponseReporter = report("mapResponse", {
        total: hooks.mapResponse?.length
      });
      if (hooks.mapResponse?.length) {
        fnLiteral += `c.response= r
`;
        for (let i = 0; i < hooks.mapResponse.length; i++) {
          let mapResponse2 = hooks.mapResponse[i], endUnit = mapResponseReporter.resolveChild(
            mapResponse2.fn.name
          );
          fnLiteral += `if(mr===undefined){mr=${isAsyncName(mapResponse2) ? "await " : ""}e.mapResponse[${i}](c)
if(mr!==undefined)r=c.response=mr}`, endUnit();
        }
      }
      mapResponseReporter.resolve(), fnLiteral += encodeCookie() + mapResponse();
    } else {
      handleReporter.resolve();
      let handled = isAsyncHandler ? `await ${handle}` : handle;
      report("afterHandle").resolve(), handler instanceof Response ? fnLiteral += inference.set ? `if(isNotEmpty(c.set.headers)||c.set.status!==200||c.set.redirect||c.set.cookie)return mapResponse(${saveResponse}${handle}.clone(),c.set${mapResponseContext})
else return ${handle}.clone()
` : `return ${handle}.clone()
` : fnLiteral += mapResponse(handled);
    }
  }
  if (fnLiteral += `
}catch(error){`, !maybeAsync && hooks.error?.length && (fnLiteral += "return(async()=>{"), fnLiteral += `const set=c.set
if(!set.status||set.status<300)set.status=error?.status||500
`, hasCookie && (fnLiteral += encodeCookie()), hasTrace && hooks.trace)
    for (let i = 0; i < hooks.trace.length; i++)
      fnLiteral += `report${i}?.resolve(error);reportChild${i}?.(error)
`;
  let errorReporter = report("error", {
    total: hooks.error?.length
  });
  if (hooks.error?.length) {
    fnLiteral += `c.error=error
`, hasValidation ? fnLiteral += `if(error instanceof TypeBoxError){c.code="VALIDATION"
c.set.status=422}else{c.code=error.code??error[ERROR_CODE]??"UNKNOWN"}` : fnLiteral += `c.code=error.code??error[ERROR_CODE]??"UNKNOWN"
`, fnLiteral += `let er
`;
    for (let i = 0; i < hooks.error.length; i++) {
      let endUnit = errorReporter.resolveChild(hooks.error[i].fn.name);
      isAsync(hooks.error[i]) ? fnLiteral += `er=await e.error[${i}](c)
` : fnLiteral += `er=e.error[${i}](c)
if(er instanceof Promise)er=await er
`, endUnit();
      let mapResponseReporter = report("mapResponse", {
        total: hooks.mapResponse?.length
      });
      if (hooks.mapResponse?.length)
        for (let i2 = 0; i2 < hooks.mapResponse.length; i2++) {
          let mapResponse2 = hooks.mapResponse[i2], endUnit2 = mapResponseReporter.resolveChild(
            mapResponse2.fn.name
          );
          fnLiteral += `c.response=er
er=e.mapResponse[${i2}](c)
if(er instanceof Promise)er=await er
`, endUnit2();
        }
      if (mapResponseReporter.resolve(), fnLiteral += `er=mapEarlyResponse(er,set${mapResponseContext})
`, fnLiteral += "if(er){", hasTrace && hooks.trace) {
        for (let i2 = 0; i2 < hooks.trace.length; i2++)
          fnLiteral += `report${i2}.resolve()
`;
        errorReporter.resolve();
      }
      fnLiteral += "return er}";
    }
  }
  if (errorReporter.resolve(), fnLiteral += "return handleError(c,error,true)", !maybeAsync && hooks.error?.length && (fnLiteral += "})()"), fnLiteral += "}", hasAfterResponse || hasTrace) {
    fnLiteral += "finally{ ", maybeAsync || (fnLiteral += ";(async()=>{");
    let reporter = report("afterResponse", {
      total: hooks.afterResponse?.length
    });
    if (hasAfterResponse && hooks.afterResponse)
      for (let i = 0; i < hooks.afterResponse.length; i++) {
        let endUnit = reporter.resolveChild(
          hooks.afterResponse[i].fn.name
        );
        fnLiteral += `
await e.afterResponse[${i}](c)
`, endUnit();
      }
    reporter.resolve(), maybeAsync || (fnLiteral += "})()"), fnLiteral += "}";
  }
  let adapterVariables = adapter.inject ? Object.keys(adapter.inject).join(",") + "," : "", init = "const {handler,handleError,hooks:e, " + allocateIf("validator,", hasValidation) + "mapResponse,mapCompactResponse,mapEarlyResponse,isNotEmpty,utils:{" + allocateIf("parseQuery,", hasBody) + allocateIf("parseQueryFromURL,", hasQuery) + "},error:{" + allocateIf("ValidationError,", hasValidation) + allocateIf("ParseError", hasBody) + "},validateFileExtension,schema,definitions,ERROR_CODE," + allocateIf("parseCookie,", hasCookie) + allocateIf("signCookie,", hasCookie) + allocateIf("decodeURIComponent,", hasQuery) + "ElysiaCustomStatusResponse," + allocateIf("ELYSIA_TRACE,", hasTrace) + allocateIf("ELYSIA_REQUEST_ID,", hasTrace) + allocateIf("parser,", hooks.parse?.length) + allocateIf("getServer,", inference.server) + allocateIf("fileUnions,", fileUnions.length) + adapterVariables + allocateIf("TypeBoxError", hasValidation) + `}=hooks
const trace=e.trace
return ${maybeAsync ? "async " : ""}function handle(c){`;
  hooks.beforeHandle?.length && (init += `let be
`), hooks.afterHandle?.length && (init += `let af
`), hooks.mapResponse?.length && (init += `let mr
`), allowMeta && (init += `c.schema=schema
c.defs=definitions
`), fnLiteral = init + fnLiteral + "}", init = "";
  try {
    return Function(
      "hooks",
      `"use strict";
` + fnLiteral
    )({
      handler,
      hooks: lifeCycleToFn({ ...hooks }),
      validator: hasValidation ? validator : void 0,
      // @ts-expect-error
      handleError: app.handleError,
      mapResponse: adapterHandler.mapResponse,
      mapCompactResponse: adapterHandler.mapCompactResponse,
      mapEarlyResponse: adapterHandler.mapEarlyResponse,
      isNotEmpty,
      utils: {
        parseQuery: hasBody ? parseQuery : void 0,
        parseQueryFromURL: hasQuery ? parseQueryFromURL : void 0
      },
      error: {
        ValidationError: hasValidation ? ValidationError : void 0,
        ParseError: hasBody ? ParseError : void 0
      },
      validateFileExtension,
      schema: app.router.history,
      // @ts-expect-error
      definitions: app.definitions.type,
      ERROR_CODE,
      parseCookie: hasCookie ? parseCookie : void 0,
      signCookie: hasCookie ? signCookie : void 0,
      decodeURIComponent: hasQuery ? import_fast_decode_uri_component3.default : void 0,
      ElysiaCustomStatusResponse,
      ELYSIA_TRACE: hasTrace ? ELYSIA_TRACE : void 0,
      ELYSIA_REQUEST_ID: hasTrace ? ELYSIA_REQUEST_ID : void 0,
      // @ts-expect-error private property
      getServer: () => app.getServer(),
      fileUnions: fileUnions.length ? fileUnions : void 0,
      TypeBoxError: hasValidation ? import_typebox6.TypeBoxError : void 0,
      parser: app["~parser"],
      ...adapter.inject
    });
  } catch (error) {
    let debugHooks = lifeCycleToFn(hooks);
    console.log("[Composer] failed to generate optimized handler"), console.log("---"), console.log({
      handler: typeof handler == "function" ? handler.toString() : handler,
      instruction: fnLiteral,
      hooks: {
        ...debugHooks,
        // @ts-ignore
        transform: debugHooks?.transform?.map?.((x) => x.toString()),
        // @ts-ignore
        resolve: debugHooks?.resolve?.map?.((x) => x.toString()),
        // @ts-ignore
        beforeHandle: debugHooks?.beforeHandle?.map?.(
          (x) => x.toString()
        ),
        // @ts-ignore
        afterHandle: debugHooks?.afterHandle?.map?.(
          (x) => x.toString()
        ),
        // @ts-ignore
        mapResponse: debugHooks?.mapResponse?.map?.(
          (x) => x.toString()
        ),
        // @ts-ignore
        parse: debugHooks?.parse?.map?.((x) => x.toString()),
        // @ts-ignore
        error: debugHooks?.error?.map?.((x) => x.toString()),
        // @ts-ignore
        afterResponse: debugHooks?.afterResponse?.map?.(
          (x) => x.toString()
        ),
        // @ts-ignore
        stop: debugHooks?.stop?.map?.((x) => x.toString())
      },
      validator,
      // @ts-expect-error
      definitions: app.definitions.type,
      error
    }), console.log("---"), process.exit(1);
  }
}, createOnRequestHandler = (app, addFn) => {
  let fnLiteral = "", reporter = createReport({
    trace: app.event.trace,
    addFn: addFn ?? ((word) => {
      fnLiteral += word;
    })
  })("request", {
    total: app.event.request?.length
  });
  if (app.event.request?.length) {
    fnLiteral += "try{";
    for (let i = 0; i < app.event.request.length; i++) {
      let hook = app.event.request[i], withReturn = hasReturn(hook), maybeAsync = isAsync(hook), endUnit = reporter.resolveChild(app.event.request[i].fn.name);
      withReturn ? (fnLiteral += `re=mapEarlyResponse(${maybeAsync ? "await " : ""}onRequest[${i}](c),c.set)
`, endUnit("re"), fnLiteral += `if(re!==undefined)return re
`) : (fnLiteral += `${maybeAsync ? "await " : ""}onRequest[${i}](c)
`, endUnit());
    }
    fnLiteral += "}catch(error){return app.handleError(c,error,false)}";
  }
  return reporter.resolve(), fnLiteral;
}, createHoc = (app, fnName = "map") => {
  let hoc = app.extender.higherOrderFunctions;
  if (!hoc.length) return "return " + fnName;
  let adapter = app["~adapter"].composeGeneralHandler, handler = fnName;
  for (let i = 0; i < hoc.length; i++)
    handler = `hoc[${i}](${handler},${adapter.parameters})`;
  return `return function hocMap(${adapter.parameters}){return ${handler}(${adapter.parameters})}`;
}, composeGeneralHandler = (app) => {
  let adapter = app["~adapter"].composeGeneralHandler;
  app.router.http.build();
  let error404 = adapter.error404(
    !!app.event.request?.length,
    !!app.event.error?.length
  ), hasTrace = app.event.trace?.length, fnLiteral = "", router = app.router, findDynamicRoute = router.http.root.WS ? `const route=router.find(r.method === "GET" && r.headers.get('upgrade')==='websocket'?'WS':r.method,p)` : "const route=router.find(r.method,p)";
  findDynamicRoute += router.http.root.ALL ? `??router.find("ALL",p)
` : `
`, findDynamicRoute += error404.code, findDynamicRoute += `
c.params=route.params
if(route.store.handler)return route.store.handler(c)
return route.store.compile()(c)
`;
  let switchMap = "";
  for (let [path, methods] of Object.entries(router.static)) {
    switchMap += `case'${path}':`, app.config.strictPath !== !0 && (switchMap += `case'${getLoosePath(path)}':`);
    let encoded = encodePath(path);
    path !== encoded && (switchMap += `case'${encoded}':`), switchMap += "switch(r.method){", ("GET" in methods || "WS" in methods) && (switchMap += "case 'GET':", "WS" in methods && (switchMap += `if(r.headers.get('upgrade')==='websocket')return ht[${methods.WS}].composed(c)
`), "GET" in methods && (switchMap += `return ht[${methods.GET}].composed(c)
`));
    for (let [method, index] of Object.entries(methods))
      method === "ALL" || method === "GET" || method === "WS" || (switchMap += `case '${method}':return ht[${index}].composed(c)
`);
    "ALL" in methods ? switchMap += `default:return ht[${methods.ALL}].composed(c)
` : switchMap += `default:break map
`, switchMap += "}";
  }
  let maybeAsync = !!app.event.request?.some(isAsync), adapterVariables = adapter.inject ? Object.keys(adapter.inject).join(",") + "," : "";
  fnLiteral += `
const {app,mapEarlyResponse,NotFoundError,randomId,handleError,status,redirect,` + allocateIf("ELYSIA_TRACE,", hasTrace) + allocateIf("ELYSIA_REQUEST_ID,", hasTrace) + adapterVariables + `}=data
const store=app.singleton.store
const decorator=app.singleton.decorator
const staticRouter=app.router.static.http
const ht=app.router.history
const router=app.router.http
const trace=app.event.trace?.map(x=>typeof x==='function'?x:x.fn)??[]
const notFound=new NotFoundError()
const hoc=app.extender.higherOrderFunctions.map(x=>x.fn)
`, app.event.request?.length && (fnLiteral += `const onRequest=app.event.request.map(x=>x.fn)
`), fnLiteral += error404.declare, app.event.trace?.length && (fnLiteral += "const " + app.event.trace.map((_, i) => `tr${i}=app.event.trace[${i}].fn`).join(",") + `
`), fnLiteral += `${maybeAsync ? "async " : ""}function map(${adapter.parameters}){`, app.event.request?.length && (fnLiteral += `let re
`), fnLiteral += adapter.createContext(app), app.event.trace?.length && (fnLiteral += "c[ELYSIA_TRACE]=[" + app.event.trace.map((_, i) => `tr${i}(c)`).join(",") + `]
`), fnLiteral += createOnRequestHandler(app), switchMap && (fnLiteral += `
map: switch(p){
` + switchMap + "}"), fnLiteral += findDynamicRoute + `}
` + createHoc(app), app.handleError = composeErrorHandler(app);
  let fn = Function(
    "data",
    `"use strict";
` + fnLiteral
  )({
    app,
    mapEarlyResponse: app["~adapter"].handler.mapEarlyResponse,
    NotFoundError,
    randomId,
    // @ts-expect-error private property
    handleError: app.handleError,
    status,
    redirect,
    ELYSIA_TRACE: hasTrace ? ELYSIA_TRACE : void 0,
    ELYSIA_REQUEST_ID: hasTrace ? ELYSIA_REQUEST_ID : void 0,
    ...adapter.inject
  });
  return isBun && Bun.gc(!1), fn;
}, composeErrorHandler = (app) => {
  let hooks = app.event, fnLiteral = "", adapter = app["~adapter"].composeError, adapterVariables = adapter.inject ? Object.keys(adapter.inject).join(",") + "," : "", hasTrace = !!app.event.trace?.length;
  fnLiteral += "const {mapResponse,ERROR_CODE,ElysiaCustomStatusResponse," + allocateIf("onError,", app.event.error) + allocateIf("afterResponse,", app.event.afterResponse) + allocateIf("trace,", app.event.trace) + allocateIf("onMapResponse,", app.event.mapResponse) + allocateIf("ELYSIA_TRACE,", hasTrace) + allocateIf("ELYSIA_REQUEST_ID,", hasTrace) + adapterVariables + `}=inject
`, fnLiteral += `return ${app.event.error?.find(isAsync) || app.event.mapResponse?.find(isAsync) ? "async " : ""}function(context,error,skipGlobal){`, fnLiteral += "", hasTrace && (fnLiteral += `const id=context[ELYSIA_REQUEST_ID]
`);
  let report = createReport({
    context: "context",
    trace: hooks.trace,
    addFn: (word) => {
      fnLiteral += word;
    }
  });
  fnLiteral += `const set=context.set
let _r
if(!context.code)context.code=error.code??error[ERROR_CODE]
if(!(context.error instanceof Error))context.error=error
if(error instanceof ElysiaCustomStatusResponse){set.status=error.status=error.code
error.message=error.response}`, adapter.declare && (fnLiteral += adapter.declare);
  let saveResponse = hasTrace || hooks.afterResponse?.length || hooks.afterResponse?.length ? "context.response = " : "";
  if (app.event.error)
    for (let i = 0; i < app.event.error.length; i++) {
      let handler = app.event.error[i], response = `${isAsync(handler) ? "await " : ""}onError[${i}](context)
`;
      if (fnLiteral += "if(skipGlobal!==true){", hasReturn(handler)) {
        fnLiteral += `_r=${response}
if(_r!==undefined){if(_r instanceof Response)return mapResponse(_r,set${adapter.mapResponseContext})
if(_r instanceof ElysiaCustomStatusResponse){error.status=error.code
error.message = error.response}if(set.status===200||!set.status)set.status=error.status
`;
        let mapResponseReporter2 = report("mapResponse", {
          total: hooks.mapResponse?.length,
          name: "context"
        });
        if (hooks.mapResponse?.length)
          for (let i2 = 0; i2 < hooks.mapResponse.length; i2++) {
            let mapResponse = hooks.mapResponse[i2], endUnit = mapResponseReporter2.resolveChild(
              mapResponse.fn.name
            );
            fnLiteral += `context.response=_r_r=${isAsyncName(mapResponse) ? "await " : ""}onMapResponse[${i2}](context)
`, endUnit();
          }
        mapResponseReporter2.resolve(), fnLiteral += `return mapResponse(${saveResponse}_r,set${adapter.mapResponseContext})}`;
      } else fnLiteral += response;
      fnLiteral += "}";
    }
  fnLiteral += `if(error.constructor.name==="ValidationError"||error.constructor.name==="TransformDecodeError"){
if(error.error)error=error.error
set.status=error.status??422
` + adapter.validationError + `
}
`, fnLiteral += `if(error instanceof Error){
if(typeof error.toResponse==='function')return context.response=error.toResponse()
` + adapter.unknownError + `
}`;
  let mapResponseReporter = report("mapResponse", {
    total: hooks.mapResponse?.length,
    name: "context"
  });
  if (fnLiteral += `
if(!context.response)context.response=error.message??error
`, hooks.mapResponse?.length) {
    fnLiteral += `let mr
`;
    for (let i = 0; i < hooks.mapResponse.length; i++) {
      let mapResponse = hooks.mapResponse[i], endUnit = mapResponseReporter.resolveChild(
        mapResponse.fn.name
      );
      fnLiteral += `if(mr===undefined){mr=${isAsyncName(mapResponse) ? "await " : ""}onMapResponse[${i}](context)
if(mr!==undefined)error=context.response=mr}`, endUnit();
    }
  }
  mapResponseReporter.resolve(), fnLiteral += `
return mapResponse(${saveResponse}error,set${adapter.mapResponseContext})}`;
  let mapFn = (x) => typeof x == "function" ? x : x.fn;
  return Function(
    "inject",
    `"use strict";
` + fnLiteral
  )({
    mapResponse: app["~adapter"].handler.mapResponse,
    ERROR_CODE,
    ElysiaCustomStatusResponse,
    onError: app.event.error?.map(mapFn),
    afterResponse: app.event.afterResponse?.map(mapFn),
    trace: app.event.trace?.map(mapFn),
    onMapResponse: app.event.mapResponse?.map(mapFn),
    ELYSIA_TRACE: hasTrace ? ELYSIA_TRACE : void 0,
    ELYSIA_REQUEST_ID: hasTrace ? ELYSIA_REQUEST_ID : void 0,
    ...adapter.inject
  });
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  composeErrorHandler,
  composeGeneralHandler,
  composeHandler,
  createHoc,
  createOnRequestHandler,
  isAsync
});
/**
 * @license
 *
 * MIT License
 *
 * Copyright (c) 2020 Evgeny Poberezkin
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
