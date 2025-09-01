// node_modules/memoirist/dist/index.mjs
var createNode = (part, inert) => {
  let inertMap = inert?.length ? {} : null;
  if (inertMap)
    for (let child of inert)
      inertMap[child.part.charCodeAt(0)] = child;
  return {
    part,
    store: null,
    inert: inertMap,
    params: null,
    wildcardStore: null
  };
}, cloneNode = (node, part) => ({
  ...node,
  part
}), createParamNode = (name) => ({
  name,
  store: null,
  inert: null
}), Memoirist = class _Memoirist {
  constructor(config = {}) {
    this.config = config, config.lazy && (this.find = this.lazyFind);
  }
  root = {};
  history = [];
  deferred = [];
  static regex = {
    static: /:.+?(?=\/|$)/,
    params: /:.+?(?=\/|$)/g,
    optionalParams: /:.+?\?(?=\/|$)/g
  };
  lazyFind = (method, url) => this.config.lazy ? (this.build(), this.find(method, url)) : this.find;
  build() {
    if (this.config.lazy) {
      for (let [method, path, store] of this.deferred)
        this.add(method, path, store, { lazy: !1, ignoreHistory: !0 });
      this.deferred = [], this.find = (method, url) => {
        let root = this.root[method];
        return root ? matchRoute(url, url.length, root, 0) : null;
      };
    }
  }
  add(method, path, store, {
    ignoreError = !1,
    ignoreHistory = !1,
    lazy = this.config.lazy
  } = {}) {
    if (lazy)
      return this.find = this.lazyFind, this.deferred.push([method, path, store]), store;
    if (typeof path != "string")
      throw new TypeError("Route path must be a string");
    path === "" ? path = "/" : path[0] !== "/" && (path = `/${path}`);
    let isWildcard = path[path.length - 1] === "*", optionalParams = path.match(_Memoirist.regex.optionalParams);
    if (optionalParams) {
      let originalPath = path.replaceAll("?", "");
      this.add(method, originalPath, store, {
        ignoreError,
        ignoreHistory,
        lazy
      });
      for (let i = 0; i < optionalParams.length; i++) {
        let newPath = path.replace("/" + optionalParams[i], "");
        this.add(method, newPath, store, {
          ignoreError: !0,
          ignoreHistory,
          lazy
        });
      }
      return store;
    }
    if (optionalParams && (path = path.replaceAll("?", "")), this.history.find(([m, p, s]) => m === method && p === path))
      return store;
    (isWildcard || optionalParams && path.charCodeAt(path.length - 1) === 63) && (path = path.slice(0, -1)), ignoreHistory || this.history.push([method, path, store]);
    let inertParts = path.split(_Memoirist.regex.static), paramParts = path.match(_Memoirist.regex.params) || [];
    inertParts[inertParts.length - 1] === "" && inertParts.pop();
    let node;
    this.root[method] ? node = this.root[method] : node = this.root[method] = createNode("/");
    let paramPartsIndex = 0;
    for (let i = 0; i < inertParts.length; ++i) {
      let part = inertParts[i];
      if (i > 0) {
        let param = paramParts[paramPartsIndex++].slice(1);
        if (node.params === null)
          node.params = createParamNode(param);
        else if (node.params.name !== param) {
          if (ignoreError)
            return store;
          throw new Error(
            `Cannot create route "${path}" with parameter "${param}" because a route already exists with a different parameter name ("${node.params.name}") in the same location`
          );
        }
        let params = node.params;
        if (params.inert === null) {
          node = params.inert = createNode(part);
          continue;
        }
        node = params.inert;
      }
      for (let j = 0; ; ) {
        if (j === part.length) {
          if (j < node.part.length) {
            let childNode = cloneNode(node, node.part.slice(j));
            Object.assign(node, createNode(part, [childNode]));
          }
          break;
        }
        if (j === node.part.length) {
          node.inert === null && (node.inert = {});
          let inert = node.inert[part.charCodeAt(j)];
          if (inert) {
            node = inert, part = part.slice(j), j = 0;
            continue;
          }
          let childNode = createNode(part.slice(j));
          node.inert[part.charCodeAt(j)] = childNode, node = childNode;
          break;
        }
        if (part[j] !== node.part[j]) {
          let existingChild = cloneNode(node, node.part.slice(j)), newChild = createNode(part.slice(j));
          Object.assign(
            node,
            createNode(node.part.slice(0, j), [
              existingChild,
              newChild
            ])
          ), node = newChild;
          break;
        }
        ++j;
      }
    }
    if (paramPartsIndex < paramParts.length) {
      let name = paramParts[paramPartsIndex].slice(1);
      if (node.params === null)
        node.params = createParamNode(name);
      else if (node.params.name !== name) {
        if (ignoreError)
          return store;
        throw new Error(
          `Cannot create route "${path}" with parameter "${name}" because a route already exists with a different parameter name ("${node.params.name}") in the same location`
        );
      }
      return node.params.store === null && (node.params.store = store), node.params.store;
    }
    return isWildcard ? (node.wildcardStore === null && (node.wildcardStore = store), node.wildcardStore) : (node.store === null && (node.store = store), node.store);
  }
  find(method, url) {
    let root = this.root[method];
    return root ? matchRoute(url, url.length, root, 0) : null;
  }
}, matchRoute = (url, urlLength, node, startIndex) => {
  let part = node.part, length = part.length, endIndex = startIndex + length;
  if (length > 1) {
    if (endIndex > urlLength)
      return null;
    if (length < 15) {
      for (let i = 1, j = startIndex + 1; i < length; ++i, ++j)
        if (part.charCodeAt(i) !== url.charCodeAt(j))
          return null;
    } else if (url.slice(startIndex, endIndex) !== part)
      return null;
  }
  if (endIndex === urlLength)
    return node.store !== null ? {
      store: node.store,
      params: {}
    } : node.wildcardStore !== null ? {
      store: node.wildcardStore,
      params: { "*": "" }
    } : null;
  if (node.inert !== null) {
    let inert = node.inert[url.charCodeAt(endIndex)];
    if (inert !== void 0) {
      let route = matchRoute(url, urlLength, inert, endIndex);
      if (route !== null)
        return route;
    }
  }
  if (node.params !== null) {
    let { store, name, inert } = node.params, slashIndex = url.indexOf("/", endIndex);
    if (slashIndex !== endIndex) {
      if (slashIndex === -1 || slashIndex >= urlLength) {
        if (store !== null) {
          let params = {};
          return params[name] = url.substring(endIndex, urlLength), {
            store,
            params
          };
        }
      } else if (inert !== null) {
        let route = matchRoute(url, urlLength, inert, slashIndex);
        if (route !== null)
          return route.params[name] = url.substring(endIndex, slashIndex), route;
      }
    }
  }
  return node.wildcardStore !== null ? {
    store: node.wildcardStore,
    params: {
      "*": url.substring(endIndex, urlLength)
    }
  } : null;
};

