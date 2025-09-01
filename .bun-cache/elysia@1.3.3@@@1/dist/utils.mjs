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
var hasHeaderShorthand = "toJSON" in new Headers(), replaceUrlPath = (url, pathname) => {
  let urlObject = new URL(url);
  return urlObject.pathname = pathname, urlObject.toString();
}, isClass = (v) => typeof v == "function" && /^\s*class\s+/.test(v.toString()) || // Handle Object.create(null)
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
}, mergeObjectArray = (a, b) => {
  if (!b) return a;
  let array = [], checksums = [];
  if (a) {
    Array.isArray(a) || (a = [a]);
    for (let item of a)
      array.push(item), item.checksum && checksums.push(item.checksum);
  }
  if (b) {
    Array.isArray(b) || (b = [b]);
    for (let item of b)
      checksums.includes(item.checksum) || array.push(item);
  }
  return array;
}, primitiveHooks = [
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
), mergeResponse = (a, b) => {
  let isRecordNumber = (x) => typeof x == "object" && Object.keys(x).every(isNumericString);
  return isRecordNumber(a) && isRecordNumber(b) ? Object.assign(a, b) : a && !isRecordNumber(a) && isRecordNumber(b) ? Object.assign({ 200: a }, b) : b ?? a;
}, mergeSchemaValidator = (a, b) => ({
  body: b?.body ?? a?.body,
  headers: b?.headers ?? a?.headers,
  params: b?.params ?? a?.params,
  query: b?.query ?? a?.query,
  cookie: b?.cookie ?? a?.cookie,
  // @ts-ignore ? This order is correct - SaltyAom
  response: mergeResponse(
    // @ts-ignore
    a?.response,
    // @ts-ignore
    b?.response
  )
}), mergeHook = (a, b) => {
  if (!Object.values(b).find((x) => x != null))
    return { ...a };
  let hook = {
    ...a,
    ...b,
    // Merge local hook first
    // @ts-ignore
    body: b?.body ?? a?.body,
    // @ts-ignore
    headers: b?.headers ?? a?.headers,
    // @ts-ignore
    params: b?.params ?? a?.params,
    // @ts-ignore
    query: b?.query ?? a?.query,
    // @ts-ignore
    cookie: b?.cookie ?? a?.cookie,
    // ? This order is correct - SaltyAom
    response: mergeResponse(
      // @ts-ignore
      a?.response,
      // @ts-ignore
      b?.response
    ),
    type: a?.type || b?.type,
    detail: mergeDeep(
      // @ts-ignore
      b?.detail ?? {},
      // @ts-ignore
      a?.detail ?? {}
    ),
    parse: mergeObjectArray(a?.parse, b?.parse),
    transform: mergeObjectArray(a?.transform, b?.transform),
    beforeHandle: mergeObjectArray(
      mergeObjectArray(
        // @ts-ignore
        fnToContainer(a?.resolve, "resolve"),
        a?.beforeHandle
      ),
      mergeObjectArray(
        fnToContainer(b.resolve, "resolve"),
        b?.beforeHandle
      )
    ),
    afterHandle: mergeObjectArray(a?.afterHandle, b?.afterHandle),
    mapResponse: mergeObjectArray(a?.mapResponse, b?.mapResponse),
    afterResponse: mergeObjectArray(
      a?.afterResponse,
      b?.afterResponse
    ),
    trace: mergeObjectArray(a?.trace, b?.trace),
    error: mergeObjectArray(a?.error, b?.error)
  };
  return hook.resolve && delete hook.resolve, hook;
}, lifeCycleToArray = (a) => {
  a.parse && !Array.isArray(a.parse) && (a.parse = [a.parse]), a.transform && !Array.isArray(a.transform) && (a.transform = [a.transform]), a.afterHandle && !Array.isArray(a.afterHandle) && (a.afterHandle = [a.afterHandle]), a.mapResponse && !Array.isArray(a.mapResponse) && (a.mapResponse = [a.mapResponse]), a.afterResponse && !Array.isArray(a.afterResponse) && (a.afterResponse = [a.afterResponse]), a.trace && !Array.isArray(a.trace) && (a.trace = [a.trace]), a.error && !Array.isArray(a.error) && (a.error = [a.error]);
  let beforeHandle = [];
  return a.resolve && (beforeHandle = fnToContainer(
    // @ts-expect-error
    Array.isArray(a.resolve) ? a.resolve : [a.resolve],
    "resolve"
  ), delete a.resolve), a.beforeHandle && (beforeHandle.length ? beforeHandle = beforeHandle.concat(
    Array.isArray(a.beforeHandle) ? a.beforeHandle : [a.beforeHandle]
  ) : beforeHandle = Array.isArray(a.beforeHandle) ? a.beforeHandle : [a.beforeHandle]), beforeHandle.length && (a.beforeHandle = beforeHandle), a;
}, isBun2 = typeof Bun < "u", hasBunHash = isBun2 && typeof Bun.hash == "function", checksum = (s) => {
  let h = 9;
  for (let i = 0; i < s.length; ) h = Math.imul(h ^ s.charCodeAt(i++), 9 ** 9);
  return h = h ^ h >>> 9;
}, injectChecksum = (checksum2, x) => {
  if (!x) return;
  if (!Array.isArray(x)) {
    let fn = x;
    return checksum2 && !fn.checksum && (fn.checksum = checksum2), fn.scope === "scoped" && (fn.scope = "local"), fn;
  }
  let fns = [...x];
  for (let fn of fns)
    checksum2 && !fn.checksum && (fn.checksum = checksum2), fn.scope === "scoped" && (fn.scope = "local");
  return fns;
}, mergeLifeCycle = (a, b, checksum2) => ({
  start: mergeObjectArray(
    a.start,
    injectChecksum(checksum2, b?.start)
  ),
  request: mergeObjectArray(
    a.request,
    injectChecksum(checksum2, b?.request)
  ),
  parse: mergeObjectArray(
    a.parse,
    injectChecksum(checksum2, b?.parse)
  ),
  transform: mergeObjectArray(
    a.transform,
    injectChecksum(checksum2, b?.transform)
  ),
  beforeHandle: mergeObjectArray(
    mergeObjectArray(
      // @ts-ignore
      fnToContainer(a.resolve, "resolve"),
      a.beforeHandle
    ),
    injectChecksum(
      checksum2,
      mergeObjectArray(
        fnToContainer(b?.resolve, "resolve"),
        b?.beforeHandle
      )
    )
  ),
  afterHandle: mergeObjectArray(
    a.afterHandle,
    injectChecksum(checksum2, b?.afterHandle)
  ),
  mapResponse: mergeObjectArray(
    a.mapResponse,
    injectChecksum(checksum2, b?.mapResponse)
  ),
  afterResponse: mergeObjectArray(
    a.afterResponse,
    injectChecksum(checksum2, b?.afterResponse)
  ),
  // Already merged on Elysia._use, also logic is more complicated, can't directly merge
  trace: mergeObjectArray(
    a.trace,
    injectChecksum(checksum2, b?.trace)
  ),
  error: mergeObjectArray(
    a.error,
    injectChecksum(checksum2, b?.error)
  ),
  stop: mergeObjectArray(
    a.stop,
    injectChecksum(checksum2, b?.stop)
  )
}), asHookType = (fn, inject, { skipIfHasType = !1 }) => {
  if (!fn) return fn;
  if (!Array.isArray(fn))
    return skipIfHasType ? fn.scope ??= inject : fn.scope = inject, fn;
  for (let x of fn)
    skipIfHasType ? x.scope ??= inject : x.scope = inject;
  return fn;
}, filterGlobal = (fn) => {
  if (!fn) return fn;
  if (!Array.isArray(fn))
    switch (fn.scope) {
      case "global":
      case "scoped":
        return { ...fn };
      default:
        return { fn };
    }
  let array = [];
  for (let x of fn)
    switch (x.scope) {
      case "global":
      case "scoped":
        array.push({
          ...x
        });
        break;
    }
  return array;
}, filterGlobalHook = (hook) => ({
  // rest is validator
  ...hook,
  type: hook?.type,
  detail: hook?.detail,
  parse: filterGlobal(hook?.parse),
  transform: filterGlobal(hook?.transform),
  beforeHandle: filterGlobal(hook?.beforeHandle),
  afterHandle: filterGlobal(hook?.afterHandle),
  mapResponse: filterGlobal(hook?.mapResponse),
  afterResponse: filterGlobal(hook?.afterResponse),
  error: filterGlobal(hook?.error),
  trace: filterGlobal(hook?.trace)
}), StatusMap = {
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
}, traceBackMacro = (extension, property, manage) => {
  if (!(!extension || typeof extension != "object" || !property))
    for (let [key, value] of Object.entries(property)) {
      if (primitiveHookMap[key] || !(key in extension)) continue;
      let v = extension[key];
      if (typeof v == "function") {
        let hook = v(value);
        if (typeof hook == "object")
          for (let [k, v2] of Object.entries(hook))
            manage(k)({
              fn: v2
            });
      }
      delete property[key];
    }
}, createMacroManager = ({
  globalHook,
  localHook
}) => (stackName) => (type, fn) => {
  if (typeof type == "function" && (type = {
    fn: type
  }), stackName === "resolve" && (type = {
    ...type,
    subType: "resolve"
  }), localHook[stackName] || (localHook[stackName] = []), typeof localHook[stackName] == "function" && (localHook[stackName] = [localHook[stackName]]), Array.isArray(localHook[stackName]) || (localHook[stackName] = [localHook[stackName]]), "fn" in type || Array.isArray(type)) {
    Array.isArray(type) ? localHook[stackName] = localHook[stackName].concat(type) : localHook[stackName].push(type);
    return;
  }
  let { insert = "after", stack = "local" } = type;
  typeof fn == "function" && (fn = { fn }), stack === "global" ? Array.isArray(fn) ? insert === "before" ? globalHook[stackName] = fn.concat(
    globalHook[stackName]
  ) : globalHook[stackName] = globalHook[stackName].concat(fn) : insert === "before" ? globalHook[stackName].unshift(fn) : globalHook[stackName].push(fn) : Array.isArray(fn) ? insert === "before" ? localHook[stackName] = fn.concat(localHook[stackName]) : localHook[stackName] = localHook[stackName].concat(fn) : insert === "before" ? localHook[stackName].unshift(fn) : localHook[stackName].push(fn);
}, parseNumericString = (message) => {
  if (typeof message == "number") return message;
  if (message.length < 16) {
    if (message.trim().length === 0) return null;
    let length = Number(message);
    return Number.isNaN(length) ? null : length;
  }
  if (message.length === 16) {
    if (message.trim().length === 0) return null;
    let number = Number(message);
    return Number.isNaN(number) || number.toString() !== message ? null : number;
  }
  return null;
}, isNumericString = (message) => parseNumericString(message) !== null, PromiseGroup = class {
  constructor(onError = console.error, onFinally = () => {
  }) {
    this.onError = onError;
    this.onFinally = onFinally;
    this.root = null;
    this.promises = [];
  }
  /**
   * The number of promises still being awaited.
   */
  get size() {
    return this.promises.length;
  }
  /**
   * Add a promise to the group.
   * @returns The promise that was added.
   */
  add(promise) {
    return this.promises.push(promise), this.root ||= this.drain(), this.promises.length === 1 && this.then(this.onFinally), promise;
  }
  async drain() {
    for (; this.promises.length > 0; ) {
      try {
        await this.promises[0];
      } catch (error) {
        this.onError(error);
      }
      this.promises.shift();
    }
    this.root = null;
  }
  // Allow the group to be awaited.
  then(onfulfilled, onrejected) {
    return (this.root ?? Promise.resolve()).then(onfulfilled, onrejected);
  }
}, fnToContainer = (fn, subType) => {
  if (!fn) return fn;
  if (!Array.isArray(fn)) {
    if (typeof fn == "function" || typeof fn == "string")
      return subType ? { fn, subType } : { fn };
    if ("fn" in fn) return fn;
  }
  let fns = [];
  for (let x of fn)
    typeof x == "function" || typeof x == "string" ? fns.push(subType ? { fn: x, subType } : { fn: x }) : "fn" in x && fns.push(x);
  return fns;
}, localHookToLifeCycleStore = (a) => (a.start && (a.start = fnToContainer(a.start)), a.request && (a.request = fnToContainer(a.request)), a.parse && (a.parse = fnToContainer(a.parse)), a.transform && (a.transform = fnToContainer(a.transform)), a.beforeHandle && (a.beforeHandle = fnToContainer(a.beforeHandle)), a.afterHandle && (a.afterHandle = fnToContainer(a.afterHandle)), a.mapResponse && (a.mapResponse = fnToContainer(a.mapResponse)), a.afterResponse && (a.afterResponse = fnToContainer(a.afterResponse)), a.trace && (a.trace = fnToContainer(a.trace)), a.error && (a.error = fnToContainer(a.error)), a.stop && (a.stop = fnToContainer(a.stop)), a), lifeCycleToFn = (a) => (a.start?.map && (a.start = a.start.map((x) => x.fn)), a.request?.map && (a.request = a.request.map((x) => x.fn)), a.parse?.map && (a.parse = a.parse.map((x) => x.fn)), a.transform?.map && (a.transform = a.transform.map((x) => x.fn)), a.beforeHandle?.map && (a.beforeHandle = a.beforeHandle.map((x) => x.fn)), a.afterHandle?.map && (a.afterHandle = a.afterHandle.map((x) => x.fn)), a.mapResponse?.map && (a.mapResponse = a.mapResponse.map((x) => x.fn)), a.afterResponse?.map && (a.afterResponse = a.afterResponse.map((x) => x.fn)), a.trace?.map ? a.trace = a.trace.map((x) => x.fn) : a.trace = [], a.error?.map && (a.error = a.error.map((x) => x.fn)), a.stop?.map && (a.stop = a.stop.map((x) => x.fn)), a), cloneInference = (inference) => ({
  body: inference.body,
  cookie: inference.cookie,
  headers: inference.headers,
  query: inference.query,
  set: inference.set,
  server: inference.server,
  path: inference.path,
  route: inference.route,
  url: inference.url
}), redirect = (url, status = 302) => Response.redirect(url, status), ELYSIA_FORM_DATA = Symbol("ElysiaFormData"), ELYSIA_REQUEST_ID = Symbol("ElysiaRequestId"), form = (items) => {
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
}, deduplicateChecksum = (array) => {
  let hashes = [];
  for (let i = 0; i < array.length; i++) {
    let item = array[i];
    item.checksum && (hashes.includes(item.checksum) && (array.splice(i, 1), i--), hashes.push(item.checksum));
  }
  return array;
}, promoteEvent = (events, as = "scoped") => {
  if (events) {
    if (as === "scoped") {
      for (let event of events)
        "scope" in event && event.scope === "local" && (event.scope = "scoped");
      return;
    }
    for (let event of events) "scope" in event && (event.scope = "global");
  }
}, getLoosePath = (path) => path.charCodeAt(path.length - 1) === 47 ? path.slice(0, path.length - 1) : path + "/", isNotEmpty = (obj) => {
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
export {
  ELYSIA_FORM_DATA,
  ELYSIA_REQUEST_ID,
  InvertedStatusMap,
  PromiseGroup,
  StatusMap,
  asHookType,
  checksum,
  cloneInference,
  createMacroManager,
  deduplicateChecksum,
  encodePath,
  filterGlobalHook,
  fnToContainer,
  form,
  getLoosePath,
  hasHeaderShorthand,
  injectChecksum,
  isClass,
  isNotEmpty,
  isNumericString,
  lifeCycleToArray,
  lifeCycleToFn,
  localHookToLifeCycleStore,
  mergeCookie,
  mergeDeep,
  mergeHook,
  mergeLifeCycle,
  mergeObjectArray,
  mergeResponse,
  mergeSchemaValidator,
  primitiveHooks,
  promoteEvent,
  randomId,
  redirect,
  replaceUrlPath,
  signCookie,
  supportPerMethodInlineHandler,
  traceBackMacro,
  unsignCookie
};
