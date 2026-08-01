import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { GENERATED_ASSETS, GENERATED_DOCS, MANIFEST_PATH, SITE_ROOT } from "./sync-docs.mjs";

function frontmatterOf(markdown, path) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!match) throw new Error(`${path}: missing frontmatter`);
  return parseYaml(match[1]);
}

export function validateGeneratedDocs() {
  const manifest = parseYaml(readFileSync(MANIFEST_PATH, "utf8"));
  const errors = [];
  const routes = new Set();

  for (const entry of manifest.files ?? []) {
    const output = resolve(GENERATED_DOCS, entry.to);
    if (!existsSync(output)) {
      errors.push(`${entry.to}: generated file missing`);
      continue;
    }
    const markdown = readFileSync(output, "utf8");
    try {
      const data = frontmatterOf(markdown, entry.to);
      if (data.title !== entry.title) errors.push(`${entry.to}: title mismatch`);
      if (!data.lastUpdated || Number.isNaN(Date.parse(data.lastUpdated))) {
        errors.push(`${entry.to}: invalid lastUpdated`);
      }
      if (!data.editUrl?.startsWith("https://github.com/wahengchang/chainq/edit/main/")) {
        errors.push(`${entry.to}: invalid editUrl`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (!markdown.includes(`Source: [\`${entry.from}\`]`)) {
      errors.push(`${entry.to}: source provenance missing`);
    }
    const route = entry.to.replace(/\.mdx?$/, "").replace(/(^|\/)index$/, "") || "/";
    if (routes.has(route)) errors.push(`${entry.to}: duplicate route ${route}`);
    routes.add(route);
    for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const url = match[1].split(/\s+/)[0];
      if (/^(?:https?:|mailto:|#|\/chainq\/)/.test(url)) continue;
      errors.push(`${entry.to}: unresolved local URL ${url}`);
    }
  }

  if (existsSync(GENERATED_ASSETS) && !statSync(GENERATED_ASSETS).isDirectory()) {
    errors.push("generated assets path is not a directory");
  }
  if (!existsSync(resolve(SITE_ROOT, "src/generated/build-info.json"))) {
    errors.push("build-info.json missing");
  }
  if (errors.length) throw new Error(`generated docs validation failed:\n- ${errors.join("\n- ")}`);
  return { pages: routes.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateGeneratedDocs();
    console.log(`validated ${result.pages} generated pages`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
