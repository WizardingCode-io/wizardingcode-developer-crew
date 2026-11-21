import { join } from "node:path";
import { isRegularFile } from "../fs.ts";
import type { DetectedTarget, Detector } from "./types.ts";

/** A golangci-lint configuration by any of the names the tool reads: the project chose that linter. */
const GOLANGCI = [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"];

/**
 * A Go module: a folder whose `go.mod` is a regular file. The file is a marker here: this detector
 * does not read its text (the frameworks' reader does, for the module paths it requires). The gates are the toolchain's own; the build is the compiler's check, so there is no
 * type check gate, and `go test` takes packages, so there is no scoped test. A `go.work` is not
 * read: each module it uses has its own `go.mod` and is a target of its own.
 */
export const goDetector: Detector = {
  stack: "go",
  detect(dir: string): DetectedTarget | null {
    if (!isRegularFile(join(dir, "go.mod"))) return null;
    const configured = GOLANGCI.some((name) => isRegularFile(join(dir, name)));
    return {
      stack: "go",
      packageManager: "go",
      gates: {
        build: "go build ./...",
        test: "go test ./...",
        lint: configured ? "golangci-lint run" : "go vet ./...",
      },
    };
  },
};
