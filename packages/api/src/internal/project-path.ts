import { isAbsolute, relative } from "node:path";

export const projectRelativePath = (root: string, absolute: string): string => {
  const path = relative(root, absolute);
  if (
    path === "" ||
    path === ".." ||
    path.startsWith("../") ||
    path.startsWith("..\\") ||
    isAbsolute(path)
  ) {
    throw new Error("Path is outside the project root");
  }
  return path.replaceAll("\\", "/");
};
