// src/schema.ts
import {
  Kind as Kind3,
  OptionalKind,
  TransformKind
} from "@sinclair/typebox";
import { Value as Value3 } from "@sinclair/typebox/value";
import { TypeCompiler as TypeCompiler3 } from "@sinclair/typebox/compiler";
import {
  createMirror
} from "exact-mirror";

// src/type-system/index.ts
import { Type, Kind as Kind2 } from "@sinclair/typebox";

// src/type-system/format.ts
import { FormatRegistry } from "@sinclair/typebox";
var fullFormats = {
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
FormatRegistry.Has("date") || FormatRegistry.Set("date", (value) => {
  let temp = parseDateTimeEmptySpace(value).replace(/"/g, "");
  if (isISO8601.test(temp) || isFormalDate.test(temp) || isShortenDate.test(temp) || _validateDate(temp)) {
    let date2 = new Date(temp);
    if (!Number.isNaN(date2.getTime())) return !0;
  }
  return !1;
});
FormatRegistry.Has("date-time") || FormatRegistry.Set("date-time", (value) => {
  let temp = value.replace(/"/g, "");
  if (isISO8601.test(temp) || isFormalDate.test(temp) || isShortenDate.test(temp) || _validateDateTime(temp)) {
    let date2 = new Date(temp);
    if (!Number.isNaN(date2.getTime())) return !0;
  }
  return !1;
});
Object.entries(fullFormats).forEach((formatEntry) => {
  let [formatName, formatValue] = formatEntry;
  FormatRegistry.Has(formatName) || (formatValue instanceof RegExp ? FormatRegistry.Set(formatName, (value) => formatValue.test(value)) : typeof formatValue == "function" && FormatRegistry.Set(formatName, formatValue));
});
FormatRegistry.Has("numeric") || FormatRegistry.Set("numeric", (value) => !!value && !isNaN(+value));
FormatRegistry.Has("integer") || FormatRegistry.Set(
  "integer",
  (value) => !!value && Number.isInteger(+value)
);
FormatRegistry.Has("boolean") || FormatRegistry.Set(
  "boolean",
  (value) => value === "true" || value === "false"
);
FormatRegistry.Has("ObjectString") || FormatRegistry.Set("ObjectString", (value) => {
  let start = value.charCodeAt(0);
  if ((start === 9 || start === 10 || start === 32) && (start = value.trimStart().charCodeAt(0)), start !== 123 && start !== 91) return !1;
  try {
    return JSON.parse(value), !0;
  } catch {
    return !1;
  }
});
FormatRegistry.Has("ArrayString") || FormatRegistry.Set("ArrayString", (value) => {
  let start = value.charCodeAt(0);
  if ((start === 9 || start === 10 || start === 32) && (start = value.trimStart().charCodeAt(0)), start !== 123 && start !== 91) return !1;
  try {
    return JSON.parse(value), !0;
  } catch {
    return !1;
  }
});

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
var ELYSIA_FORM_DATA = Symbol("ElysiaFormData"), ELYSIA_REQUEST_ID = Symbol("ElysiaRequestId"), form = (items) => {
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
}, loadFileType = async () => import("file-type").then((x) => (_fileTypeFromBlob = x.fileTypeFromBlob, _fileTypeFromBlob)).catch(warnIfFileTypeIsNotInstalled), _fileTypeFromBlob;
var validateFile = (options, value) => {
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
import {
  TypeSystemPolicy,
  TypeSystem,
  TypeSystemDuplicateFormat,
  TypeSystemDuplicateTypeKind
} from "@sinclair/typebox/system";
import { TypeRegistry as TypeRegistry2, FormatRegistry as FormatRegistry2 } from "@sinclair/typebox";
import { TypeCompiler as TypeCompiler2, TypeCheck as TypeCheck2 } from "@sinclair/typebox/compiler";
var t = Object.assign({}, Type);
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
  String: (property) => Type.String(property),
  Numeric: (property) => {
    let schema = Type.Number(property), compiler = compile(schema);
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
    let schema = Type.Integer(property), compiler = compile(schema);
    return t.Transform(
      t.Union(
        [
          t.String({
            format: "integer",
            default: 0
          }),
          Type.Integer(property)
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
    let schema = Type.Date(property), compiler = compile(schema), _default = property?.default ? new Date(property.default) : void 0;
    return t.Transform(
      t.Union(
        [
          Type.Date(property),
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
    let schema = Type.Boolean(property), compiler = compile(schema);
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
    let schema = t.Array(children, options), compiler = compile(schema), decode = (value, isProperty = !1) => {
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
            let t2 = decode(v, !0);
            Array.isArray(t2) ? values = values.concat(t2) : values.push(t2);
            continue;
          }
          values.push(v);
        }
        return values;
      }
      return typeof value == "string" ? decode(value) : value;
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
      [Kind2]: "UnionEnum",
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
var isOptional = (schema) => schema ? schema?.[Kind3] === "Import" && schema.References ? schema.References().some(isOptional) : (schema.schema && (schema = schema.schema), !!schema && OptionalKind in schema) : !1, hasAdditionalProperties = (_schema) => {
  if (!_schema) return !1;
  let schema = _schema?.schema ?? _schema;
  if (schema[Kind3] === "Import" && _schema.References)
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
  if (Kind3 in schema && schema[Kind3] === type) return !0;
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
      if (Kind3 in property && property[Kind3] === type) return !0;
    }
    return !1;
  }
  return !!schema.properties && Kind3 in schema.properties && schema.properties[Kind3] === type;
}, hasProperty = (expectedProperty, _schema) => {
  if (!_schema) return;
  let schema = _schema.schema ?? _schema;
  if (schema[Kind3] === "Import" && _schema.References)
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
  return schema.type === "array" && schema.items && hasRef(schema.items) ? !0 : schema[Kind3] === "Ref" && "$ref" in schema;
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
  return schema.type === "array" && schema.items && hasTransform(schema.items) ? !0 : TransformKind in schema;
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
  let fromSymbol = options.from[Kind3];
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
  if (schema[Kind3] === fromSymbol) {
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
        Value3.Create(t.Object(properties2))
      ), value.properties = properties2), items && v.type === "string" && v.format === "ArrayString" && v.default === "[]" && (transform = t.ArrayString(items, rest), value.default = JSON.stringify(Value3.Create(t.Array(items))), value.items = items), value;
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
    if (transform && (to[TransformKind] = transform[TransformKind]), to.anyOf || to.oneOf || to.allOf || to.not) return to;
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
      switch (value[Kind3]) {
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
      return Value3.Clean(schema, value);
    } catch {
      try {
        return Value3.Clean(schema, value);
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
    if (schema2[Kind3] !== "Import" && (_doesHaveRef = hasRef(schema2))) {
      let id = randomId();
      doesHaveRef === void 0 && (doesHaveRef = _doesHaveRef), schema2 = t.Module({
        // @ts-expect-error private property
        ...modules?.$defs,
        [id]: schema2
      }).Import(id);
    }
    if (schema2[Kind3] === "Import") {
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
      Check: (value) => Value3.Check(schema, value),
      Errors: (value) => Value3.Errors(schema, value),
      Code: () => "",
      Clean: createCleaner(schema),
      Decode: (value) => Value3.Decode(schema, value),
      Encode: (value) => Value3.Encode(schema, value),
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
          validator.Clean = createMirror(schema, {
            TypeCompiler: TypeCompiler3,
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
  let compiled = TypeCompiler3.Compile(
    schema,
    Object.values(models)
  );
  if (schema.config && (compiled.config = schema.config, compiled?.schema?.config && delete compiled.schema.config), normalize === !0 || normalize === "exactMirror")
    try {
      compiled.Clean = createMirror(schema, {
        TypeCompiler: TypeCompiler3,
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
}, isUnion = (schema) => schema[Kind3] === "Union" || !schema.schema && !!schema.anyOf, mergeObjectSchemas = (schemas) => {
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
}, getResponseSchemaValidator = (s, {
  models = {},
  modules,
  dynamic = !1,
  normalize = !1,
  additionalProperties = !1,
  validators = [],
  sanitize
}) => {
  if (validators = validators.filter((x) => x), !s) {
    if (!validators?.length) return;
    s = validators[0], validators = validators.slice(1);
  }
  let maybeSchemaOrRecord;
  if (typeof s != "string") maybeSchemaOrRecord = s;
  else {
    let isArray = s.endsWith("[]"), key = isArray ? s.substring(0, s.length - 2) : s;
    maybeSchemaOrRecord = modules.Import(key) ?? models[key], isArray && (maybeSchemaOrRecord = t.Array(maybeSchemaOrRecord));
  }
  if (!maybeSchemaOrRecord) return;
  if (Kind3 in maybeSchemaOrRecord)
    return {
      200: getSchemaValidator(maybeSchemaOrRecord, {
        modules,
        models,
        additionalProperties,
        dynamic,
        normalize,
        coerce: !1,
        additionalCoerce: [],
        validators: validators.map((x) => x[200]),
        sanitize
      })
    };
  let record = {};
  return Object.keys(maybeSchemaOrRecord).forEach((status) => {
    if (isNaN(+status)) return;
    let maybeNameOrSchema = maybeSchemaOrRecord[+status];
    if (typeof maybeNameOrSchema == "string") {
      if (maybeNameOrSchema in models) {
        let schema = models[maybeNameOrSchema];
        record[+status] = Kind3 in schema ? getSchemaValidator(schema, {
          modules,
          models,
          additionalProperties,
          dynamic,
          normalize,
          coerce: !1,
          additionalCoerce: [],
          validators: validators.map((x) => x[+status]),
          sanitize
        }) : schema;
      }
      return;
    }
    record[+status] = Kind3 in maybeNameOrSchema ? getSchemaValidator(maybeNameOrSchema, {
      modules,
      models,
      additionalProperties,
      dynamic,
      normalize,
      coerce: !1,
      additionalCoerce: [],
      validators: validators.map((x) => x[+status]),
      sanitize
    }) : maybeNameOrSchema;
  }), record;
}, _stringToStructureCoercions, stringToStructureCoercions = () => (_stringToStructureCoercions || (_stringToStructureCoercions = [
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
export {
  coercePrimitiveRoot,
  getCookieValidator,
  getResponseSchemaValidator,
  getSchemaValidator,
  hasAdditionalProperties,
  hasProperty,
  hasRef,
  hasTransform,
  hasType,
  isOptional,
  isUnion,
  mergeObjectSchemas,
  replaceSchemaType,
  stringToStructureCoercions
};
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
