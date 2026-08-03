import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
const errors = [];
for (const file of files) {
  if (!existsSync(resolve(root, file))) continue;
  const source = readFileSync(resolve(root, file), "utf8");
  for (const match of source.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
    const raw = match[1].trim().split(/\s+/)[0];
    if (!raw || raw.startsWith("#") || /^(?:[a-z][a-z+.-]*:|\/\/)/i.test(raw)) continue;
    const path = decodeURIComponent(raw.split(/[?#]/)[0]);
    const target = resolve(root, dirname(file), path);
    if (!existsSync(target)) errors.push(`${file}: missing ${raw}`);
    else if (statSync(target).isDirectory() && !existsSync(resolve(target, "README.md"))) {
      errors.push(`${file}: directory has no README.md: ${raw}`);
    }
  }
}
if (errors.length) {
  console.error(`documentation link check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`checked local links in ${files.length} Markdown files`);
