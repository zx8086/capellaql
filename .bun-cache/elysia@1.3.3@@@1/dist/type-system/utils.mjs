// src/type-system/utils.ts
import {
  Kind,
  TypeRegistry,
  Unsafe
} from "@sinclair/typebox";
import { Value as Value2 } from "@sinclair/typebox/value";
import { TypeCompiler } from "@sinclair/typebox/compiler";

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
var encoder = new TextEncoder();
var ELYSIA_FORM_DATA = Symbol("ElysiaFormData"), ELYSIA_REQUEST_ID = Symbol("ElysiaRequestId");
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

// src/type-system/utils.ts
var tryParse = (v, schema) => {
  try {
    return JSON.parse(v);
  } catch {
    throw new ValidationError("property", schema, v);
  }
};
function createType(kind, func) {
  return TypeRegistry.Has(kind) || TypeRegistry.Set(kind, func), (options = {}) => Unsafe({ ...options, [Kind]: kind });
}
var compile = (schema) => {
  try {
    let compiler = TypeCompiler.Compile(schema);
    return compiler.Create = () => Value2.Create(schema), compiler.Error = (v) => new ValidationError("property", schema, v, compiler.Errors(v)), compiler;
  } catch {
    return {
      Check: (v) => Value2.Check(schema, v),
      CheckThrow: (v) => {
        if (!Value2.Check(schema, v))
          throw new ValidationError(
            "property",
            schema,
            v,
            Value2.Errors(schema, v)
          );
      },
      Decode: (v) => Value2.Decode(schema, v),
      Create: () => Value2.Create(schema),
      Error: (v) => new ValidationError(
        "property",
        schema,
        v,
        Value2.Errors(schema, v)
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
export {
  checkFileExtension,
  compile,
  createType,
  fileTypeFromBlob,
  loadFileType,
  parseFileUnit,
  tryParse,
  validateFile,
  validateFileExtension
};
