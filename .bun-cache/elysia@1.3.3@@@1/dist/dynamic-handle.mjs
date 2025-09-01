// src/dynamic-handle.ts
import { TransformDecodeError } from "@sinclair/typebox/value";

// src/error.ts
import { Value } from "@sinclair/typebox/value";

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
var redirect = (url, status2 = 302) => Response.redirect(url, status2), ELYSIA_FORM_DATA = Symbol("ElysiaFormData"), ELYSIA_REQUEST_ID = Symbol("ElysiaRequestId");
var supportPerMethodInlineHandler = (() => {
  if (typeof Bun > "u") return !0;
  let semver = Bun.version.split(".");
  return !(+semver[0] < 1 || +semver[1] < 2 || +semver[2] < 14);
})();

// src/error.ts
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
};
var InvalidCookieSignature = class extends Error {
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
};
var ValidationError = class _ValidationError extends Error {
  constructor(type, validator, value, errors) {
    value && typeof value == "object" && value instanceof ElysiaCustomStatusResponse && (value = value.response);
    let error = errors?.First() || (isProduction ? void 0 : "Errors" in validator ? validator.Errors(value).First() : Value.Errors(validator, value).First()), customError = error?.schema?.message || error?.schema?.error !== void 0 ? typeof error.schema.error == "function" ? error.schema.error({
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
      let schema = validator?.schema ?? validator, errors2 = "Errors" in validator ? [...validator.Errors(value)].map(mapValueError) : [...Value.Errors(validator, value)].map(mapValueError), expected;
      try {
        expected = Value.Create(schema);
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
      [...Value.Errors(this.validator, this.value)].map(mapValueError)
    );
  }
  static simplifyModel(validator) {
    let model = "schema" in validator ? validator.schema : validator;
    try {
      return Value.Create(model);
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

// src/parse-query.ts
import decode from "fast-decode-uri-component";
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
    flags & KEY_HAS_PLUS && (finalKey = finalKey.replace(/\+/g, " ")), flags & KEY_NEEDS_DECODE && (finalKey = decode(finalKey) || finalKey);
    let finalValue = "";
    if (hasBothKeyValuePair) {
      let valueSlice = input2.slice(equalityIndex + 1, endIndex);
      flags & VALUE_HAS_PLUS && (valueSlice = valueSlice.replace(/\+/g, " ")), flags & VALUE_NEEDS_DECODE && (valueSlice = decode(valueSlice) || valueSlice), finalValue = valueSlice;
    }
    let currentValue = result[finalKey];
    currentValue === void 0 ? result[finalKey] = finalValue : Array.isArray(currentValue) ? currentValue.push(finalValue) : result[finalKey] = [currentValue, finalValue];
  }
}

// src/cookies.ts
import { parse, serialize } from "cookie";
import decode2 from "fast-decode-uri-component";
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
  let jar = {}, cookies = parse(cookieString);
  for (let [name, v] of Object.entries(cookies)) {
    if (v === void 0) continue;
    let value = decode2(v);
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

// src/dynamic-handle.ts
var injectDefaultValues = (typeChecker, obj) => {
  for (let [key, keySchema] of Object.entries(
    // @ts-expect-error private
    typeChecker.schema.properties
  ))
    obj[key] ??= keySchema.default;
}, createDynamicHandler = (app) => {
  let { mapResponse, mapEarlyResponse } = app["~adapter"].handler;
  return async (request) => {
    let url = request.url, s = url.indexOf("/", 11), qi = url.indexOf("?", s + 1), path = qi === -1 ? url.substring(s) : url.substring(s, qi), set = {
      cookie: {},
      status: 200,
      headers: {}
    }, context = Object.assign(
      {},
      // @ts-expect-error
      app.singleton.decorator,
      {
        set,
        // @ts-expect-error
        store: app.singleton.store,
        request,
        path,
        qi,
        error: status,
        status,
        redirect
      }
    );
    try {
      if (app.event.request)
        for (let i = 0; i < app.event.request.length; i++) {
          let onRequest = app.event.request[i].fn, response2 = onRequest(context);
          if (response2 instanceof Promise && (response2 = await response2), response2 = mapEarlyResponse(response2, set), response2) return context.response = response2;
        }
      let handler = app.router.dynamic.find(request.method, path) ?? app.router.dynamic.find("ALL", path);
      if (!handler) throw new NotFoundError();
      let { handle, hooks, validator, content, route } = handler.store, body;
      if (request.method !== "GET" && request.method !== "HEAD")
        if (content)
          switch (content) {
            case "application/json":
              body = await request.json();
              break;
            case "text/plain":
              body = await request.text();
              break;
            case "application/x-www-form-urlencoded":
              body = parseQuery(await request.text());
              break;
            case "application/octet-stream":
              body = await request.arrayBuffer();
              break;
            case "multipart/form-data":
              body = {};
              let form = await request.formData();
              for (let key of form.keys()) {
                if (body[key]) continue;
                let value = form.getAll(key);
                value.length === 1 ? body[key] = value[0] : body[key] = value;
              }
              break;
          }
        else {
          let contentType = request.headers.get("content-type");
          if (contentType) {
            let index = contentType.indexOf(";");
            if (index !== -1 && (contentType = contentType.slice(0, index)), context.contentType = contentType, hooks.parse)
              for (let i = 0; i < hooks.parse.length; i++) {
                let hook = hooks.parse[i].fn, temp = hook(context, contentType);
                if (temp instanceof Promise && (temp = await temp), temp) {
                  body = temp;
                  break;
                }
              }
            if (delete context.contentType, body === void 0)
              switch (contentType) {
                case "application/json":
                  body = await request.json();
                  break;
                case "text/plain":
                  body = await request.text();
                  break;
                case "application/x-www-form-urlencoded":
                  body = parseQuery(await request.text());
                  break;
                case "application/octet-stream":
                  body = await request.arrayBuffer();
                  break;
                case "multipart/form-data":
                  body = {};
                  let form = await request.formData();
                  for (let key of form.keys()) {
                    if (body[key]) continue;
                    let value = form.getAll(key);
                    value.length === 1 ? body[key] = value[0] : body[key] = value;
                  }
                  break;
              }
          }
        }
      context.route = route, context.body = body, context.params = handler?.params || void 0, context.query = qi === -1 ? {} : parseQuery(url.substring(qi + 1)), context.headers = {};
      for (let [key, value] of request.headers.entries())
        context.headers[key] = value;
      let cookieMeta = Object.assign(
        {},
        app.config?.cookie,
        validator?.cookie?.config
      ), cookieHeaderValue = request.headers.get("cookie");
      context.cookie = await parseCookie(
        context.set,
        cookieHeaderValue,
        cookieMeta ? {
          secrets: cookieMeta.secrets !== void 0 ? typeof cookieMeta.secrets == "string" ? cookieMeta.secrets : cookieMeta.secrets.join(",") : void 0,
          sign: cookieMeta.sign === !0 ? !0 : cookieMeta.sign !== void 0 ? typeof cookieMeta.sign == "string" ? cookieMeta.sign : cookieMeta.sign.join(",") : void 0
        } : void 0
      );
      let headerValidator = validator?.createHeaders?.();
      headerValidator && injectDefaultValues(headerValidator, context.headers);
      let paramsValidator = validator?.createParams?.();
      paramsValidator && injectDefaultValues(paramsValidator, context.params);
      let queryValidator = validator?.createQuery?.();
      if (queryValidator && injectDefaultValues(queryValidator, context.query), hooks.transform)
        for (let i = 0; i < hooks.transform.length; i++) {
          let hook = hooks.transform[i], operation = hook.fn(context);
          hook.subType === "derive" ? operation instanceof Promise ? Object.assign(context, await operation) : Object.assign(context, operation) : operation instanceof Promise && await operation;
        }
      if (validator) {
        if (headerValidator) {
          let _header = structuredClone(context.headers);
          for (let [key, value] of request.headers)
            _header[key] = value;
          if (validator.headers.Check(_header) === !1)
            throw new ValidationError(
              "header",
              validator.headers,
              _header
            );
        } else validator.headers?.Decode && (context.headers = validator.headers.Decode(context.headers));
        if (paramsValidator?.Check(context.params) === !1)
          throw new ValidationError(
            "params",
            validator.params,
            context.params
          );
        if (validator.params?.Decode && (context.params = validator.params.Decode(context.params)), queryValidator?.Check(context.query) === !1)
          throw new ValidationError(
            "query",
            validator.query,
            context.query
          );
        if (validator.query?.Decode && (context.query = validator.query.Decode(context.query)), validator.createCookie?.()) {
          let cookieValue = {};
          for (let [key, value] of Object.entries(context.cookie))
            cookieValue[key] = value.value;
          if (validator.cookie.Check(cookieValue) === !1)
            throw new ValidationError(
              "cookie",
              validator.cookie,
              cookieValue
            );
          validator.cookie?.Decode && (cookieValue = validator.cookie.Decode(
            cookieValue
          ));
        }
        if (validator.createBody?.()?.Check(body) === !1)
          throw new ValidationError("body", validator.body, body);
        validator.body?.Decode && (context.body = validator.body.Decode(body));
      }
      if (hooks.beforeHandle)
        for (let i = 0; i < hooks.beforeHandle.length; i++) {
          let hook = hooks.beforeHandle[i], response2 = hook.fn(context);
          if (hook.subType === "resolve") {
            if (response2 instanceof ElysiaCustomStatusResponse) {
              let result = mapEarlyResponse(
                response2,
                context.set
              );
              if (result)
                return context.response = result;
            }
            response2 instanceof Promise ? Object.assign(context, await response2) : Object.assign(context, response2);
            continue;
          } else response2 instanceof Promise && (response2 = await response2);
          if (response2 !== void 0) {
            if (context.response = response2, hooks.afterHandle)
              for (let i2 = 0; i2 < hooks.afterHandle.length; i2++) {
                let newResponse = hooks.afterHandle[i2].fn(
                  context
                );
                newResponse instanceof Promise && (newResponse = await newResponse), newResponse && (response2 = newResponse);
              }
            let result = mapEarlyResponse(response2, context.set);
            if (result) return context.response = result;
          }
        }
      let response = typeof handle == "function" ? handle(context) : handle;
      if (response instanceof Promise && (response = await response), hooks.afterHandle)
        if (hooks.afterHandle.length) {
          context.response = response;
          for (let i = 0; i < hooks.afterHandle.length; i++) {
            let newResponse = hooks.afterHandle[i].fn(
              context
            );
            newResponse instanceof Promise && (newResponse = await newResponse);
            let result = mapEarlyResponse(
              newResponse,
              context.set
            );
            if (result !== void 0) {
              let responseValidator = (
                // @ts-expect-error
                validator?.response?.[result.status]
              );
              if (responseValidator?.Check(result) === !1)
                throw new ValidationError(
                  "response",
                  responseValidator,
                  result
                );
              return responseValidator?.Decode && (response = responseValidator.Decode(response)), context.response = result;
            }
          }
        } else {
          let status2 = response instanceof ElysiaCustomStatusResponse ? response.code : set.status ? typeof set.status == "string" ? StatusMap[set.status] : set.status : 200, responseValidator = validator?.createResponse?.()?.[status2];
          if (responseValidator?.Check(response) === !1)
            throw new ValidationError(
              "response",
              responseValidator,
              response
            );
          responseValidator?.Decode && (response = responseValidator.Decode(response));
        }
      if (context.set.cookie && cookieMeta?.sign) {
        let secret = cookieMeta.secrets ? typeof cookieMeta.secrets == "string" ? cookieMeta.secrets : cookieMeta.secrets[0] : void 0;
        if (cookieMeta.sign === !0)
          for (let [key, cookie] of Object.entries(
            context.set.cookie
          ))
            context.set.cookie[key].value = await signCookie(
              cookie.value,
              "${secret}"
            );
        else {
          let properties = validator?.cookie?.schema?.properties;
          for (let name of cookieMeta.sign)
            name in properties && context.set.cookie[name]?.value && (context.set.cookie[name].value = await signCookie(
              context.set.cookie[name].value,
              secret
            ));
        }
      }
      return mapResponse(context.response = response, context.set);
    } catch (error) {
      let reportedError = error instanceof TransformDecodeError && error.error ? error.error : error;
      return app.handleError(context, reportedError);
    } finally {
      if (app.event.afterResponse)
        for (let afterResponse of app.event.afterResponse)
          await afterResponse.fn(context);
    }
  };
}, createDynamicErrorHandler = (app) => {
  let { mapResponse } = app["~adapter"].handler;
  return async (context, error) => {
    let errorContext = Object.assign(context, { error, code: error.code });
    if (errorContext.set = context.set, app.event.error)
      for (let i = 0; i < app.event.error.length; i++) {
        let response = app.event.error[i].fn(errorContext);
        if (response instanceof Promise && (response = await response), response != null)
          return context.response = mapResponse(
            response,
            context.set
          );
      }
    return new Response(
      typeof error.cause == "string" ? error.cause : error.message,
      {
        headers: context.set.headers,
        status: error.status ?? 500
      }
    );
  };
};
export {
  createDynamicErrorHandler,
  createDynamicHandler
};
