// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite runs on the web as WebAssembly, and its worker imports
// wa-sqlite.wasm directly. Metro does not treat .wasm as an asset by default.
// (.db is already in assetExts, so the bundled translations need nothing here.)
config.resolver.assetExts.push('wasm');

// The web build stores the database in OPFS, which needs SharedArrayBuffer,
// which browsers only hand out to cross-origin-isolated pages. These headers
// isolate the dev server; production is configured on the expo-router plugin
// in app.json, since the dev server is not what serves a deployed build.
config.server.enhanceMiddleware = (middleware) => (request, response, next) => {
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(request, response, next);
};

module.exports = config;
