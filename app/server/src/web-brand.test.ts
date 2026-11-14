// Brand guard for app/web (see app/web/src/ui/README.md). Runs in the fast suite so every agent hits it:
// 1. no raw colours outside tokens.css, 2. every component file is registered in the kit README.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const web = join(import.meta.dir, "../../web/src");
const files = (dir: string, ext: RegExp): string[] =>
  readdirSync(join(web, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name), ext)
      : ext.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );

describe("web brand rules", () => {
  test("no raw hex / rgb colours outside tokens.css", () => {
    const offenders: string[] = [];
    for (const f of files(".", /\.(css|tsx|ts)$/)) {
      if (f.endsWith("tokens.css") || f.endsWith(".test.ts")) continue;
      readFileSync(join(web, f), "utf8")
        .split("\n")
        .forEach((line, i) => {
          const code = line.replace(/\/\/.*$|\/\*.*?\*\//g, "");
          // hex colours (#fff, #ffffff, #ffffffaa) but not URL fragments / ids like href="#rules"
          const hex =
            /(?<![\w&/=-])#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(code) &&
            !/href=|id=|url\(#/.test(code);
          if (hex || /\brgba?\(/.test(code))
            offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  test("every component file is registered in ui/README.md", () => {
    const readme = readFileSync(join(web, "ui/README.md"), "utf8");
    const unregistered = [
      ...files("components", /\.tsx$/),
      ...files("ui", /\.tsx$/),
    ]
      .map((f) => f.split(/[\\/]/).pop()!)
      .filter((name) => !readme.includes("`" + name + "`"));
    // A new file here means a new component: tell aleksei, add it to the kit + brand page + registry.
    expect(unregistered).toEqual([]);
  });
});
