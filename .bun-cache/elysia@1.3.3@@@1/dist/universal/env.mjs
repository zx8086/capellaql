// src/universal/utils.ts
var isBun = typeof Bun < "u";

// src/universal/env.ts
var env = isBun ? Bun.env : typeof process < "u" && process?.env ? process.env : {};
export {
  env
};
