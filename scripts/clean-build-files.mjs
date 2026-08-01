import { rm } from "node:fs/promises";

const buildPaths = [".next", "tsconfig.tsbuildinfo"];

await Promise.all(
  buildPaths.map((path) =>
    rm(path, { recursive: true, force: true }).catch((error) => {
      console.error(`Failed to remove ${path}:`, error);
      process.exitCode = 1;
    }),
  ),
);
