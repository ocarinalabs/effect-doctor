import packageManifest from "../package.json" with { type: "json" };

export const DOCTOR_VERSION = packageManifest.version;

export const PINNED_TOOLCHAIN = Object.freeze({
  effect: "4.0.0-rc.112",
  effectOxlint: "0.11.0",
  oxlint: "1.80.0",
  oxlintPlugins: "1.80.0",
  tsgo: "0.38.0",
  tsgoPlatform: "0.38.0",
  typescript: "7.0.2",
});
