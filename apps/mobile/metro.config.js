const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch shared packages
config.watchFolders = [
  path.resolve(monorepoRoot, "packages/shared-utils"),
  path.resolve(monorepoRoot, "packages/types"),
];

// Resolve from mobile first, then root (for hoisted deps)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Map shared packages
config.resolver.extraNodeModules = {
  "@printowl/shared-utils": path.resolve(monorepoRoot, "packages/shared-utils"),
  "@printowl/types": path.resolve(monorepoRoot, "packages/types"),
};

// Block ALL native RN packages from the ROOT node_modules to prevent
// duplicate registrations (the mobile app has its own copies)
const nativePackages = [
  "react-native",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-svg",
  "@react-native-async-storage",
  "react-native-web",
  "react",
  "react-dom",
];

const escapePathForRegex = (p) => p.replace(/[/\\]/g, "[/\\\\]");

config.resolver.blockList = nativePackages.map(
  (pkg) => new RegExp(escapePathForRegex(path.resolve(monorepoRoot, "node_modules", pkg)) + "[/\\\\].*")
);

module.exports = config;