// src/index.ts
import {
  Kind as Kind5
} from "@sinclair/typebox";

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
}, file = (path) => new ElysiaFile(path), createReadStream, stat, ElysiaFile = class {
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
      } catch (error2) {
        this.onError(error2);
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
}), redirect = (url, status2 = 302) => Response.redirect(url, status2), ELYSIA_FORM_DATA = Symbol("ElysiaFormData"), ELYSIA_REQUEST_ID = Symbol("ElysiaRequestId"), form = (items) => {
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

// src/error.ts
var env = typeof Bun < "u" ? Bun.env : typeof process < "u" ? process?.env : void 0, ERROR_CODE = Symbol("ElysiaErrorCode"), isProduction = (env?.NODE_ENV ?? env?.ENV) === "production", ElysiaCustomStatusResponse = class {
  constructor(code, response) {
    let res = response ?? (code in InvertedStatusMap ? (
      // @ts-expect-error Always correct
      InvertedStatusMap[code]
    ) : code);
    this.code = StatusMap[code] ?? code, this.response = res;
  }
}, status = (code, response) => new ElysiaCustomStatusResponse(code, response), error = status, InternalServerError = class extends Error {
  constructor(message) {
    super(message ?? "INTERNAL_SERVER_ERROR");
    this.code = "INTERNAL_SERVER_ERROR";
    this.status = 500;
  }
}, NotFoundError = class extends Error {
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
}, mapValueError = (error2) => {
  if (!error2)
    return {
      summary: void 0
    };
  let { message, path, value, type } = error2, property = path.slice(1).replaceAll("/", "."), isRoot = path === "";
  switch (type) {
    case 42:
      return {
        ...error2,
        summary: isRoot ? "Value should not be provided" : `Property '${property}' should not be provided`
      };
    case 45:
      return {
        ...error2,
        summary: isRoot ? "Value is missing" : `Property '${property}' is missing`
      };
    case 50:
      let quoteIndex = message.indexOf("'"), format = message.slice(
        quoteIndex + 1,
        message.indexOf("'", quoteIndex + 1)
      );
      return {
        ...error2,
        summary: isRoot ? "Value should be an email" : `Property '${property}' should be ${format}`
      };
    case 54:
      return {
        ...error2,
        summary: `${message.slice(0, 9).trim()} property '${property}' to be ${message.slice(8).trim()} but found: ${value}`
      };
    case 62:
      let union = error2.schema.anyOf.map((x) => `'${x?.format ?? x.type}'`).join(", ");
      return {
        ...error2,
        summary: isRoot ? `Value should be one of ${union}` : `Property '${property}' should be one of: ${union}`
      };
    default:
      return { summary: message, ...error2 };
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
    let error2 = errors?.First() || (isProduction ? void 0 : "Errors" in validator ? validator.Errors(value).First() : Value.Errors(validator, value).First()), customError = error2?.schema?.message || error2?.schema?.error !== void 0 ? typeof error2.schema.error == "function" ? error2.schema.error({
      type,
      validator,
      value,
      get errors() {
        return [...validator.Errors(value)].map(
          mapValueError
        );
      }
    }) : error2.schema.error : void 0, accessor = error2?.path || "root", message = "";
    if (customError !== void 0)
      message = typeof customError == "object" ? JSON.stringify(customError) : customError + "";
    else if (isProduction)
      message = JSON.stringify({
        type: "validation",
        on: type,
        summary: mapValueError(error2).summary,
        message: error2?.message,
        found: value
      });
    else {
      let schema = validator?.schema ?? validator, errors2 = "Errors" in validator ? [...validator.Errors(value)].map(mapValueError) : [...Value.Errors(validator, value)].map(mapValueError), expected;
      try {
        expected = Value.Create(schema);
      } catch (error3) {
        expected = {
          type: "Could not create expected value",
          // @ts-expect-error
          message: error3?.message,
          error: error3
        };
      }
      message = JSON.stringify(
        {
          type: "validation",
          on: type,
          summary: mapValueError(error2).summary,
          property: accessor,
          message: error2?.message,
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
}, loadFileType = async () => import("file-type").then((x) => (_fileTypeFromBlob = x.fileTypeFromBlob, _fileTypeFromBlob)).catch(warnIfFileTypeIsNotInstalled), _fileTypeFromBlob, fileTypeFromBlob = (file2) => _fileTypeFromBlob ? _fileTypeFromBlob(file2) : loadFileType().then((mod) => {
  if (mod) return mod(file2);
}), validateFileExtension = async (file2, extension, name = file2?.name ?? "") => {
  if (!file2) return;
  let result = await fileTypeFromBlob(file2);
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
}, pendingGC, caches = {}, clearSucroseCache = (delay = 0) => {
  pendingGC && clearTimeout(pendingGC), pendingGC = setTimeout(() => {
    caches = {}, pendingGC = void 0, isBun && Bun.gc(!1);
  }, delay);
}, mergeInference = (a, b) => ({
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
import { parse, serialize } from "cookie";
import decode from "fast-decode-uri-component";
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
}, createCookieJar = (set2, store, initial) => (set2.cookie || (set2.cookie = {}), new Proxy(store, {
  get(_, key) {
    return key in store ? new Cookie(
      key,
      set2.cookie,
      Object.assign({}, initial ?? {}, store[key])
    ) : new Cookie(
      key,
      set2.cookie,
      Object.assign({}, initial)
    );
  }
})), parseCookie = async (set2, cookieString, {
  secrets,
  sign,
  ...initial
} = {}) => {
  if (!cookieString) return createCookieJar(set2, {}, initial);
  let isStringKey = typeof secrets == "string";
  sign && sign !== !0 && !Array.isArray(sign) && (sign = [sign]);
  let jar = {}, cookies = parse(cookieString);
  for (let [name, v] of Object.entries(cookies)) {
    if (v === void 0) continue;
    let value = decode(v);
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
  return createCookieJar(set2, jar, initial);
}, serializeCookie = (cookies) => {
  if (!cookies || !isNotEmpty(cookies)) return;
  let set2 = [];
  for (let [key, property] of Object.entries(cookies)) {
    if (!key || !property) continue;
    let value = property.value;
    value != null && set2.push(
      serialize(
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
  let size = response.size;
  if (!set2 && size || size && set2 && set2.status !== 206 && set2.status !== 304 && set2.status !== 412 && set2.status !== 416) {
    if (set2) {
      if (set2.headers instanceof Headers) {
        let setHeaders = {
          "accept-ranges": "bytes",
          "content-range": `bytes 0-${size - 1}/${size}`,
          "transfer-encoding": "chunked"
        };
        if (hasHeaderShorthand)
          setHeaders = set2.headers.toJSON();
        else {
          setHeaders = {};
          for (let [key, value] of set2.headers.entries())
            key in set2.headers && (setHeaders[key] = value);
        }
        return new Response(response, {
          status: set2.status,
          headers: setHeaders
        });
      }
      if (isNotEmpty(set2.headers))
        return new Response(response, {
          status: set2.status,
          headers: Object.assign(
            {
              "accept-ranges": "bytes",
              "content-range": `bytes 0-${size - 1}/${size}`,
              "transfer-encoding": "chunked"
            },
            set2.headers
          )
        });
    }
    return new Response(response, {
      headers: {
        "accept-ranges": "bytes",
        "content-range": `bytes 0-${size - 1}/${size}`,
        "transfer-encoding": "chunked"
      }
    });
  }
  return new Response(response);
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
}, createStreamHandler = ({ mapResponse: mapResponse3, mapCompactResponse: mapCompactResponse3 }) => async (generator, set2, request) => {
  let init = generator.next();
  return init instanceof Promise && (init = await init), init.done ? set2 ? mapResponse3(init.value, set2, request) : mapCompactResponse3(init.value, request) : (set2?.headers ? (set2.headers["transfer-encoding"] || (set2.headers["transfer-encoding"] = "chunked"), set2.headers["content-type"] || (set2.headers["content-type"] = "text/event-stream; charset=utf-8")) : set2 = {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "transfer-encoding": "chunked"
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
        }), init.value !== void 0 && init.value !== null)
          if (typeof init.value == "object")
            try {
              controller.enqueue(
                Buffer.from(JSON.stringify(init.value))
              );
            } catch {
              controller.enqueue(
                Buffer.from(init.value.toString())
              );
            }
          else
            controller.enqueue(
              Buffer.from(init.value.toString())
            );
        for await (let chunk of generator) {
          if (end) break;
          if (chunk != null) {
            if (typeof chunk == "object")
              try {
                controller.enqueue(
                  Buffer.from(JSON.stringify(chunk))
                );
              } catch {
                controller.enqueue(
                  Buffer.from(chunk.toString())
                );
              }
            else controller.enqueue(Buffer.from(chunk.toString()));
            await new Promise(
              (resolve) => setTimeout(() => resolve(), 0)
            );
          }
        }
        try {
          controller.close();
        } catch {
        }
      }
    }),
    set2
  ));
};
async function* streamResponse(response) {
  let body = response.body;
  if (!body) return;
  let reader = body.getReader(), decoder = new TextDecoder();
  try {
    for (; ; ) {
      let { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value);
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
  let handleStream3 = createStreamHandler(handler);
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
    let status2 = set2.status ?? 200;
    return response.status !== status2 && status2 !== 200 && (response.status <= 300 || response.status > 400) ? response.text().then((value) => {
      let newResponse = new Response(value, {
        headers: response.headers,
        status: set2.status
      });
      return !newResponse.headers.has("content-length") && newResponse.headers.get(
        "transfer-encoding"
      ) === "chunked" ? handleStream3(
        streamResponse(newResponse),
        responseToSetHeaders(newResponse, set2),
        request
      ) : newResponse;
    }) : !response.headers.has("content-length") && response.headers.get("transfer-encoding") === "chunked" ? handleStream3(
      streamResponse(response),
      responseToSetHeaders(response, set2),
      request
    ) : response;
  };
};

// src/adapter/web-standard/handler.ts
var mapResponse = (response, set2, request) => {
  if (isNotEmpty(set2.headers) || set2.status !== 200 || set2.cookie)
    switch (handleSet(set2), response?.constructor?.name) {
      case "String":
        return set2.headers["content-type"] = "text/plain", new Response(response, set2);
      case "Array":
      case "Object":
        return set2.headers["content-type"] = "application/json", new Response(JSON.stringify(response), set2);
      case "ElysiaFile":
        return handleFile(response.value);
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
      case "ReadableStream":
        return set2.headers["content-type"]?.startsWith(
          "text/event-stream"
        ) || (set2.headers["content-type"] = "text/event-stream; charset=utf-8"), request?.signal?.addEventListener(
          "abort",
          {
            handleEvent() {
              request?.signal && !request?.signal?.aborted && response.cancel();
            }
          },
          {
            once: !0
          }
        ), new Response(response, set2);
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
        if (typeof response?.next == "function")
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
  return response instanceof Response && !response.headers.has("content-length") && response.headers.get("transfer-encoding") === "chunked" ? handleStream(
    streamResponse(response),
    responseToSetHeaders(response, set2),
    request
  ) : (
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
          return handleFile(response.value);
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
        case "ReadableStream":
          return set2.headers["content-type"]?.startsWith(
            "text/event-stream"
          ) || (set2.headers["content-type"] = "text/event-stream; charset=utf-8"), request?.signal?.addEventListener(
            "abort",
            {
              handleEvent() {
                request?.signal && !request?.signal?.aborted && response.cancel();
              }
            },
            {
              once: !0
            }
          ), new Response(response, set2);
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
          if (typeof response?.next == "function")
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
          return handleFile(response.value);
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
        case "ReadableStream":
          return request?.signal?.addEventListener(
            "abort",
            {
              handleEvent() {
                request?.signal && !request?.signal?.aborted && response.cancel();
              }
            },
            {
              once: !0
            }
          ), new Response(response, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8"
            }
          });
        case void 0:
          return response ? new Response(JSON.stringify(response), {
            headers: {
              "content-type": "application/json"
            }
          }) : new Response("");
        case "Response":
          return !response.headers.has("content-length") && response.headers.get("transfer-encoding") === "chunked" ? handleStream(
            streamResponse(response),
            responseToSetHeaders(response),
            request
          ) : response;
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
          if (typeof response?.next == "function")
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
      return handleFile(response.value);
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
    case "ReadableStream":
      return request?.signal?.addEventListener(
        "abort",
        {
          handleEvent() {
            request?.signal && !request?.signal?.aborted && response.cancel();
          }
        },
        {
          once: !0
        }
      ), new Response(response, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8"
        }
      });
    case void 0:
      return response ? new Response(JSON.stringify(response), {
        headers: {
          "content-type": "application/json"
        }
      }) : new Response("");
    case "Response":
      return response.headers.get("transfer-encoding") === "chunked" ? handleStream(
        streamResponse(response),
        responseToSetHeaders(response),
        request
      ) : response;
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
      if (typeof response?.next == "function")
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
}, errorToResponse = (error2, set2) => new Response(
  JSON.stringify({
    name: error2?.name,
    message: error2?.message,
    cause: error2?.cause
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
    return response.clone.bind(response);
}, handleResponse = createResponseHandler({
  mapResponse,
  mapCompactResponse
}), handleStream = createStreamHandler({
  mapResponse,
  mapCompactResponse
});

// src/adapter/web-standard/index.ts
var WebStandardAdapter = {
  name: "web-standard",
  isWebStandard: !0,
  handler: {
    mapResponse,
    mapEarlyResponse,
    mapCompactResponse,
    createStaticHandler
  },
  composeHandler: {
    mapResponseContext: "c.request",
    preferWebstandardHeaders: !0,
    // @ts-ignore Bun specific
    headers: `c.headers={}
for(const [k,v] of c.request.headers.entries())c.headers[k]=v
`,
    parser: {
      json(isOptional2) {
        return isOptional2 ? `try{c.body=await c.request.json()}catch{}
` : `c.body=await c.request.json()
`;
      },
      text() {
        return `c.body=await c.request.text()
`;
      },
      urlencoded() {
        return `c.body=parseQuery(await c.request.text())
`;
      },
      arrayBuffer() {
        return `c.body=await c.request.arrayBuffer()
`;
      },
      formData(isOptional2) {
        let fnLiteral = `
c.body={}
`;
        return isOptional2 ? fnLiteral += "let form;try{form=await c.request.formData()}catch{}" : fnLiteral += `const form=await c.request.formData()
`, fnLiteral + `for(const key of form.keys()){if(c.body[key]) continue
const value=form.getAll(key)
if(value.length===1)c.body[key]=value[0]
else c.body[key]=value}`;
      }
    }
  },
  composeGeneralHandler: {
    parameters: "r",
    createContext(app) {
      let decoratorsLiteral = "", fnLiteral = "", defaultHeaders = app.setHeaders;
      for (let key of Object.keys(app.decorator))
        decoratorsLiteral += `,'${key}':decorator['${key}']`;
      let standardHostname = app.config.handler?.standardHostname ?? !0, hasTrace = !!app.event.trace?.length;
      return fnLiteral += `const u=r.url,s=u.indexOf('/',${standardHostname ? 11 : 7}),qi=u.indexOf('?',s+1)
let p
if(qi===-1)p=u.substring(s)
else p=u.substring(s, qi)
`, hasTrace && (fnLiteral += `const id=randomId()
`), fnLiteral += "const c={request:r,store,qi,path:p,url:u,redirect,error:status,status,set:{headers:", fnLiteral += Object.keys(defaultHeaders ?? {}).length ? "Object.assign({},app.setHeaders)" : "Object.create(null)", fnLiteral += ",status:200}", app.inference.server && (fnLiteral += ",get server(){return app.getServer()}"), hasTrace && (fnLiteral += ",[ELYSIA_REQUEST_ID]:id"), fnLiteral += decoratorsLiteral, fnLiteral += `}
`, fnLiteral;
    },
    error404(hasEventHook, hasErrorHook) {
      let findDynamicRoute = "if(route===null)return ";
      return hasErrorHook ? findDynamicRoute += `app.handleError(c,notFound,false,${this.parameters})` : findDynamicRoute += hasEventHook ? "new Response(error404Message,{status:c.set.status===200?404:c.set.status,headers:c.set.headers})" : "error404.clone()", {
        declare: hasErrorHook ? "" : `const error404Message=notFound.message.toString()
const error404=new Response(error404Message,{status:404})
`,
        code: findDynamicRoute
      };
    }
  },
  composeError: {
    mapResponseContext: "",
    validationError: "return new Response(error.message,{headers:Object.assign({'content-type':'application/json'},set.headers),status:set.status})",
    unknownError: "return new Response(error.message,{headers:set.headers,status:error.status??set.status??500})"
  },
  listen() {
    return () => {
      throw new Error(
        "WebStandard does not support listen, you might want to export default Elysia.fetch instead"
      );
    };
  }
};

// src/compose.ts
import { Value as Value4 } from "@sinclair/typebox/value";
import {
  Kind as Kind4,
  OptionalKind as OptionalKind2,
  TypeBoxError
} from "@sinclair/typebox";
import decode3 from "fast-decode-uri-component";

// src/parse-query.ts
import decode2 from "fast-decode-uri-component";
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
    if (flags & KEY_PLUS_FLAG && (keySlice = keySlice.replace(/\+/g, " ")), flags & KEY_DECODE_FLAG && (keySlice = decode2(keySlice) || keySlice), result[keySlice] !== void 0) return;
    let finalValue = "";
    hasBothKeyValuePair && (finalValue = input.slice(equalityIndex + 1, endIndex), flags & VALUE_PLUS_FLAG && (finalValue = finalValue.replace(/\+/g, " ")), flags & VALUE_DECODE_FLAG && (finalValue = decode2(finalValue) || finalValue)), result[keySlice] = finalValue;
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
    flags & KEY_HAS_PLUS && (finalKey = finalKey.replace(/\+/g, " ")), flags & KEY_NEEDS_DECODE && (finalKey = decode2(finalKey) || finalKey);
    let finalValue = "";
    if (hasBothKeyValuePair) {
      let valueSlice = input2.slice(equalityIndex + 1, endIndex);
      flags & VALUE_HAS_PLUS && (valueSlice = valueSlice.replace(/\+/g, " ")), flags & VALUE_NEEDS_DECODE && (valueSlice = decode2(valueSlice) || valueSlice), finalValue = valueSlice;
    }
    let currentValue = result[finalKey];
    currentValue === void 0 ? result[finalKey] = finalValue : Array.isArray(currentValue) ? currentValue.push(finalValue) : result[finalKey] = [currentValue, finalValue];
  }
}

// src/trace.ts
var ELYSIA_TRACE = Symbol("ElysiaTrace"), createProcess = () => {
  let { promise, resolve } = Promise.withResolvers(), { promise: end, resolve: resolveEnd } = Promise.withResolvers(), { promise: error2, resolve: resolveError } = Promise.withResolvers(), callbacks = [], callbacksEnd = [];
  return [
    (callback) => (callback && callbacks.push(callback), promise),
    (process2) => {
      let processes = [], resolvers = [], groupError = null;
      for (let i = 0; i < (process2.total ?? 0); i++) {
        let { promise: promise2, resolve: resolve2 } = Promise.withResolvers(), { promise: end2, resolve: resolveEnd2 } = Promise.withResolvers(), { promise: error3, resolve: resolveError2 } = Promise.withResolvers(), callbacks2 = [], callbacksEnd2 = [];
        processes.push((callback) => (callback && callbacks2.push(callback), promise2)), resolvers.push((process3) => {
          let result2 = {
            ...process3,
            end: end2,
            error: error3,
            index: i,
            onStop(callback) {
              return callback && callbacksEnd2.push(callback), end2;
            }
          };
          resolve2(result2);
          for (let i2 = 0; i2 < callbacks2.length; i2++)
            callbacks2[i2](result2);
          return (error4 = null) => {
            let end3 = performance.now();
            error4 && (groupError = error4);
            let detail = {
              end: end3,
              error: error4,
              get elapsed() {
                return end3 - process3.begin;
              }
            };
            for (let i2 = 0; i2 < callbacksEnd2.length; i2++)
              callbacksEnd2[i2](detail);
            resolveEnd2(end3), resolveError2(error4);
          };
        });
      }
      let result = {
        ...process2,
        end,
        error: error2,
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
        resolve(error3 = null) {
          let end2 = performance.now();
          !error3 && groupError && (error3 = groupError);
          let detail = {
            end: end2,
            error: error3,
            get elapsed() {
              return end2 - process2.begin;
            }
          };
          for (let i = 0; i < callbacksEnd.length; i++)
            callbacksEnd[i](detail);
          resolveEnd(end2), resolveError(error3);
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
  return Object.keys(maybeSchemaOrRecord).forEach((status2) => {
    if (isNaN(+status2)) return;
    let maybeNameOrSchema = maybeSchemaOrRecord[+status2];
    if (typeof maybeNameOrSchema == "string") {
      if (maybeNameOrSchema in models) {
        let schema = models[maybeNameOrSchema];
        record[+status2] = Kind3 in schema ? getSchemaValidator(schema, {
          modules,
          models,
          additionalProperties,
          dynamic,
          normalize,
          coerce: !1,
          additionalCoerce: [],
          validators: validators.map((x) => x[+status2]),
          sanitize
        }) : schema;
      }
      return;
    }
    record[+status2] = Kind3 in maybeNameOrSchema ? getSchemaValidator(maybeNameOrSchema, {
      modules,
      models,
      additionalProperties,
      dynamic,
      normalize,
      coerce: !1,
      additionalCoerce: [],
      validators: validators.map((x) => x[+status2]),
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
          value && OptionalKind2 in value && value.type === "array" && value.items && (value = value.items);
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
  let isAsyncHandler = typeof handler == "function" && isAsync(handler), saveResponse = hasTrace || hooks.afterResponse?.length ? "c.response= " : "", maybeAsync = hasCookie || hasBody || isAsyncHandler || !!hooks.parse?.length || !!hooks.afterHandle?.some(isAsync) || !!hooks.beforeHandle?.some(isAsync) || !!hooks.transform?.some(isAsync) || !!hooks.mapResponse?.some(isAsync), maybeStream = (typeof handler == "function" ? isGenerator(handler) : !1) || !!hooks.beforeHandle?.some(isGenerator) || !!hooks.afterHandle?.some(isGenerator) || !!hooks.transform?.some(isGenerator), responseKeys = Object.keys(validator.response ?? {}), hasMultipleResponses = responseKeys.length > 1, hasSingle200 = responseKeys.length === 0 || responseKeys.length === 1 && responseKeys[0] === "200", hasSet = inference.cookie || inference.set || hasHeaders || hasTrace || hasMultipleResponses || !hasSingle200 || isHandleFn && hasDefaultHeaders || maybeStream, mapResponse3 = (r = "r") => `return ${hasSet ? "mapResponse" : "mapCompactResponse"}(${saveResponse}${r}${hasSet ? ",c.set" : ""}${mapResponseContext})
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
      schema && schema.anyOf && schema[Kind4] === "Union" && schema.anyOf?.length === 2 && schema.anyOf?.find((x) => x[Kind4] === "ElysiaForm") && (parser = "formdata");
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
          Value4.Default(
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
          Value4.Default(
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
          Value4.Default(
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
        let value = Value4.Default(
          validator.body.schema,
          validator.body.schema.type === "object" || validator.body.schema[Kind4] === "Import" && validator.body.schema.$defs[validator.body.schema.$ref][Kind4] === "Object" ? {} : void 0
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
                !v.extension || v[Kind4] !== "File" && v[Kind4] !== "Files" || (validatorLength && (validateFile2 += ","), validateFile2 += `validateFileExtension(c.body.${k},${JSON.stringify(v.extension)},'body.${k}')`, validatorLength++);
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
          !v.extension || v[Kind4] !== "File" && v[Kind4] !== "Files" || (i && (validateFile2 += ","), validateFile2 += `validateFileExtension(c.body.${k},${JSON.stringify(v.extension)},'body.${k}')`, i++);
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
          Value4.Default(cookieValidator.schema, {})
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
            let mapResponse4 = hooks.mapResponse[i2], endUnit2 = mapResponseReporter.resolveChild(
              mapResponse4.fn.name
            );
            fnLiteral += `if(mr===undefined){mr=${isAsyncName(mapResponse4) ? "await " : ""}e.mapResponse[${i2}](c)
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
        let mapResponse4 = hooks.mapResponse[i], endUnit = mapResponseReporter.resolveChild(
          mapResponse4.fn.name
        );
        fnLiteral += `mr=${isAsyncName(mapResponse4) ? "await " : ""}e.mapResponse[${i}](c)
if(mr!==undefined)r=c.response=mr
`, endUnit();
      }
    mapResponseReporter.resolve(), fnLiteral += mapResponse3();
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
          let mapResponse4 = hooks.mapResponse[i], endUnit = mapResponseReporter.resolveChild(
            mapResponse4.fn.name
          );
          fnLiteral += `
if(mr===undefined){mr=${isAsyncName(mapResponse4) ? "await " : ""}e.mapResponse[${i}](c)
if(mr!==undefined)r=c.response=mr}
`, endUnit();
        }
      }
      mapResponseReporter.resolve(), fnLiteral += encodeCookie(), handler instanceof Response ? (fnLiteral += inference.set ? `if(isNotEmpty(c.set.headers)||c.set.status!==200||c.set.redirect||c.set.cookie)return mapResponse(${saveResponse}${handle}.clone(),c.set${mapResponseContext})else return ${handle}.clone()` : `return ${handle}.clone()`, fnLiteral += `
`) : fnLiteral += mapResponse3();
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
          let mapResponse4 = hooks.mapResponse[i], endUnit = mapResponseReporter.resolveChild(
            mapResponse4.fn.name
          );
          fnLiteral += `if(mr===undefined){mr=${isAsyncName(mapResponse4) ? "await " : ""}e.mapResponse[${i}](c)
if(mr!==undefined)r=c.response=mr}`, endUnit();
        }
      }
      mapResponseReporter.resolve(), fnLiteral += encodeCookie() + mapResponse3();
    } else {
      handleReporter.resolve();
      let handled = isAsyncHandler ? `await ${handle}` : handle;
      report("afterHandle").resolve(), handler instanceof Response ? fnLiteral += inference.set ? `if(isNotEmpty(c.set.headers)||c.set.status!==200||c.set.redirect||c.set.cookie)return mapResponse(${saveResponse}${handle}.clone(),c.set${mapResponseContext})
else return ${handle}.clone()
` : `return ${handle}.clone()
` : fnLiteral += mapResponse3(handled);
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
          let mapResponse4 = hooks.mapResponse[i2], endUnit2 = mapResponseReporter.resolveChild(
            mapResponse4.fn.name
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
      decodeURIComponent: hasQuery ? decode3 : void 0,
      ElysiaCustomStatusResponse,
      ELYSIA_TRACE: hasTrace ? ELYSIA_TRACE : void 0,
      ELYSIA_REQUEST_ID: hasTrace ? ELYSIA_REQUEST_ID : void 0,
      // @ts-expect-error private property
      getServer: () => app.getServer(),
      fileUnions: fileUnions.length ? fileUnions : void 0,
      TypeBoxError: hasValidation ? TypeBoxError : void 0,
      parser: app["~parser"],
      ...adapter.inject
    });
  } catch (error2) {
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
      error: error2
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
            let mapResponse3 = hooks.mapResponse[i2], endUnit = mapResponseReporter2.resolveChild(
              mapResponse3.fn.name
            );
            fnLiteral += `context.response=_r_r=${isAsyncName(mapResponse3) ? "await " : ""}onMapResponse[${i2}](context)
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
      let mapResponse3 = hooks.mapResponse[i], endUnit = mapResponseReporter.resolveChild(
        mapResponse3.fn.name
      );
      fnLiteral += `if(mr===undefined){mr=${isAsyncName(mapResponse3) ? "await " : ""}onMapResponse[${i}](context)
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

// src/adapter/bun/handler.ts
var mapResponse2 = (response, set2, request) => {
  if (isNotEmpty(set2.headers) || set2.status !== 200 || set2.cookie)
    switch (handleSet(set2), response?.constructor?.name) {
      case "String":
        return new Response(response, set2);
      case "Array":
      case "Object":
        return set2.headers["content-type"] = "application/json", new Response(JSON.stringify(response), set2);
      case "ElysiaFile":
        return handleFile(response.value);
      case "File":
        return handleFile(response, set2);
      case "Blob":
        return handleFile(response, set2);
      case "ElysiaCustomStatusResponse":
        return set2.status = response.code, mapResponse2(
          response.response,
          set2,
          request
        );
      case "ReadableStream":
        return set2.headers["content-type"]?.startsWith(
          "text/event-stream"
        ) || (set2.headers["content-type"] = "text/event-stream; charset=utf-8"), request?.signal?.addEventListener(
          "abort",
          {
            handleEvent() {
              request?.signal && !request?.signal?.aborted && response.cancel();
            }
          },
          {
            once: !0
          }
        ), new Response(response, set2);
      case void 0:
        return response ? new Response(JSON.stringify(response), set2) : new Response("", set2);
      case "Response":
        return handleResponse2(response, set2, request);
      case "Error":
        return errorToResponse2(response, set2);
      case "Promise":
        return response.then(
          (x) => mapResponse2(x, set2, request)
        );
      case "Function":
        return mapResponse2(response(), set2, request);
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
          return handleResponse2(response, set2, request);
        if (response instanceof Promise)
          return response.then((x) => mapResponse2(x, set2));
        if (response instanceof Error)
          return errorToResponse2(response, set2);
        if (response instanceof ElysiaCustomStatusResponse)
          return set2.status = response.code, mapResponse2(
            response.response,
            set2,
            request
          );
        if (typeof response?.next == "function")
          return handleStream2(response, set2, request);
        if (typeof response?.then == "function")
          return response.then((x) => mapResponse2(x, set2));
        if (typeof response?.toResponse == "function")
          return mapResponse2(response.toResponse(), set2);
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
  return response instanceof Response && !response.headers.has("content-length") && response.headers.get("transfer-encoding") === "chunked" ? handleStream2(
    streamResponse(response),
    responseToSetHeaders(response, set2),
    request
  ) : (
    // @ts-expect-error
    typeof response?.next == "function" || response instanceof ReadableStream ? handleStream2(response, set2, request) : mapCompactResponse2(response, request)
  );
}, mapEarlyResponse2 = (response, set2, request) => {
  if (response != null)
    if (isNotEmpty(set2.headers) || set2.status !== 200 || set2.cookie)
      switch (handleSet(set2), response?.constructor?.name) {
        case "String":
          return new Response(response, set2);
        case "Array":
        case "Object":
          return set2.headers["content-type"] = "application/json", new Response(JSON.stringify(response), set2);
        case "ElysiaFile":
          return handleFile(response.value);
        case "File":
          return handleFile(response, set2);
        case "Blob":
          return handleFile(response, set2);
        case "ElysiaCustomStatusResponse":
          return set2.status = response.code, mapEarlyResponse2(
            response.response,
            set2,
            request
          );
        case "ReadableStream":
          return set2.headers["content-type"]?.startsWith(
            "text/event-stream"
          ) || (set2.headers["content-type"] = "text/event-stream; charset=utf-8"), request?.signal?.addEventListener(
            "abort",
            {
              handleEvent() {
                request?.signal && !request?.signal?.aborted && response.cancel();
              }
            },
            {
              once: !0
            }
          ), new Response(response, set2);
        case void 0:
          return response ? new Response(JSON.stringify(response), set2) : void 0;
        case "Response":
          return handleResponse2(response, set2, request);
        case "Promise":
          return response.then(
            (x) => mapEarlyResponse2(x, set2)
          );
        case "Error":
          return errorToResponse2(response, set2);
        case "Function":
          return mapEarlyResponse2(response(), set2);
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
            return handleResponse2(response, set2, request);
          if (response instanceof Promise)
            return response.then((x) => mapEarlyResponse2(x, set2));
          if (response instanceof Error)
            return errorToResponse2(response, set2);
          if (response instanceof ElysiaCustomStatusResponse)
            return set2.status = response.code, mapEarlyResponse2(
              response.response,
              set2,
              request
            );
          if (typeof response?.next == "function")
            return handleStream2(response, set2, request);
          if (typeof response?.then == "function")
            return response.then((x) => mapEarlyResponse2(x, set2));
          if (typeof response?.toResponse == "function")
            return mapEarlyResponse2(response.toResponse(), set2);
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
          return new Response(response);
        case "Array":
        case "Object":
          return set2.headers["content-type"] = "application/json", new Response(JSON.stringify(response), set2);
        case "ElysiaFile":
          return handleFile(response.value);
        case "File":
          return handleFile(response, set2);
        case "Blob":
          return handleFile(response, set2);
        case "ElysiaCustomStatusResponse":
          return set2.status = response.code, mapEarlyResponse2(
            response.response,
            set2,
            request
          );
        case "ReadableStream":
          return request?.signal?.addEventListener(
            "abort",
            {
              handleEvent() {
                request?.signal && !request?.signal?.aborted && response.cancel();
              }
            },
            {
              once: !0
            }
          ), new Response(response, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8"
            }
          });
        case void 0:
          return response ? new Response(JSON.stringify(response), {
            headers: {
              "content-type": "application/json"
            }
          }) : new Response("");
        case "Response":
          return !response.headers.has("content-length") && response.headers.get("transfer-encoding") === "chunked" ? handleStream2(
            streamResponse(response),
            responseToSetHeaders(response),
            request
          ) : response;
        case "Promise":
          return response.then((x) => {
            let r = mapEarlyResponse2(x, set2);
            if (r !== void 0) return r;
          });
        case "Error":
          return errorToResponse2(response, set2);
        case "Function":
          return mapCompactResponse2(response(), request);
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
            return response.then((x) => mapEarlyResponse2(x, set2));
          if (response instanceof Error)
            return errorToResponse2(response, set2);
          if (response instanceof ElysiaCustomStatusResponse)
            return set2.status = response.code, mapEarlyResponse2(
              response.response,
              set2,
              request
            );
          if (typeof response?.next == "function")
            return handleStream2(response, set2, request);
          if (typeof response?.then == "function")
            return response.then((x) => mapEarlyResponse2(x, set2));
          if (typeof response?.toResponse == "function")
            return mapEarlyResponse2(response.toResponse(), set2);
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
}, mapCompactResponse2 = (response, request) => {
  switch (response?.constructor?.name) {
    case "String":
      return new Response(response);
    case "Object":
    case "Array":
      return new Response(JSON.stringify(response), {
        headers: {
          "Content-Type": "application/json"
        }
      });
    case "ElysiaFile":
      return handleFile(response.value);
    case "File":
      return handleFile(response);
    case "Blob":
      return handleFile(response);
    case "ElysiaCustomStatusResponse":
      return mapResponse2(
        response.response,
        {
          status: response.code,
          headers: {}
        }
      );
    case "ReadableStream":
      return request?.signal?.addEventListener(
        "abort",
        {
          handleEvent() {
            request?.signal && !request?.signal?.aborted && response.cancel();
          }
        },
        {
          once: !0
        }
      ), new Response(response, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8"
        }
      });
    case void 0:
      return response ? new Response(JSON.stringify(response), {
        headers: {
          "content-type": "application/json"
        }
      }) : new Response("");
    case "Response":
      return response.headers.get("transfer-encoding") === "chunked" ? handleStream2(
        streamResponse(response),
        responseToSetHeaders(response),
        request
      ) : response;
    case "Error":
      return errorToResponse2(response);
    case "Promise":
      return response.then(
        (x) => mapCompactResponse2(x, request)
      );
    // ? Maybe response or Blob
    case "Function":
      return mapCompactResponse2(response(), request);
    case "Number":
    case "Boolean":
      return new Response(response.toString());
    case "FormData":
      return new Response(response);
    default:
      if (response instanceof Response) return response;
      if (response instanceof Promise)
        return response.then(
          (x) => mapCompactResponse2(x, request)
        );
      if (response instanceof Error)
        return errorToResponse2(response);
      if (response instanceof ElysiaCustomStatusResponse)
        return mapResponse2(
          response.response,
          {
            status: response.code,
            headers: {}
          }
        );
      if (typeof response?.next == "function")
        return handleStream2(response, void 0, request);
      if (typeof response?.then == "function")
        return response.then((x) => mapResponse2(x, set));
      if (typeof response?.toResponse == "function")
        return mapCompactResponse2(response.toResponse());
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
}, errorToResponse2 = (error2, set2) => new Response(
  JSON.stringify({
    name: error2?.name,
    message: error2?.message,
    cause: error2?.cause
  }),
  {
    status: set2?.status !== 200 ? set2?.status ?? 500 : 500,
    headers: set2?.headers
  }
), createStaticHandler2 = (handle, hooks, setHeaders = {}) => {
  if (typeof handle == "function") return;
  let response = mapResponse2(handle, {
    headers: setHeaders
  });
  if (!hooks.parse?.length && !hooks.transform?.length && !hooks.beforeHandle?.length && !hooks.afterHandle?.length)
    return response.clone.bind(response);
}, handleResponse2 = createResponseHandler({
  mapResponse: mapResponse2,
  mapCompactResponse: mapCompactResponse2
}), handleStream2 = createStreamHandler({
  mapResponse: mapResponse2,
  mapCompactResponse: mapCompactResponse2
});

// src/adapter/bun/compose.ts
var allocateIf2 = (value, condition) => condition ? value : "", createContext = (app, route, inference, isInline = !1) => {
  let fnLiteral = "", defaultHeaders = app.setHeaders, hasTrace = !!app.event.trace?.length;
  hasTrace && (fnLiteral += `const id=randomId()
`);
  let isDynamic = /[:*]/.test(route.path), getQi = `const u=request.url,s=u.indexOf('/',${app.config.handler?.standardHostname ?? !0 ? 11 : 7}),qi=u.indexOf('?', s + 1)
`;
  inference.query && (fnLiteral += getQi);
  let getPath = inference.path ? isDynamic ? "get path(){" + (inference.query ? "" : getQi) + `if(qi===-1)return u.substring(s)
return u.substring(s,qi)
},` : `path:'${route.path}',` : "";
  fnLiteral += allocateIf2("const c=", !isInline) + "{request,store," + allocateIf2("qi,", inference.query) + allocateIf2("params:request.params,", isDynamic) + getPath + allocateIf2(
    "url:request.url,",
    hasTrace || inference.url || inference.query
  ) + "redirect,error:status,status,set:{headers:" + (isNotEmpty(defaultHeaders) ? "Object.assign({},app.setHeaders)" : "Object.create(null)") + ",status:200}", inference.server && (fnLiteral += ",get server(){return app.getServer()}"), hasTrace && (fnLiteral += ",[ELYSIA_REQUEST_ID]:id");
  {
    let decoratorsLiteral = "";
    for (let key of Object.keys(app.singleton.decorator))
      decoratorsLiteral += `,'${key}':decorator['${key}']`;
    fnLiteral += decoratorsLiteral;
  }
  return fnLiteral += `}
`, fnLiteral;
}, createBunRouteHandler = (app, route) => {
  let hasTrace = !!app.event.trace?.length, hasHoc = !!app.extender.higherOrderFunctions.length, inference = sucrose(
    route.hooks,
    // @ts-expect-error
    app.inference
  );
  inference = sucrose(
    {
      handler: route.handler
    },
    inference
  );
  let fnLiteral = "const handler=data.handler,app=data.app,store=data.store,decorator=data.decorator,redirect=data.redirect,route=data.route,mapEarlyResponse=data.mapEarlyResponse," + allocateIf2("randomId=data.randomId,", hasTrace) + allocateIf2("ELYSIA_REQUEST_ID=data.ELYSIA_REQUEST_ID,", hasTrace) + allocateIf2("ELYSIA_TRACE=data.ELYSIA_TRACE,", hasTrace) + allocateIf2("trace=data.trace,", hasTrace) + allocateIf2("hoc=data.hoc,", hasHoc) + `status=data.status
`;
  return app.event.request?.length && (fnLiteral += `const onRequest=app.event.request.map(x=>x.fn)
`), fnLiteral += `${app.event.request?.find(isAsync) ? "async" : ""} function map(request){`, hasTrace || inference.query || app.event.request?.length ? (fnLiteral += createContext(app, route, inference), fnLiteral += createOnRequestHandler(app), fnLiteral += "return handler(c)}") : fnLiteral += `return handler(${createContext(app, route, inference, !0)})}`, fnLiteral += createHoc(app), Function(
    "data",
    fnLiteral
  )({
    app,
    handler: route.compile?.() ?? route.composed,
    redirect,
    status,
    // @ts-expect-error private property
    hoc: app.extender.higherOrderFunctions.map((x) => x.fn),
    store: app.store,
    decorator: app.decorator,
    route: route.path,
    randomId: hasTrace ? randomId : void 0,
    ELYSIA_TRACE: hasTrace ? ELYSIA_TRACE : void 0,
    ELYSIA_REQUEST_ID: hasTrace ? ELYSIA_REQUEST_ID : void 0,
    trace: hasTrace ? app.event.trace?.map((x) => x?.fn ?? x) : void 0,
    mapEarlyResponse: mapEarlyResponse2
  });
};

// src/adapter/bun/handler-native.ts
var createNativeStaticHandler = (handle, hooks, setHeaders = {}) => {
  if (typeof handle == "function" || handle instanceof Blob) return;
  if (typeof handle == "object" && handle?.toString() === "[object HTMLBundle]")
    return () => handle;
  let response = mapResponse2(handle, {
    headers: setHeaders
  });
  if (!hooks.parse?.length && !hooks.transform?.length && !hooks.beforeHandle?.length && !hooks.afterHandle?.length)
    return response instanceof Promise ? response.then((response2) => {
      if (response2)
        return response2.headers.has("content-type") || response2.headers.append("content-type", "text/plain"), response2.clone();
    }) : (response.headers.has("content-type") || response.headers.append("content-type", "text/plain"), response.clone.bind(response));
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
}, createWSMessageParser = (parse2) => {
  let parsers = typeof parse2 == "function" ? [parse2] : parse2;
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

// src/adapter/bun/index.ts
var optionalParam = /:.+?\?(?=\/|$)/, getPossibleParams = (path) => {
  let match = optionalParam.exec(path);
  if (!match) return [path];
  let routes = [], head = path.slice(0, match.index), param = match[0].slice(0, -1), tail = path.slice(match.index + match[0].length);
  routes.push(head.slice(0, -1)), routes.push(head + param);
  for (let fragment of getPossibleParams(tail))
    fragment && (fragment.startsWith("/:") || routes.push(head.slice(0, -1) + fragment), routes.push(head + param + fragment));
  return routes;
}, supportedMethods = {
  GET: !0,
  HEAD: !0,
  OPTIONS: !0,
  DELETE: !0,
  PATCH: !0,
  POST: !0,
  PUT: !0
}, mapRoutes = (app) => {
  if (!app.config.aot || !app.config.systemRouter) return;
  let routes = {}, add = (route, handler) => {
    routes[route.path] ? routes[route.path][route.method] || (routes[route.path][route.method] = handler) : routes[route.path] = {
      [route.method]: handler
    };
  }, tree = app.routeTree;
  for (let route of app.router.history) {
    if (typeof route.handler != "function") continue;
    let method = route.method;
    if (method === "GET" && `WS_${route.path}` in tree || method === "WS" || route.path.charCodeAt(route.path.length - 1) === 42 || !(method in supportedMethods))
      continue;
    if (method === "ALL") {
      `WS_${route.path}` in tree || (routes[route.path] = route.hooks?.config?.mount ? route.hooks.trace || app.event.trace || // @ts-expect-error private property
      app.extender.higherOrderFunctions ? createBunRouteHandler(app, route) : route.hooks.mount || route.handler : route.handler);
      continue;
    }
    let compiled, handler = app.config.precompile ? createBunRouteHandler(app, route) : (request) => compiled ? compiled(request) : (compiled = createBunRouteHandler(app, route))(
      request
    );
    for (let path of getPossibleParams(route.path))
      add(
        {
          method,
          path
        },
        handler
      );
  }
  return routes;
}, mergeRoutes = (r1, r2) => {
  if (!r2) return r1;
  for (let key of Object.keys(r2))
    if (r1[key] !== r2[key]) {
      if (!r1[key]) {
        r1[key] = r2[key];
        continue;
      }
      if (r1[key] && r2[key]) {
        if (typeof r1[key] == "function" || r1[key] instanceof Response) {
          r1[key] = r2[key];
          continue;
        }
        r1[key] = {
          ...r1[key],
          ...r2[key]
        };
      }
    }
  return r1;
}, BunAdapter = {
  ...WebStandardAdapter,
  name: "bun",
  handler: {
    mapResponse: mapResponse2,
    mapEarlyResponse: mapEarlyResponse2,
    mapCompactResponse: mapCompactResponse2,
    createStaticHandler: createStaticHandler2,
    createNativeStaticHandler
  },
  composeHandler: {
    ...WebStandardAdapter.composeHandler,
    headers: hasHeaderShorthand ? `c.headers=c.request.headers.toJSON()
` : `c.headers={}
for(const [k,v] of c.request.headers.entries())c.headers[k]=v
`
  },
  listen(app) {
    return (options, callback) => {
      if (typeof Bun > "u")
        throw new Error(
          ".listen() is designed to run on Bun only. If you are running Elysia in other environment please use a dedicated plugin or export the handler via Elysia.fetch"
        );
      if (app.compile(), typeof options == "string") {
        if (!isNumericString(options))
          throw new Error("Port must be a numeric value");
        options = parseInt(options);
      }
      let createStaticRoute = (iterator, { withAsync = !1 } = {}) => {
        let staticRoutes = {}, ops = [];
        for (let [path, route] of Object.entries(iterator))
          if (supportPerMethodInlineHandler) {
            if (!route) continue;
            for (let [method, value] of Object.entries(route))
              if (!(!value || !(method in supportedMethods))) {
                if (value instanceof Promise) {
                  withAsync && (staticRoutes[path] || (staticRoutes[path] = {}), ops.push(
                    value.then((awaited) => {
                      awaited instanceof Response && (staticRoutes[path][method] = awaited);
                    })
                  ));
                  continue;
                }
                value instanceof Response && (staticRoutes[path] || (staticRoutes[path] = {}), staticRoutes[path][method] = value);
              }
          } else {
            if (!route) continue;
            if (route instanceof Promise) {
              withAsync && (staticRoutes[path] || (staticRoutes[path] = {}), ops.push(
                route.then((awaited) => {
                  awaited instanceof Response && (staticRoutes[path] = awaited);
                })
              ));
              continue;
            }
            if (!(route instanceof Response)) continue;
            staticRoutes[path] = route;
          }
        return withAsync ? Promise.all(ops).then(() => staticRoutes) : staticRoutes;
      }, serve = typeof options == "object" ? {
        development: !isProduction,
        reusePort: !0,
        ...app.config.serve || {},
        ...options || {},
        // @ts-ignore
        routes: mergeRoutes(
          mergeRoutes(
            createStaticRoute(app.router.response),
            mapRoutes(app)
          ),
          // @ts-expect-error private property
          app.config.serve?.routes
        ),
        websocket: {
          ...app.config.websocket || {},
          ...websocket || {}
        },
        fetch: app.fetch
        // error: outerErrorHandler
      } : {
        development: !isProduction,
        reusePort: !0,
        ...app.config.serve || {},
        // @ts-ignore
        routes: mergeRoutes(
          mergeRoutes(
            createStaticRoute(app.router.response),
            mapRoutes(app)
          ),
          // @ts-expect-error private property
          app.config.serve?.routes
        ),
        websocket: {
          ...app.config.websocket || {},
          ...websocket || {}
        },
        port: options,
        fetch: app.fetch
        // error: outerErrorHandler
      };
      if (app.server = Bun.serve(serve), app.event.start)
        for (let i = 0; i < app.event.start.length; i++)
          app.event.start[i].fn(app);
      callback && callback(app.server), process.on("beforeExit", () => {
        if (app.server && (app.server.stop?.(), app.server = null, app.event.stop))
          for (let i = 0; i < app.event.stop.length; i++)
            app.event.stop[i].fn(app);
      }), app.promisedModules.then(async () => {
        app.server?.reload({
          ...serve,
          fetch: app.fetch,
          // @ts-ignore
          routes: mergeRoutes(
            mergeRoutes(
              await createStaticRoute(app.router.response, {
                withAsync: !0
              }),
              mapRoutes(app)
            ),
            // @ts-expect-error private property
            app.config.serve?.routes
          )
        }), Bun?.gc(!1);
      });
    };
  },
  ws(app, path, options) {
    let { parse: parse2, body, response, ...rest } = options, validateMessage = getSchemaValidator(body, {
      // @ts-expect-error private property
      modules: app.definitions.typebox,
      // @ts-expect-error private property
      models: app.definitions.type,
      normalize: app.config.normalize
    }), validateResponse = getSchemaValidator(response, {
      // @ts-expect-error private property
      modules: app.definitions.typebox,
      // @ts-expect-error private property
      models: app.definitions.type,
      normalize: app.config.normalize
    });
    app.route(
      "WS",
      path,
      async (context) => {
        let server = app.getServer(), { set: set2, path: path2, qi, headers, query, params } = context;
        if (context.validator = validateResponse, options.upgrade)
          if (typeof options.upgrade == "function") {
            let temp = options.upgrade(context);
            temp instanceof Promise && await temp;
          } else options.upgrade && Object.assign(
            set2.headers,
            options.upgrade
          );
        if (set2.cookie && isNotEmpty(set2.cookie)) {
          let cookie = serializeCookie(set2.cookie);
          cookie && (set2.headers["set-cookie"] = cookie);
        }
        set2.headers["set-cookie"] && Array.isArray(set2.headers["set-cookie"]) && (set2.headers = parseSetCookies(
          new Headers(set2.headers),
          set2.headers["set-cookie"]
        ));
        let handleResponse3 = createHandleWSResponse(validateResponse), parseMessage = createWSMessageParser(parse2), _id, errorHandlers = [
          ...Array.isArray(options.error) ? options.error : [options.error],
          ...(app.event.error ?? []).map(
            (x) => typeof x == "function" ? x : x.fn
          )
        ].filter((x) => x), handleErrors = errorHandlers.length ? async (ws, error2) => {
          for (let handleError of errorHandlers) {
            let response2 = handleError(
              Object.assign(context, { error: error2 })
            );
            if (response2 instanceof Promise && (response2 = await response2), await handleResponse3(ws, response2), response2) break;
          }
        } : () => {
        };
        if (!server?.upgrade(context.request, {
          headers: isNotEmpty(set2.headers) ? set2.headers : void 0,
          data: {
            ...context,
            get id() {
              return _id || (_id = randomId());
            },
            validator: validateResponse,
            ping(data) {
              options.ping?.(data);
            },
            pong(data) {
              options.pong?.(data);
            },
            open(ws) {
              try {
                handleResponse3(
                  ws,
                  options.open?.(
                    new ElysiaWS(ws, context)
                  )
                );
              } catch (error2) {
                handleErrors(ws, error2);
              }
            },
            message: async (ws, _message) => {
              let message = await parseMessage(ws, _message);
              if (validateMessage?.Check(message) === !1)
                return void ws.send(
                  new ValidationError(
                    "message",
                    validateMessage,
                    message
                  ).message
                );
              try {
                handleResponse3(
                  ws,
                  options.message?.(
                    new ElysiaWS(
                      ws,
                      context,
                      message
                    ),
                    message
                  )
                );
              } catch (error2) {
                handleErrors(ws, error2);
              }
            },
            drain(ws) {
              try {
                handleResponse3(
                  ws,
                  options.drain?.(
                    new ElysiaWS(ws, context)
                  )
                );
              } catch (error2) {
                handleErrors(ws, error2);
              }
            },
            close(ws, code, reason) {
              try {
                handleResponse3(
                  ws,
                  options.close?.(
                    new ElysiaWS(ws, context),
                    code,
                    reason
                  )
                );
              } catch (error2) {
                handleErrors(ws, error2);
              }
            }
          }
        }))
          return set2.status = 400, "Expected a websocket connection";
      },
      {
        ...rest,
        websocket: options
      }
    );
  }
};

// src/universal/env.ts
var env2 = isBun ? Bun.env : typeof process < "u" && process?.env ? process.env : {};

// src/dynamic-handle.ts
import { TransformDecodeError } from "@sinclair/typebox/value";
var injectDefaultValues = (typeChecker, obj) => {
  for (let [key, keySchema] of Object.entries(
    // @ts-expect-error private
    typeChecker.schema.properties
  ))
    obj[key] ??= keySchema.default;
}, createDynamicHandler = (app) => {
  let { mapResponse: mapResponse3, mapEarlyResponse: mapEarlyResponse3 } = app["~adapter"].handler;
  return async (request) => {
    let url = request.url, s = url.indexOf("/", 11), qi = url.indexOf("?", s + 1), path = qi === -1 ? url.substring(s) : url.substring(s, qi), set2 = {
      cookie: {},
      status: 200,
      headers: {}
    }, context = Object.assign(
      {},
      // @ts-expect-error
      app.singleton.decorator,
      {
        set: set2,
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
          if (response2 instanceof Promise && (response2 = await response2), response2 = mapEarlyResponse3(response2, set2), response2) return context.response = response2;
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
              let form2 = await request.formData();
              for (let key of form2.keys()) {
                if (body[key]) continue;
                let value = form2.getAll(key);
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
                  let form2 = await request.formData();
                  for (let key of form2.keys()) {
                    if (body[key]) continue;
                    let value = form2.getAll(key);
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
              let result = mapEarlyResponse3(
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
            let result = mapEarlyResponse3(response2, context.set);
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
            let result = mapEarlyResponse3(
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
          let status2 = response instanceof ElysiaCustomStatusResponse ? response.code : set2.status ? typeof set2.status == "string" ? StatusMap[set2.status] : set2.status : 200, responseValidator = validator?.createResponse?.()?.[status2];
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
      return mapResponse3(context.response = response, context.set);
    } catch (error2) {
      let reportedError = error2 instanceof TransformDecodeError && error2.error ? error2.error : error2;
      return app.handleError(context, reportedError);
    } finally {
      if (app.event.afterResponse)
        for (let afterResponse of app.event.afterResponse)
          await afterResponse.fn(context);
    }
  };
}, createDynamicErrorHandler = (app) => {
  let { mapResponse: mapResponse3 } = app["~adapter"].handler;
  return async (context, error2) => {
    let errorContext = Object.assign(context, { error: error2, code: error2.code });
    if (errorContext.set = context.set, app.event.error)
      for (let i = 0; i < app.event.error.length; i++) {
        let response = app.event.error[i].fn(errorContext);
        if (response instanceof Promise && (response = await response), response != null)
          return context.response = mapResponse3(
            response,
            context.set
          );
      }
    return new Response(
      typeof error2.cause == "string" ? error2.cause : error2.message,
      {
        headers: context.set.headers,
        status: error2.status ?? 500
      }
    );
  };
};

// src/index.ts
import { TypeSystemPolicy as TypeSystemPolicy2 } from "@sinclair/typebox/system";
var Elysia = class _Elysia {
  constructor(config = {}) {
    this.server = null;
    this.dependencies = {};
    this["~Prefix"] = "";
    this["~Singleton"] = null;
    this["~Definitions"] = null;
    this["~Metadata"] = null;
    this["~Ephemeral"] = null;
    this["~Volatile"] = null;
    this["~Routes"] = null;
    this.singleton = {
      decorator: {},
      store: {},
      derive: {},
      resolve: {}
    };
    this.definitions = {
      typebox: t.Module({}),
      type: {},
      error: {}
    };
    this.extender = {
      macros: [],
      higherOrderFunctions: []
    };
    this.validator = {
      global: null,
      scoped: null,
      local: null,
      getCandidate() {
        return mergeSchemaValidator(
          mergeSchemaValidator(this.global, this.scoped),
          this.local
        );
      }
    };
    this.standaloneValidator = {
      global: null,
      scoped: null,
      local: null
    };
    this.event = {};
    this.router = {
      "~http": void 0,
      get http() {
        return this["~http"] || (this["~http"] = new Memoirist({ lazy: !0 })), this["~http"];
      },
      "~dynamic": void 0,
      // Use in non-AOT mode
      get dynamic() {
        return this["~dynamic"] || (this["~dynamic"] = new Memoirist()), this["~dynamic"];
      },
      // Static Router
      static: {},
      // Native Static Response
      response: {},
      history: []
    };
    this.routeTree = {};
    this.inference = {
      body: !1,
      cookie: !1,
      headers: !1,
      query: !1,
      set: !1,
      server: !1,
      path: !1,
      route: !1,
      url: !1
    };
    this["~parser"] = {};
    this.handle = async (request) => this.fetch(request);
    /**
     * Use handle can be either sync or async to save performance.
     *
     * Beside benchmark purpose, please use 'handle' instead.
     */
    this.fetch = (request) => (this.fetch = this.config.aot ? composeGeneralHandler(this) : createDynamicHandler(this))(request);
    this.handleError = async (context, error2) => (this.handleError = this.config.aot ? composeErrorHandler(this) : createDynamicErrorHandler(this))(context, error2);
    /**
     * ### listen
     * Assign current instance to port and start serving
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .get("/", () => 'hi')
     *     .listen(3000)
     * ```
     */
    this.listen = (options, callback) => (this["~adapter"].listen(this)(options, callback), this.promisedModules.size && clearSucroseCache(5e3), this.promisedModules.then(() => {
      clearSucroseCache(1e3);
    }), this);
    /**
     * ### stop
     * Stop server from serving
     *
     * ---
     * @example
     * ```typescript
     * const app = new Elysia()
     *     .get("/", () => 'hi')
     *     .listen(3000)
     *
     * // Sometime later
     * app.stop()
     * ```
     *
     * @example
     * ```typescript
     * const app = new Elysia()
     *     .get("/", () => 'hi')
     *     .listen(3000)
     *
     * app.stop(true) // Abruptly any requests inflight
     * ```
     */
    this.stop = async (closeActiveConnections) => {
      if (!this.server)
        throw new Error(
          "Elysia isn't running. Call `app.listen` to start the server."
        );
      if (this.server && (this.server.stop(closeActiveConnections), this.server = null, this.event.stop?.length))
        for (let i = 0; i < this.event.stop.length; i++)
          this.event.stop[i].fn(this);
    };
    config.tags && (config.detail ? config.detail.tags = config.tags : config.detail = {
      tags: config.tags
    }), this.config = {
      prefix: "",
      aot: env2.ELYSIA_AOT !== "false",
      nativeStaticResponse: !0,
      systemRouter: !0,
      encodeSchema: !0,
      normalize: !0,
      ...config,
      cookie: {
        path: "/",
        ...config?.cookie
      },
      experimental: config?.experimental ?? {},
      seed: config?.seed === void 0 ? "" : config?.seed
    }, this["~adapter"] = config.adapter ?? (typeof Bun < "u" ? BunAdapter : WebStandardAdapter), config?.analytic && (config?.name || config?.seed !== void 0) && (this.telemetry = {
      stack: new Error().stack
    });
  }
  get store() {
    return this.singleton.store;
  }
  get decorator() {
    return this.singleton.decorator;
  }
  get routes() {
    return this.router.history;
  }
  getGlobalRoutes() {
    return this.router.history;
  }
  getGlobalDefinitions() {
    return this.definitions;
  }
  getServer() {
    return this.server;
  }
  getParent() {
    return null;
  }
  get promisedModules() {
    return this._promisedModules || (this._promisedModules = new PromiseGroup(console.error, () => {
    })), this._promisedModules;
  }
  env(model, _env = env2) {
    if (getSchemaValidator(model, {
      modules: this.definitions.typebox,
      dynamic: !0,
      additionalProperties: !0,
      coerce: !0,
      sanitize: () => this.config.sanitize
    }).Check(_env) === !1) {
      let error2 = new ValidationError("env", model, _env);
      throw new Error(error2.all.map((x) => x.summary).join(`
`));
    }
    return this;
  }
  /**
   * @private DO_NOT_USE_OR_YOU_WILL_BE_FIRED
   * @version 1.1.0
   *
   * ! Do not use unless you know exactly what you are doing
   * ? Add Higher order function to Elysia.fetch
   */
  wrap(fn) {
    return this.extender.higherOrderFunctions.push({
      checksum: checksum(
        JSON.stringify({
          name: this.config.name,
          seed: this.config.seed,
          content: fn.toString()
        })
      ),
      fn
    }), this;
  }
  applyMacro(localHook) {
    if (this.extender.macros.length) {
      let manage = createMacroManager({
        globalHook: this.event,
        localHook
      }), manager = {
        events: {
          global: this.event,
          local: localHook
        },
        get onParse() {
          return manage("parse");
        },
        get onTransform() {
          return manage("transform");
        },
        get onBeforeHandle() {
          return manage("beforeHandle");
        },
        get onAfterHandle() {
          return manage("afterHandle");
        },
        get mapResponse() {
          return manage("mapResponse");
        },
        get onAfterResponse() {
          return manage("afterResponse");
        },
        get onError() {
          return manage("error");
        }
      };
      for (let macro of this.extender.macros)
        traceBackMacro(macro.fn(manager), localHook, manage);
    }
  }
  get models() {
    let models = {};
    for (let name of Object.keys(this.definitions.type))
      models[name] = getSchemaValidator(
        this.definitions.typebox.Import(name)
      );
    return models.modules = this.definitions.typebox, models;
  }
  add(method, path, handle, localHook, options, standaloneValidators) {
    let skipPrefix = options?.skipPrefix ?? !1, allowMeta = options?.allowMeta ?? !1;
    if (localHook ??= {}, standaloneValidators === void 0 && (standaloneValidators = [], this.standaloneValidator.local && (standaloneValidators = standaloneValidators.concat(
      this.standaloneValidator.local
    )), this.standaloneValidator.scoped && (standaloneValidators = standaloneValidators.concat(
      this.standaloneValidator.scoped
    )), this.standaloneValidator.global && (standaloneValidators = standaloneValidators.concat(
      this.standaloneValidator.global
    ))), path !== "" && path.charCodeAt(0) !== 47 && (path = "/" + path), this.config.prefix && !skipPrefix && (path = this.config.prefix + path), localHook?.type)
      switch (localHook.type) {
        case "text":
          localHook.type = "text/plain";
          break;
        case "json":
          localHook.type = "application/json";
          break;
        case "formdata":
          localHook.type = "multipart/form-data";
          break;
        case "urlencoded":
          localHook.type = "application/x-www-form-urlencoded";
          break;
        case "arrayBuffer":
          localHook.type = "application/octet-stream";
          break;
        default:
          break;
      }
    let instanceValidator = this.validator.getCandidate(), cloned = {
      body: localHook?.body ?? instanceValidator?.body,
      headers: localHook?.headers ?? instanceValidator?.headers,
      params: localHook?.params ?? instanceValidator?.params,
      query: localHook?.query ?? instanceValidator?.query,
      cookie: localHook?.cookie ?? instanceValidator?.cookie,
      response: localHook?.response ?? instanceValidator?.response
    }, shouldPrecompile = this.config.precompile === !0 || typeof this.config.precompile == "object" && this.config.precompile.compose === !0, createValidator = () => {
      let models = this.definitions.type, dynamic = !this.config.aot, normalize = this.config.normalize, modules = this.definitions.typebox, sanitize = () => this.config.sanitize, cookieValidator = () => {
        if (cloned.cookie || standaloneValidators.find((x) => x.cookie))
          return getCookieValidator({
            modules,
            validator: cloned.cookie,
            defaultConfig: this.config.cookie,
            config: cloned.cookie?.config ?? {},
            dynamic,
            models,
            validators: standaloneValidators.map((x) => x.cookie),
            sanitize
          });
      };
      return shouldPrecompile ? {
        body: getSchemaValidator(cloned.body, {
          modules,
          dynamic,
          models,
          normalize,
          additionalCoerce: coercePrimitiveRoot(),
          validators: standaloneValidators.map((x) => x.body),
          sanitize
        }),
        headers: getSchemaValidator(cloned.headers, {
          modules,
          dynamic,
          models,
          additionalProperties: !0,
          coerce: !0,
          additionalCoerce: stringToStructureCoercions(),
          validators: standaloneValidators.map(
            (x) => x.headers
          ),
          sanitize
        }),
        params: getSchemaValidator(cloned.params, {
          modules,
          dynamic,
          models,
          coerce: !0,
          additionalCoerce: stringToStructureCoercions(),
          validators: standaloneValidators.map(
            (x) => x.params
          ),
          sanitize
        }),
        query: getSchemaValidator(cloned.query, {
          modules,
          dynamic,
          models,
          normalize,
          coerce: !0,
          additionalCoerce: stringToStructureCoercions(),
          validators: standaloneValidators.map(
            (x) => x.query
          ),
          sanitize
        }),
        cookie: cookieValidator(),
        response: getResponseSchemaValidator(cloned.response, {
          modules,
          dynamic,
          models,
          normalize,
          validators: standaloneValidators.map(
            (x) => x.response
          ),
          sanitize
        })
      } : {
        createBody() {
          return this.body ? this.body : this.body = getSchemaValidator(
            cloned.body,
            {
              modules,
              dynamic,
              models,
              normalize,
              additionalCoerce: coercePrimitiveRoot(),
              validators: standaloneValidators.map(
                (x) => x.body
              ),
              sanitize
            }
          );
        },
        createHeaders() {
          return this.headers ? this.headers : this.headers = getSchemaValidator(
            cloned.headers,
            {
              modules,
              dynamic,
              models,
              additionalProperties: !normalize,
              coerce: !0,
              additionalCoerce: stringToStructureCoercions(),
              validators: standaloneValidators.map(
                (x) => x.headers
              ),
              sanitize
            }
          );
        },
        createParams() {
          return this.params ? this.params : this.params = getSchemaValidator(
            cloned.params,
            {
              modules,
              dynamic,
              models,
              coerce: !0,
              additionalCoerce: stringToStructureCoercions(),
              validators: standaloneValidators.map(
                (x) => x.params
              ),
              sanitize
            }
          );
        },
        createQuery() {
          return this.query ? this.query : this.query = getSchemaValidator(
            cloned.query,
            {
              modules,
              dynamic,
              models,
              coerce: !0,
              additionalCoerce: stringToStructureCoercions(),
              validators: standaloneValidators.map(
                (x) => x.query
              ),
              sanitize
            }
          );
        },
        createCookie() {
          return this.cookie ? this.cookie : this.cookie = cookieValidator();
        },
        createResponse() {
          return this.response ? this.response : this.response = getResponseSchemaValidator(
            cloned.response,
            {
              modules,
              dynamic,
              models,
              normalize,
              validators: standaloneValidators.map(
                (x) => x.response
              ),
              sanitize
            }
          );
        }
      };
    };
    (instanceValidator.body || instanceValidator.cookie || instanceValidator.headers || instanceValidator.params || instanceValidator.query || instanceValidator.response) && (localHook = mergeHook(localHook, instanceValidator)), localHook.tags && (localHook.detail ? localHook.detail.tags = localHook.tags : localHook.detail = {
      tags: localHook.tags
    }), isNotEmpty(this.config.detail) && (localHook.detail = mergeDeep(
      Object.assign({}, this.config.detail),
      localHook.detail
    )), this.applyMacro(localHook);
    let hooks = isNotEmpty(this.event) ? mergeHook(this.event, localHookToLifeCycleStore(localHook)) : lifeCycleToArray(localHookToLifeCycleStore(localHook));
    if (this.config.aot === !1) {
      let validator = createValidator();
      this.router.dynamic.add(method, path, {
        validator,
        hooks,
        content: localHook?.type,
        handle,
        route: path
      });
      let encoded = encodePath(path, { dynamic: !0 });
      if (path !== encoded && this.router.dynamic.add(method, encoded, {
        validator,
        hooks,
        content: localHook?.type,
        handle,
        route: path
      }), this.config.strictPath === !1) {
        let loosePath = getLoosePath(path);
        this.router.dynamic.add(method, loosePath, {
          validator,
          hooks,
          content: localHook?.type,
          handle,
          route: path
        });
        let encoded2 = encodePath(loosePath);
        loosePath !== encoded2 && this.router.dynamic.add(method, loosePath, {
          validator,
          hooks,
          content: localHook?.type,
          handle,
          route: path
        });
      }
      this.router.history.push({
        method,
        path,
        composed: null,
        handler: handle,
        compile: void 0,
        hooks,
        standaloneValidators
      });
      return;
    }
    let adapter = this["~adapter"].handler, nativeStaticHandler = typeof handle != "function" ? () => {
      let fn = adapter.createNativeStaticHandler?.(
        handle,
        hooks,
        this.setHeaders
      );
      return fn instanceof Promise ? fn.then((fn2) => {
        if (fn2) return fn2;
      }) : fn?.();
    } : void 0, useNativeStaticResponse = this.config.nativeStaticResponse === !0, addResponsePath = (path2) => {
      !useNativeStaticResponse || !nativeStaticHandler || (supportPerMethodInlineHandler ? this.router.response[path2] ? this.router.response[path2][method] = nativeStaticHandler() : this.router.response[path2] = {
        [method]: nativeStaticHandler()
      } : this.router.response[path2] = nativeStaticHandler());
    };
    addResponsePath(path);
    let _compiled, compile2 = () => _compiled || (_compiled = composeHandler({
      app: this,
      path,
      method,
      hooks,
      validator: createValidator(),
      handler: typeof handle != "function" && typeof adapter.createStaticHandler != "function" ? () => handle : handle,
      allowMeta,
      inference: this.inference
    })), oldIndex;
    if (`${method}_${path}` in this.routeTree)
      for (let i = 0; i < this.router.history.length; i++) {
        let route = this.router.history[i];
        if (route.path === path && route.method === method) {
          oldIndex = i;
          break;
        }
      }
    else this.routeTree[`${method}_${path}`] = this.router.history.length;
    let index = oldIndex ?? this.router.history.length, mainHandler = shouldPrecompile ? compile2() : (ctx) => (this.router.history[index].composed = compile2())(ctx);
    oldIndex !== void 0 ? this.router.history[oldIndex] = Object.assign(
      {
        method,
        path,
        composed: mainHandler,
        compile: compile2,
        handler: handle,
        hooks
      },
      standaloneValidators.length ? {
        standaloneValidators
      } : void 0,
      localHook.webSocket ? { websocket: localHook.websocket } : void 0
    ) : this.router.history.push(
      Object.assign(
        {
          method,
          path,
          composed: mainHandler,
          compile: compile2,
          handler: handle,
          hooks
        },
        standaloneValidators.length ? {
          standaloneValidators
        } : void 0,
        localHook.webSocket ? { websocket: localHook.websocket } : void 0
      )
    );
    let handler = {
      handler: shouldPrecompile ? mainHandler : void 0,
      compile() {
        return this.handler = compile2();
      }
    }, staticRouter = this.router.static, isStaticPath = path.indexOf(":") === -1 && path.indexOf("*") === -1;
    if (method === "WS") {
      if (isStaticPath) {
        path in staticRouter ? staticRouter[path][method] = index : staticRouter[path] = {
          [method]: index
        };
        return;
      }
      this.router.http.add("WS", path, handler), this.config.strictPath || this.router.http.add("WS", getLoosePath(path), handler);
      let encoded = encodePath(path, { dynamic: !0 });
      path !== encoded && this.router.http.add("WS", encoded, handler);
      return;
    }
    if (isStaticPath)
      path in staticRouter ? staticRouter[path][method] = index : staticRouter[path] = {
        [method]: index
      }, this.config.strictPath || addResponsePath(getLoosePath(path));
    else {
      this.router.http.add(method, path, handler);
      let staticHandler = typeof handle != "function" && typeof adapter.createStaticHandler == "function" ? adapter.createStaticHandler(
        handle,
        hooks,
        this.setHeaders
      ) : void 0;
      if (!this.config.strictPath) {
        let loosePath = getLoosePath(path);
        addResponsePath(loosePath), this.router.http.add(method, loosePath, handler);
      }
      let encoded = encodePath(path, { dynamic: !0 });
      path !== encoded && (this.router.http.add(method, encoded, handler), addResponsePath(encoded));
    }
  }
  headers(header) {
    return header ? (this.setHeaders || (this.setHeaders = {}), this.setHeaders = mergeDeep(this.setHeaders, header), this) : this;
  }
  /**
   * ### start | Life cycle event
   * Called after server is ready for serving
   *
   * ---
   * @example
   * ```typescript
   * new Elysia()
   *     .onStart(({ server }) => {
   *         console.log("Running at ${server?.url}:${server?.port}")
   *     })
   *     .listen(3000)
   * ```
   */
  onStart(handler) {
    return this.on("start", handler), this;
  }
  /**
   * ### request | Life cycle event
   * Called on every new request is accepted
   *
   * ---
   * @example
   * ```typescript
   * new Elysia()
   *     .onRequest(({ method, url }) => {
   *         saveToAnalytic({ method, url })
   *     })
   * ```
   */
  onRequest(handler) {
    return this.on("request", handler), this;
  }
  onParse(options, handler) {
    return handler ? this.on(
      options,
      "parse",
      handler
    ) : typeof options == "string" ? this.on("parse", this["~parser"][options]) : this.on("parse", options);
  }
  /**
   * ### parse | Life cycle event
   * Callback function to handle body parsing
   *
   * If truthy value is returned, will be assigned to `context.body`
   * Otherwise will skip the callback and look for the next one.
   *
   * Equivalent to Express's body parser
   *
   * ---
   * @example
   * ```typescript
   * new Elysia()
   *     .onParse((request, contentType) => {
   *         if(contentType === "application/json")
   *             return request.json()
   *     })
   * ```
   */
  parser(name, parser) {
    return this["~parser"][name] = parser, this;
  }
  onTransform(options, handler) {
    return handler ? this.on(
      options,
      "transform",
      handler
    ) : this.on("transform", options);
  }
  resolve(optionsOrResolve, resolve) {
    resolve || (resolve = optionsOrResolve, optionsOrResolve = { as: "local" });
    let hook = {
      subType: "resolve",
      fn: resolve
    };
    return this.onBeforeHandle(optionsOrResolve, hook);
  }
  mapResolve(optionsOrResolve, mapper) {
    mapper || (mapper = optionsOrResolve, optionsOrResolve = { as: "local" });
    let hook = {
      subType: "mapResolve",
      fn: mapper
    };
    return this.onBeforeHandle(optionsOrResolve, hook);
  }
  onBeforeHandle(options, handler) {
    return handler ? this.on(
      options,
      "beforeHandle",
      handler
    ) : this.on("beforeHandle", options);
  }
  onAfterHandle(options, handler) {
    return handler ? this.on(
      options,
      "afterHandle",
      handler
    ) : this.on("afterHandle", options);
  }
  mapResponse(options, handler) {
    return handler ? this.on(
      options,
      "mapResponse",
      handler
    ) : this.on("mapResponse", options);
  }
  onAfterResponse(options, handler) {
    return handler ? this.on(
      options,
      "afterResponse",
      handler
    ) : this.on("afterResponse", options);
  }
  /**
   * ### After Handle | Life cycle event
   * Intercept request **after** main handler is called.
   *
   * If truthy value is returned, will be assigned as `Response`
   *
   * ---
   * @example
   * ```typescript
   * new Elysia()
   *     .onAfterHandle((context, response) => {
   *         if(typeof response === "object")
   *             return JSON.stringify(response)
   *     })
   * ```
   */
  trace(options, handler) {
    handler || (handler = options, options = { as: "local" }), Array.isArray(handler) || (handler = [handler]);
    for (let fn of handler)
      this.on(
        options,
        "trace",
        createTracer(fn)
      );
    return this;
  }
  error(name, error2) {
    switch (typeof name) {
      case "string":
        return error2.prototype[ERROR_CODE] = name, this.definitions.error[name] = error2, this;
      case "function":
        return this.definitions.error = name(this.definitions.error), this;
    }
    for (let [code, error3] of Object.entries(name))
      error3.prototype[ERROR_CODE] = code, this.definitions.error[code] = error3;
    return this;
  }
  /**
   * ### Error | Life cycle event
   * Called when error is thrown during processing request
   *
   * ---
   * @example
   * ```typescript
   * new Elysia()
   *     .onError(({ code }) => {
   *         if(code === "NOT_FOUND")
   *             return "Path not found :("
   *     })
   * ```
   */
  onError(options, handler) {
    return handler ? this.on(
      options,
      "error",
      handler
    ) : this.on("error", options);
  }
  /**
   * ### stop | Life cycle event
   * Called after server stop serving request
   *
   * ---
   * @example
   * ```typescript
   * new Elysia()
   *     .onStop((app) => {
   *         cleanup()
   *     })
   * ```
   */
  onStop(handler) {
    return this.on("stop", handler), this;
  }
  on(optionsOrType, typeOrHandlers, handlers) {
    let type;
    switch (typeof optionsOrType) {
      case "string":
        type = optionsOrType, handlers = typeOrHandlers;
        break;
      case "object":
        type = typeOrHandlers, !Array.isArray(typeOrHandlers) && typeof typeOrHandlers == "object" && (handlers = typeOrHandlers);
        break;
    }
    Array.isArray(handlers) ? handlers = fnToContainer(handlers) : typeof handlers == "function" ? handlers = [
      {
        fn: handlers
      }
    ] : handlers = [handlers];
    let handles = handlers;
    for (let handle of handles)
      handle.scope = typeof optionsOrType == "string" ? "local" : optionsOrType?.as ?? "local", (type === "resolve" || type === "derive") && (handle.subType = type);
    type !== "trace" && (this.inference = sucrose(
      {
        [type]: handles.map((x) => x.fn)
      },
      this.inference
    ));
    for (let handle of handles) {
      let fn = asHookType(handle, "global", { skipIfHasType: !0 });
      switch (type) {
        case "start":
          this.event.start ??= [], this.event.start.push(fn);
          break;
        case "request":
          this.event.request ??= [], this.event.request.push(fn);
          break;
        case "parse":
          this.event.parse ??= [], this.event.parse.push(fn);
          break;
        case "transform":
          this.event.transform ??= [], this.event.transform.push(fn);
          break;
        // @ts-expect-error
        case "derive":
          this.event.transform ??= [], this.event.transform.push(
            fnToContainer(fn, "derive")
          );
          break;
        case "beforeHandle":
          this.event.beforeHandle ??= [], this.event.beforeHandle.push(fn);
          break;
        // @ts-expect-error
        // eslint-disable-next-line sonarjs/no-duplicated-branches
        case "resolve":
          this.event.beforeHandle ??= [], this.event.beforeHandle.push(
            fnToContainer(fn, "resolve")
          );
          break;
        case "afterHandle":
          this.event.afterHandle ??= [], this.event.afterHandle.push(fn);
          break;
        case "mapResponse":
          this.event.mapResponse ??= [], this.event.mapResponse.push(fn);
          break;
        case "afterResponse":
          this.event.afterResponse ??= [], this.event.afterResponse.push(fn);
          break;
        case "trace":
          this.event.trace ??= [], this.event.trace.push(fn);
          break;
        case "error":
          this.event.error ??= [], this.event.error.push(fn);
          break;
        case "stop":
          this.event.stop ??= [], this.event.stop.push(fn);
          break;
      }
    }
    return this;
  }
  as(type) {
    return promoteEvent(this.event.parse, type), promoteEvent(this.event.transform, type), promoteEvent(this.event.beforeHandle, type), promoteEvent(this.event.afterHandle, type), promoteEvent(this.event.mapResponse, type), promoteEvent(this.event.afterResponse, type), promoteEvent(this.event.trace, type), promoteEvent(this.event.error, type), type === "scoped" ? (this.validator.scoped = mergeSchemaValidator(
      this.validator.scoped,
      this.validator.local
    ), this.validator.local = null) : type === "global" && (this.validator.global = mergeSchemaValidator(
      this.validator.global,
      mergeSchemaValidator(
        this.validator.scoped,
        this.validator.local
      )
    ), this.validator.scoped = null, this.validator.local = null), this;
  }
  /**
   * ### group
   * Encapsulate and group path with prefix
   *
   * ---
   * @example
   * ```typescript
   * new Elysia()
   *     .group('/v1', app => app
   *         .get('/', () => 'Hi')
   *         .get('/name', () => 'Elysia')
   *     })
   * ```
   */
  group(prefix, schemaOrRun, run) {
    let instance = new _Elysia({
      ...this.config,
      prefix: ""
    });
    instance.singleton = { ...this.singleton }, instance.definitions = { ...this.definitions }, instance.getServer = () => this.getServer(), instance.inference = cloneInference(this.inference), instance.extender = { ...this.extender }, instance["~parser"] = this["~parser"], instance.standaloneValidator = {
      local: [...this.standaloneValidator.local ?? []],
      scoped: [...this.standaloneValidator.scoped ?? []],
      global: [...this.standaloneValidator.global ?? []]
    };
    let isSchema = typeof schemaOrRun == "object", sandbox = (isSchema ? run : schemaOrRun)(instance);
    return this.singleton = mergeDeep(this.singleton, instance.singleton), this.definitions = mergeDeep(this.definitions, instance.definitions), sandbox.event.request?.length && (this.event.request = [
      ...this.event.request || [],
      ...sandbox.event.request || []
    ]), sandbox.event.mapResponse?.length && (this.event.mapResponse = [
      ...this.event.mapResponse || [],
      ...sandbox.event.mapResponse || []
    ]), this.model(sandbox.definitions.type), Object.values(instance.router.history).forEach(
      ({ method, path, handler, hooks, standaloneValidators }) => {
        if (path = (isSchema ? "" : this.config.prefix) + prefix + path, isSchema) {
          let hook = schemaOrRun, localHook = hooks;
          this.add(
            method,
            path,
            handler,
            mergeHook(hook, {
              ...localHook || {},
              error: localHook.error ? Array.isArray(localHook.error) ? [
                ...localHook.error || {},
                ...sandbox.event.error || {}
              ] : [
                localHook.error,
                ...sandbox.event.error || {}
              ] : sandbox.event.error
            }),
            void 0,
            standaloneValidators
          );
        } else
          this.add(
            method,
            path,
            handler,
            mergeHook(hooks, {
              error: sandbox.event.error
            }),
            {
              skipPrefix: !0
            },
            standaloneValidators
          );
      }
    ), this;
  }
  /**
   * ### guard
   * Encapsulate and pass hook into all child handler
   *
   * ---
   * @example
   * ```typescript
   * import { t } from 'elysia'
   *
   * new Elysia()
   *     .guard({
   *          schema: {
   *              body: t.Object({
   *                  username: t.String(),
   *                  password: t.String()
   *              })
   *          }
   *     }, app => app
   *         .get("/", () => 'Hi')
   *         .get("/name", () => 'Elysia')
   *     })
   * ```
   */
  guard(hook, run) {
    if (!run) {
      if (typeof hook == "object") {
        this.applyMacro(hook), hook.detail && (this.config.detail ? this.config.detail = mergeDeep(
          Object.assign({}, this.config.detail),
          hook.detail
        ) : this.config.detail = hook.detail), hook.tags && (this.config.detail ? this.config.detail.tags = hook.tags : this.config.detail = {
          tags: hook.tags
        });
        let type = hook.as ?? "local";
        if (hook.schema === "standalone") {
          this.standaloneValidator[type] || (this.standaloneValidator[type] = []);
          let response = hook?.response || typeof hook?.response == "string" || hook?.response && Kind5 in hook.response ? {
            200: hook.response
          } : hook?.response;
          return this.standaloneValidator[type].push({
            body: hook.body,
            headers: hook.headers,
            params: hook.params,
            query: hook.query,
            response,
            cookie: hook.cookie
          }), this;
        }
        return this.validator[type] = {
          body: hook.body ?? this.validator[type]?.body,
          headers: hook.headers ?? this.validator[type]?.headers,
          params: hook.params ?? this.validator[type]?.params,
          query: hook.query ?? this.validator[type]?.query,
          response: hook.response ?? this.validator[type]?.response,
          cookie: hook.cookie ?? this.validator[type]?.cookie
        }, hook.parse && this.on({ as: type }, "parse", hook.parse), hook.transform && this.on({ as: type }, "transform", hook.transform), hook.derive && this.on({ as: type }, "derive", hook.derive), hook.beforeHandle && this.on({ as: type }, "beforeHandle", hook.beforeHandle), hook.resolve && this.on({ as: type }, "resolve", hook.resolve), hook.afterHandle && this.on({ as: type }, "afterHandle", hook.afterHandle), hook.mapResponse && this.on({ as: type }, "mapResponse", hook.mapResponse), hook.afterResponse && this.on({ as: type }, "afterResponse", hook.afterResponse), hook.error && this.on({ as: type }, "error", hook.error), this;
      }
      return this.guard({}, hook);
    }
    let instance = new _Elysia({
      ...this.config,
      prefix: ""
    });
    instance.singleton = { ...this.singleton }, instance.definitions = { ...this.definitions }, instance.inference = cloneInference(this.inference), instance.extender = { ...this.extender };
    let sandbox = run(instance);
    return this.singleton = mergeDeep(this.singleton, instance.singleton), this.definitions = mergeDeep(this.definitions, instance.definitions), sandbox.getServer = () => this.server, sandbox.event.request?.length && (this.event.request = [
      ...this.event.request || [],
      ...sandbox.event.request || []
    ]), sandbox.event.mapResponse?.length && (this.event.mapResponse = [
      ...this.event.mapResponse || [],
      ...sandbox.event.mapResponse || []
    ]), this.model(sandbox.definitions.type), Object.values(instance.router.history).forEach(
      ({ method, path, handler, hooks: localHook }) => {
        this.add(
          method,
          path,
          handler,
          mergeHook(hook, {
            ...localHook || {},
            error: localHook.error ? Array.isArray(localHook.error) ? [
              ...localHook.error || {},
              ...sandbox.event.error || []
            ] : [
              localHook.error,
              ...sandbox.event.error || []
            ] : sandbox.event.error
          })
        );
      }
    ), this;
  }
  /**
   * ### use
   * Merge separate logic of Elysia with current
   *
   * ---
   * @example
   * ```typescript
   * const plugin = (app: Elysia) => app
   *     .get('/plugin', () => 'hi')
   *
   * new Elysia()
   *     .use(plugin)
   * ```
   */
  use(plugin, options) {
    if (Array.isArray(plugin)) {
      let app = this;
      for (let p of plugin) app = app.use(p);
      return app;
    }
    if (options?.scoped)
      return this.guard({}, (app) => app.use(plugin));
    if (Array.isArray(plugin)) {
      let current = this;
      for (let p of plugin) current = this.use(p);
      return current;
    }
    return plugin instanceof Promise ? (this.promisedModules.add(
      plugin.then((plugin2) => {
        if (typeof plugin2 == "function") return plugin2(this);
        if (plugin2 instanceof _Elysia)
          return this._use(plugin2).compile();
        if (plugin2.constructor.name === "Elysia")
          return this._use(
            plugin2
          ).compile();
        if (typeof plugin2.default == "function")
          return plugin2.default(this);
        if (plugin2.default instanceof _Elysia)
          return this._use(plugin2.default);
        if (plugin2.constructor.name === "Elysia")
          return this._use(plugin2.default);
        if (plugin2.constructor.name === "_Elysia")
          return this._use(plugin2.default);
        try {
          return this._use(plugin2.default);
        } catch (error2) {
          throw console.error(
            'Invalid plugin type. Expected Elysia instance, function, or module with "default" as Elysia instance or function that returns Elysia instance.'
          ), error2;
        }
      }).then((v) => (v && typeof v.compile == "function" && v.compile(), v))
    ), this) : this._use(plugin);
  }
  propagatePromiseModules(plugin) {
    if (plugin.promisedModules.size <= 0) return this;
    for (let promise of plugin.promisedModules.promises)
      this.promisedModules.add(
        promise.then((v) => {
          if (!v) return;
          let t2 = this._use(v);
          return t2 instanceof Promise ? t2.then((v2) => {
            v2 ? v2.compile() : v.compile();
          }) : v.compile();
        })
      );
    return this;
  }
  _use(plugin) {
    if (typeof plugin == "function") {
      let instance = plugin(this);
      return instance instanceof Promise ? (this.promisedModules.add(
        instance.then((plugin2) => {
          if (plugin2 instanceof _Elysia) {
            plugin2.getServer = () => this.getServer(), plugin2.getGlobalRoutes = () => this.getGlobalRoutes(), plugin2.getGlobalDefinitions = () => this.getGlobalDefinitions(), plugin2.model(this.definitions.type), plugin2.error(this.definitions.error);
            for (let {
              method,
              path,
              handler,
              hooks,
              standaloneValidators
            } of Object.values(plugin2.router.history))
              this.add(
                method,
                path,
                handler,
                isNotEmpty(plugin2.event.error) ? mergeHook(hooks, {
                  error: plugin2.event.error
                }) : hooks,
                void 0,
                standaloneValidators
              );
            return plugin2 === this ? void 0 : (this.propagatePromiseModules(plugin2), plugin2);
          }
          return typeof plugin2 == "function" ? plugin2(
            this
          ) : typeof plugin2.default == "function" ? plugin2.default(
            this
          ) : this._use(plugin2);
        }).then((v) => (v && typeof v.compile == "function" && v.compile(), v))
      ), this) : instance;
    }
    this.propagatePromiseModules(plugin);
    let name = plugin.config.name, seed = plugin.config.seed;
    if (plugin.getParent = () => this, plugin.getServer = () => this.getServer(), plugin.getGlobalRoutes = () => this.getGlobalRoutes(), plugin.getGlobalDefinitions = () => this.getGlobalDefinitions(), plugin.standaloneValidator?.scoped && (this.standaloneValidator.local ? this.standaloneValidator.local = this.standaloneValidator.local.concat(
      plugin.standaloneValidator.scoped
    ) : this.standaloneValidator.local = plugin.standaloneValidator.scoped), plugin.standaloneValidator?.global && (this.standaloneValidator.global ? this.standaloneValidator.global = this.standaloneValidator.global.concat(
      plugin.standaloneValidator.global
    ) : this.standaloneValidator.global = plugin.standaloneValidator.global), isNotEmpty(plugin["~parser"]) && (this["~parser"] = {
      ...plugin["~parser"],
      ...this["~parser"]
    }), plugin.setHeaders && this.headers(plugin.setHeaders), name) {
      name in this.dependencies || (this.dependencies[name] = []);
      let current = seed !== void 0 ? checksum(name + JSON.stringify(seed)) : 0;
      this.dependencies[name].some(
        ({ checksum: checksum2 }) => current === checksum2
      ) || (this.extender.macros = this.extender.macros.concat(
        plugin.extender.macros
      ), this.extender.higherOrderFunctions = this.extender.higherOrderFunctions.concat(
        plugin.extender.higherOrderFunctions
      ));
    } else
      plugin.extender.macros.length && (this.extender.macros = this.extender.macros.concat(
        plugin.extender.macros
      )), plugin.extender.higherOrderFunctions.length && (this.extender.higherOrderFunctions = this.extender.higherOrderFunctions.concat(
        plugin.extender.higherOrderFunctions
      ));
    deduplicateChecksum(this.extender.macros), deduplicateChecksum(this.extender.higherOrderFunctions);
    let hofHashes = [];
    for (let i = 0; i < this.extender.higherOrderFunctions.length; i++) {
      let hof = this.extender.higherOrderFunctions[i];
      hof.checksum && (hofHashes.includes(hof.checksum) && (this.extender.higherOrderFunctions.splice(i, 1), i--), hofHashes.push(hof.checksum));
    }
    hofHashes.length = 0, this.inference = mergeInference(this.inference, plugin.inference), isNotEmpty(plugin.singleton.decorator) && this.decorate(plugin.singleton.decorator), isNotEmpty(plugin.singleton.store) && this.state(plugin.singleton.store), isNotEmpty(plugin.definitions.type) && this.model(plugin.definitions.type), isNotEmpty(plugin.definitions.error) && this.error(plugin.definitions.error), isNotEmpty(plugin.definitions.error) && (plugin.extender.macros = this.extender.macros.concat(
      plugin.extender.macros
    ));
    for (let {
      method,
      path,
      handler,
      hooks,
      standaloneValidators
    } of Object.values(plugin.router.history))
      this.add(
        method,
        path,
        handler,
        isNotEmpty(plugin.event.error) ? mergeHook(hooks, {
          error: plugin.event.error
        }) : hooks,
        void 0,
        standaloneValidators
      );
    if (name) {
      name in this.dependencies || (this.dependencies[name] = []);
      let current = seed !== void 0 ? checksum(name + JSON.stringify(seed)) : 0;
      if (this.dependencies[name].some(
        ({ checksum: checksum2 }) => current === checksum2
      ))
        return this;
      this.dependencies[name].push(
        this.config?.analytic ? {
          name: plugin.config.name,
          seed: plugin.config.seed,
          checksum: current,
          dependencies: plugin.dependencies,
          stack: plugin.telemetry?.stack,
          routes: plugin.router.history,
          decorators: plugin.singleton,
          store: plugin.singleton.store,
          error: plugin.definitions.error,
          derive: plugin.event.transform?.filter((x) => x?.subType === "derive").map((x) => ({
            fn: x.toString(),
            stack: new Error().stack ?? ""
          })),
          resolve: plugin.event.transform?.filter((x) => x?.subType === "resolve").map((x) => ({
            fn: x.toString(),
            stack: new Error().stack ?? ""
          }))
        } : {
          name: plugin.config.name,
          seed: plugin.config.seed,
          checksum: current,
          dependencies: plugin.dependencies
        }
      ), isNotEmpty(plugin.event) && (this.event = mergeLifeCycle(
        this.event,
        filterGlobalHook(plugin.event),
        current
      ));
    } else
      isNotEmpty(plugin.event) && (this.event = mergeLifeCycle(
        this.event,
        filterGlobalHook(plugin.event)
      ));
    return plugin.validator.global && (this.validator.global = mergeHook(this.validator.global, {
      ...plugin.validator.global
    })), plugin.validator.scoped && (this.validator.local = mergeHook(this.validator.local, {
      ...plugin.validator.scoped
    })), this;
  }
  macro(macro) {
    if (typeof macro == "function") {
      let hook = {
        checksum: checksum(
          JSON.stringify({
            name: this.config.name,
            seed: this.config.seed,
            content: macro.toString()
          })
        ),
        fn: macro
      };
      this.extender.macros.push(hook);
    } else if (typeof macro == "object") {
      for (let name of Object.keys(macro))
        if (typeof macro[name] == "object") {
          let actualValue = { ...macro[name] };
          macro[name] = (v) => {
            if (v === !0) return actualValue;
          };
        }
      let hook = {
        checksum: checksum(
          JSON.stringify({
            name: this.config.name,
            seed: this.config.seed,
            content: Object.entries(macro).map(([k, v]) => `${k}+${v}`).join(",")
          })
        ),
        fn: () => macro
      };
      this.extender.macros.push(hook);
    }
    return this;
  }
  mount(path, handleOrConfig, config) {
    if (path instanceof _Elysia || typeof path == "function" || path.length === 0 || path === "/") {
      let run = typeof path == "function" ? path : path instanceof _Elysia ? path.compile().fetch : handleOrConfig instanceof _Elysia ? handleOrConfig.compile().fetch : typeof handleOrConfig == "function" ? handleOrConfig : (() => {
        throw new Error("Invalid handler");
      })(), handler2 = ({ request, path: path2 }) => run(
        new Request(replaceUrlPath(request.url, path2), {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
          credentials: request.credentials,
          referrerPolicy: request.referrerPolicy,
          duplex: request.duplex,
          redirect: request.redirect,
          mode: request.mode,
          keepalive: request.keepalive,
          integrity: request.integrity,
          body: request.body
        })
      );
      return this.route("ALL", "/*", handler2, {
        parse: "none",
        ...config,
        detail: {
          ...config?.detail,
          hide: !0
        },
        config: {
          mount: run
        }
      }), this;
    }
    let handle = handleOrConfig instanceof _Elysia ? handleOrConfig.compile().fetch : typeof handleOrConfig == "function" ? handleOrConfig : (() => {
      throw new Error("Invalid handler");
    })(), length = path.length - (path.endsWith("*") ? 1 : 0), handler = ({ request, path: path2 }) => handle(
      new Request(
        replaceUrlPath(request.url, path2.slice(length) || "/"),
        {
          method: request.method,
          headers: request.headers,
          signal: request.signal,
          credentials: request.credentials,
          referrerPolicy: request.referrerPolicy,
          duplex: request.duplex,
          redirect: request.redirect,
          mode: request.mode,
          keepalive: request.keepalive,
          integrity: request.integrity,
          body: request.body
        }
      )
    );
    return this.route("ALL", path, handler, {
      parse: "none",
      ...config,
      detail: {
        ...config?.detail,
        hide: !0
      },
      config: {
        mount: handle
      }
    }), this.route(
      "ALL",
      path + (path.endsWith("/") ? "*" : "/*"),
      handler,
      {
        parse: "none",
        ...config,
        detail: {
          ...config?.detail,
          hide: !0
        },
        config: {
          mount: handle
        }
      }
    ), this;
  }
  /**
   * ### get
   * Register handler for path with method [GET]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .get('/', () => 'hi')
   *     .get('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  get(path, handler, hook) {
    return this.add("GET", path, handler, hook), this;
  }
  /**
   * ### post
   * Register handler for path with method [POST]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .post('/', () => 'hi')
   *     .post('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  post(path, handler, hook) {
    return this.add("POST", path, handler, hook), this;
  }
  /**
   * ### put
   * Register handler for path with method [PUT]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .put('/', () => 'hi')
   *     .put('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  put(path, handler, hook) {
    return this.add("PUT", path, handler, hook), this;
  }
  /**
   * ### patch
   * Register handler for path with method [PATCH]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .patch('/', () => 'hi')
   *     .patch('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  patch(path, handler, hook) {
    return this.add("PATCH", path, handler, hook), this;
  }
  /**
   * ### delete
   * Register handler for path with method [DELETE]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .delete('/', () => 'hi')
   *     .delete('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  delete(path, handler, hook) {
    return this.add("DELETE", path, handler, hook), this;
  }
  /**
   * ### options
   * Register handler for path with method [POST]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .options('/', () => 'hi')
   *     .options('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  options(path, handler, hook) {
    return this.add("OPTIONS", path, handler, hook), this;
  }
  /**
   * ### all
   * Register handler for path with method [ALL]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .all('/', () => 'hi')
   *     .all('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  all(path, handler, hook) {
    return this.add("ALL", path, handler, hook), this;
  }
  /**
   * ### head
   * Register handler for path with method [HEAD]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .head('/', () => 'hi')
   *     .head('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  head(path, handler, hook) {
    return this.add("HEAD", path, handler, hook), this;
  }
  /**
   * ### connect
   * Register handler for path with method [CONNECT]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .connect('/', () => 'hi')
   *     .connect('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  connect(path, handler, hook) {
    return this.add("CONNECT", path, handler, hook), this;
  }
  /**
   * ### route
   * Register handler for path with method [ROUTE]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .route('/', () => 'hi')
   *     .route('/with-hook', () => 'hi', {
   *         response: t.String()
   *     })
   * ```
   */
  route(method, path, handler, hook) {
    return this.add(method.toUpperCase(), path, handler, hook, hook?.config), this;
  }
  /**
   * ### ws
   * Register handler for path with method [ws]
   *
   * ---
   * @example
   * ```typescript
   * import { Elysia, t } from 'elysia'
   *
   * new Elysia()
   *     .ws('/', {
   *         message(ws, message) {
   *             ws.send(message)
   *         }
   *     })
   * ```
   */
  ws(path, options) {
    return this["~adapter"].ws ? this["~adapter"].ws(this, path, options) : console.warn("Current adapter doesn't support WebSocket"), this;
  }
  /**
   * ### state
   * Assign global mutatable state accessible for all handler
   *
   * ---
   * @example
   * ```typescript
   * new Elysia()
   *     .state('counter', 0)
   *     .get('/', (({ counter }) => ++counter)
   * ```
   */
  state(options, name, value) {
    name === void 0 ? (value = options, options = { as: "append" }, name = "") : value === void 0 && (typeof options == "string" ? (value = name, name = options, options = { as: "append" }) : typeof options == "object" && (value = name, name = ""));
    let { as } = options;
    if (typeof name != "string") return this;
    switch (typeof value) {
      case "object":
        return !value || !isNotEmpty(value) ? this : name ? (name in this.singleton.store ? this.singleton.store[name] = mergeDeep(
          this.singleton.store[name],
          value,
          {
            override: as === "override"
          }
        ) : this.singleton.store[name] = value, this) : value === null ? this : (this.singleton.store = mergeDeep(this.singleton.store, value, {
          override: as === "override"
        }), this);
      case "function":
        return name ? (as === "override" || !(name in this.singleton.store)) && (this.singleton.store[name] = value) : this.singleton.store = value(this.singleton.store), this;
      default:
        return (as === "override" || !(name in this.singleton.store)) && (this.singleton.store[name] = value), this;
    }
  }
  /**
   * ### decorate
   * Define custom method to `Context` accessible for all handler
   *
   * ---
   * @example
   * ```typescript
   * new Elysia()
   *     .decorate('getDate', () => Date.now())
   *     .get('/', (({ getDate }) => getDate())
   * ```
   */
  decorate(options, name, value) {
    name === void 0 ? (value = options, options = { as: "append" }, name = "") : value === void 0 && (typeof options == "string" ? (value = name, name = options, options = { as: "append" }) : typeof options == "object" && (value = name, name = ""));
    let { as } = options;
    if (typeof name != "string") return this;
    switch (typeof value) {
      case "object":
        return name ? (name in this.singleton.decorator ? this.singleton.decorator[name] = mergeDeep(
          this.singleton.decorator[name],
          value,
          {
            override: as === "override"
          }
        ) : this.singleton.decorator[name] = value, this) : value === null ? this : (this.singleton.decorator = mergeDeep(
          this.singleton.decorator,
          value,
          {
            override: as === "override"
          }
        ), this);
      case "function":
        return name ? (as === "override" || !(name in this.singleton.decorator)) && (this.singleton.decorator[name] = value) : this.singleton.decorator = value(this.singleton.decorator), this;
      default:
        return (as === "override" || !(name in this.singleton.decorator)) && (this.singleton.decorator[name] = value), this;
    }
  }
  derive(optionsOrTransform, transform) {
    transform || (transform = optionsOrTransform, optionsOrTransform = { as: "local" });
    let hook = {
      subType: "derive",
      fn: transform
    };
    return this.onTransform(optionsOrTransform, hook);
  }
  model(name, model) {
    switch (typeof name) {
      case "object":
        let parsedSchemas = {}, kvs = Object.entries(name);
        if (!kvs.length) return this;
        for (let [key, value] of kvs)
          key in this.definitions.type || (parsedSchemas[key] = this.definitions.type[key] = value, parsedSchemas[key].$id ??= `#/components/schemas/${key}`);
        return this.definitions.typebox = t.Module({
          ...this.definitions.typebox.$defs,
          ...parsedSchemas
        }), this;
      case "function":
        let result = name(this.definitions.type);
        return this.definitions.type = result, this.definitions.typebox = t.Module(result), this;
      case "string":
        if (!model) break;
        let newModel = {
          ...model,
          id: model.$id ?? `#/components/schemas/${name}`
        };
        return this.definitions.type[name] = model, this.definitions.typebox = t.Module({
          ...this.definitions.typebox.$defs,
          ...newModel
        }), this;
    }
    return this.definitions.type[name] = model, this.definitions.typebox = t.Module({
      ...this.definitions.typebox.$defs,
      [name]: model
    }), this;
  }
  Ref(key) {
    return t.Ref(key);
  }
  mapDerive(optionsOrDerive, mapper) {
    mapper || (mapper = optionsOrDerive, optionsOrDerive = { as: "local" });
    let hook = {
      subType: "mapDerive",
      fn: mapper
    };
    return this.onTransform(optionsOrDerive, hook);
  }
  affix(base, type, word) {
    if (word === "") return this;
    let delimieter = ["_", "-", " "], capitalize = (word2) => word2[0].toUpperCase() + word2.slice(1), joinKey = base === "prefix" ? (prefix, word2) => delimieter.includes(prefix.at(-1) ?? "") ? prefix + word2 : prefix + capitalize(word2) : delimieter.includes(word.at(-1) ?? "") ? (suffix, word2) => word2 + suffix : (suffix, word2) => word2 + capitalize(suffix), remap = (type2) => {
      let store = {};
      switch (type2) {
        case "decorator":
          for (let key in this.singleton.decorator)
            store[joinKey(word, key)] = this.singleton.decorator[key];
          this.singleton.decorator = store;
          break;
        case "state":
          for (let key in this.singleton.store)
            store[joinKey(word, key)] = this.singleton.store[key];
          this.singleton.store = store;
          break;
        case "model":
          for (let key in this.definitions.type)
            store[joinKey(word, key)] = this.definitions.type[key];
          this.definitions.type = store;
          break;
        case "error":
          for (let key in this.definitions.error)
            store[joinKey(word, key)] = this.definitions.error[key];
          this.definitions.error = store;
          break;
      }
    }, types = Array.isArray(type) ? type : [type];
    for (let type2 of types.some((x) => x === "all") ? ["decorator", "state", "model", "error"] : types)
      remap(type2);
    return this;
  }
  prefix(type, word) {
    return this.affix("prefix", type, word);
  }
  suffix(type, word) {
    return this.affix("suffix", type, word);
  }
  compile() {
    return this["~adapter"].isWebStandard ? (this.fetch = this.config.aot ? composeGeneralHandler(this) : createDynamicHandler(this), typeof this.server?.reload == "function" && this.server.reload({
      ...this.server || {},
      fetch: this.fetch
    }), this) : (typeof this.server?.reload == "function" && this.server.reload(this.server || {}), this._handle = composeGeneralHandler(this), this);
  }
  /**
   * Wait until all lazy loaded modules all load is fully
   */
  get modules() {
    return this.promisedModules;
  }
};
export {
  Cookie,
  ELYSIA_FORM_DATA,
  ELYSIA_REQUEST_ID,
  ELYSIA_TRACE,
  ERROR_CODE,
  Elysia,
  ElysiaFile,
  InternalServerError,
  InvalidCookieSignature,
  InvertedStatusMap,
  NotFoundError,
  ParseError,
  StatusMap,
  TypeSystemPolicy2 as TypeSystemPolicy,
  ValidationError,
  checksum,
  cloneInference,
  deduplicateChecksum,
  Elysia as default,
  env2 as env,
  error,
  file,
  form,
  getResponseSchemaValidator,
  getSchemaValidator,
  mapValueError,
  mergeHook,
  mergeObjectArray,
  redirect,
  replaceSchemaType,
  replaceUrlPath,
  serializeCookie,
  status,
  t
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
