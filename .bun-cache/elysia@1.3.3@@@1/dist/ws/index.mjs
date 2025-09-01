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
var parseNumericString = (message) => {
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
}, isNumericString = (message) => parseNumericString(message) !== null;
var ELYSIA_FORM_DATA = Symbol("ElysiaFormData"), ELYSIA_REQUEST_ID = Symbol("ElysiaRequestId");
var supportPerMethodInlineHandler = (() => {
  if (typeof Bun > "u") return !0;
  let semver = Bun.version.split(".");
  return !(+semver[0] < 1 || +semver[1] < 2 || +semver[2] < 14);
})();

// src/error.ts
import { Value } from "@sinclair/typebox/value";
var env = typeof Bun < "u" ? Bun.env : typeof process < "u" ? process?.env : void 0, ERROR_CODE = Symbol("ElysiaErrorCode"), isProduction = (env?.NODE_ENV ?? env?.ENV) === "production", ElysiaCustomStatusResponse = class {
  constructor(code, response) {
    let res = response ?? (code in InvertedStatusMap ? (
      // @ts-expect-error Always correct
      InvertedStatusMap[code]
    ) : code);
    this.code = StatusMap[code] ?? code, this.response = res;
  }
};
var mapValueError = (error) => {
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

// src/ws/index.ts
var websocket = {
  open(ws) {
    ws.data.open?.(ws);
  },
  message(ws, message) {
    ws.data.message?.(ws, message);
  },
  drain(ws) {
    ws.data.drain?.(ws);
  },
  close(ws, code, reason) {
    ws.data.close?.(ws, code, reason);
  }
}, ElysiaWS = class {
  constructor(raw, data, body = void 0) {
    this.raw = raw;
    this.data = data;
    this.body = body;
    this.validator = raw.data?.validator, this.sendText = raw.sendText.bind(raw), this.sendBinary = raw.sendBinary.bind(raw), this.close = raw.close.bind(raw), this.terminate = raw.terminate.bind(raw), this.publishText = raw.publishText.bind(raw), this.publishBinary = raw.publishBinary.bind(raw), this.subscribe = raw.subscribe.bind(raw), this.unsubscribe = raw.unsubscribe.bind(raw), this.isSubscribed = raw.isSubscribed.bind(raw), this.cork = raw.cork.bind(raw), this.remoteAddress = raw.remoteAddress, this.binaryType = raw.binaryType, this.data = raw.data, this.send = this.send.bind(this), this.ping = this.ping.bind(this), this.pong = this.pong.bind(this), this.publish = this.publish.bind(this);
  }
  get id() {
    return this.data.id;
  }
  /**
   * Sends a message to the client.
   *
   * @param data The data to send.
   * @param compress Should the data be compressed? If the client does not support compression, this is ignored.
   * @example
   * ws.send("Hello!");
   * ws.send("Compress this.", true);
   * ws.send(new Uint8Array([1, 2, 3, 4]));
   */
  send(data, compress) {
    return Buffer.isBuffer(data) ? this.raw.send(data, compress) : this.validator?.Check(data) === !1 ? this.raw.send(
      new ValidationError("message", this.validator, data).message
    ) : (typeof data == "object" && (data = JSON.stringify(data)), this.raw.send(data, compress));
  }
  /**
   * Sends a ping.
   *
   * @param data The data to send
   */
  ping(data) {
    return Buffer.isBuffer(data) ? this.raw.ping(data) : this.validator?.Check(data) === !1 ? this.raw.send(
      new ValidationError("message", this.validator, data).message
    ) : (typeof data == "object" && (data = JSON.stringify(data)), this.raw.ping(data));
  }
  /**
   * Sends a pong.
   *
   * @param data The data to send
   */
  pong(data) {
    return Buffer.isBuffer(data) ? this.raw.pong(data) : this.validator?.Check(data) === !1 ? this.raw.send(
      new ValidationError("message", this.validator, data).message
    ) : (typeof data == "object" && (data = JSON.stringify(data)), this.raw.pong(data));
  }
  /**
   * Sends a message to subscribers of the topic.
   *
   * @param topic The topic name.
   * @param data The data to send.
   * @param compress Should the data be compressed? If the client does not support compression, this is ignored.
   * @example
   * ws.publish("chat", "Hello!");
   * ws.publish("chat", "Compress this.", true);
   * ws.publish("chat", new Uint8Array([1, 2, 3, 4]));
   */
  publish(topic, data, compress) {
    return Buffer.isBuffer(data) ? this.raw.publish(
      topic,
      data,
      compress
    ) : this.validator?.Check(data) === !1 ? this.raw.send(
      new ValidationError("message", this.validator, data).message
    ) : (typeof data == "object" && (data = JSON.stringify(data)), this.raw.publish(topic, data, compress));
  }
  get readyState() {
    return this.raw.readyState;
  }
}, createWSMessageParser = (parse) => {
  let parsers = typeof parse == "function" ? [parse] : parse;
  return async function(ws, message) {
    if (typeof message == "string") {
      let start = message?.charCodeAt(0);
      if (start === 34 || start === 47 || start === 91 || start === 123)
        try {
          message = JSON.parse(message);
        } catch {
        }
      else isNumericString(message) ? message = +message : message === "true" ? message = !0 : message === "false" ? message = !1 : message === "null" && (message = null);
    }
    if (parsers)
      for (let i = 0; i < parsers.length; i++) {
        let temp = parsers[i](ws, message);
        if (temp instanceof Promise && (temp = await temp), temp !== void 0) return temp;
      }
    return message;
  };
}, createHandleWSResponse = (validateResponse) => {
  let handleWSResponse = (ws, data) => {
    if (data instanceof Promise)
      return data.then((data2) => handleWSResponse(ws, data2));
    if (Buffer.isBuffer(data)) return ws.send(data.toString());
    if (data === void 0) return;
    let send = (datum) => {
      if (validateResponse?.Check(datum) === !1)
        return ws.send(
          new ValidationError("message", validateResponse, datum).message
        );
      if (typeof datum == "object") return ws.send(JSON.stringify(datum));
      ws.send(datum);
    };
    if (typeof data?.next != "function")
      return void send(data);
    let init = data.next();
    if (init instanceof Promise)
      return (async () => {
        let first = await init;
        if (validateResponse?.Check(first) === !1)
          return ws.send(
            new ValidationError("message", validateResponse, first).message
          );
        if (send(first.value), !first.done)
          for await (let datum of data) send(datum);
      })();
    if (send(init.value), !init.done) for (let datum of data) send(datum);
  };
  return handleWSResponse;
};
export {
  ElysiaWS,
  createHandleWSResponse,
  createWSMessageParser,
  websocket
};
