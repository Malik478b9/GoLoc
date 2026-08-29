const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Zustand v5 (and similar libraries) ship a modern ESM build using
// `import.meta.env`, which Metro's web bundler doesn't support yet.
// Force package-export resolution to prefer the CommonJS build instead.
config.resolver.unstable_conditionNames = ["browser", "require", "react-native"];

module.exports = config;