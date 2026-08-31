import packageManifest from "../package.json" with { type: "json" };

export const DOCTOR_VERSION = packageManifest.version;
