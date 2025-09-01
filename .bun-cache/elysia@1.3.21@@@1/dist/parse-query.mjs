// src/parse-query.ts
import decode from "fast-decode-uri-component";
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
    if (flags & KEY_PLUS_FLAG && (keySlice = keySlice.replace(/\+/g, " ")), flags & KEY_DECODE_FLAG && (keySlice = decode(keySlice) || keySlice), result[keySlice] !== void 0) return;
    let finalValue = "";
    hasBothKeyValuePair && (finalValue = input.slice(equalityIndex + 1, endIndex), flags & VALUE_PLUS_FLAG && (finalValue = finalValue.replace(/\+/g, " ")), flags & VALUE_DECODE_FLAG && (finalValue = decode(finalValue) || finalValue)), result[keySlice] = finalValue;
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
export {
  parseQuery,
  parseQueryFromURL
};
