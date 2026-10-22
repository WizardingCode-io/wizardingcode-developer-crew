/** `s` as a regular expression that matches it literally (findings 54, 110: one escape for every caller). */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c !== undefined) {
      re += escapeRegExp(c);
    }
  }
  return new RegExp(`^${re}$`, "i");
}

export function matchesAny(path: string, patterns: readonly string[]): boolean {
  const normalised = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalised));
}
