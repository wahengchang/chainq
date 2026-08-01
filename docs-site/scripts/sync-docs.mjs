import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { DOCS_SITE } from "./config.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const SITE_ROOT = resolve(SCRIPT_DIR, "..");
export const REPO_ROOT = resolve(SITE_ROOT, "..");
export const GENERATED_DOCS = resolve(SITE_ROOT, "src/content/docs");
export const GENERATED_ASSETS = resolve(SITE_ROOT, "public/generated/chainq");
export const BUILD_INFO = resolve(SITE_ROOT, "src/generated/build-info.json");
export const MANIFEST_PATH = resolve(SITE_ROOT, "sync-manifest.yml");

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: "-",
    fences: true,
    listItemIndent: "one",
  });

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function assertInsideRepo(path) {
  const rel = relative(REPO_ROOT, path);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error(`path escapes repository: ${path}`);
  }
  return rel.split(sep).join("/");
}

function normalizeRepoPath(path) {
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || posix.isAbsolute(normalized)) {
    throw new Error(`invalid repository path: ${path}`);
  }
  return normalized;
}

function encodeRepoPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function routeForOutput(outputPath) {
  let slug = normalizeRepoPath(outputPath).replace(/\.mdx?$/i, "");
  slug = slug.replace(/(^|\/)index$/i, "");
  return slug ? `${DOCS_SITE.base}/${slug}/` : `${DOCS_SITE.base}/`;
}

function splitUrl(url) {
  const hashAt = url.indexOf("#");
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = beforeHash.indexOf("?");
  const query = queryAt >= 0 ? beforeHash.slice(queryAt) : "";
  const path = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  return { path, query, hash };
}

function isExternal(url) {
  return /^(?:[a-z][a-z+.-]*:|\/\/)/i.test(url);
}

function resolveSourceTarget(sourcePath, rawTarget) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawTarget);
  } catch {
    throw new Error(`${sourcePath}: invalid URL encoding in ${rawTarget}`);
  }
  const absolute = resolve(REPO_ROOT, dirname(sourcePath), decoded);
  let repoPath = assertInsideRepo(absolute);
  if (!existsSync(absolute)) {
    throw new Error(`${sourcePath}: local target does not exist: ${rawTarget}`);
  }
  if (statSync(absolute).isDirectory()) {
    const readme = resolve(absolute, "README.md");
    if (existsSync(readme)) repoPath = assertInsideRepo(readme);
  }
  return { absolute, repoPath };
}

function rewriteLink(url, sourcePath, routeMap, sourceCommit) {
  if (!url || url.startsWith("#") || isExternal(url)) return url;
  if (url.startsWith("/")) {
    return url.startsWith(`${DOCS_SITE.base}/`) ? url : `${DOCS_SITE.base}${url}`;
  }
  const { path, query, hash } = splitUrl(url);
  if (!path) return url;
  const target = resolveSourceTarget(sourcePath, path);
  const route = routeMap.get(target.repoPath);
  if (route) return `${route}${query}${hash}`;
  const kind = statSync(target.absolute).isDirectory() ? "tree" : "blob";
  return `https://github.com/${DOCS_SITE.repository}/${kind}/${sourceCommit}/${encodeRepoPath(target.repoPath)}${query}${hash}`;
}

function rewriteImage(url, sourcePath) {
  if (!url || url.startsWith("data:") || isExternal(url)) return url;
  if (url.startsWith("/")) {
    return url.startsWith(`${DOCS_SITE.base}/`) ? url : `${DOCS_SITE.base}${url}`;
  }
  const { path, query, hash } = splitUrl(url);
  const target = resolveSourceTarget(sourcePath, path);
  if (statSync(target.absolute).isDirectory()) {
    throw new Error(`${sourcePath}: image target is a directory: ${url}`);
  }
  const destination = resolve(GENERATED_ASSETS, target.repoPath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(target.absolute, destination);
  return `${DOCS_SITE.base}/generated/chainq/${target.repoPath}${query}${hash}`;
}

export function transformMarkdown({ source, sourcePath, entry, routeMap, sourceCommit, lastUpdated }) {
  const tree = processor.parse(source);
  if (tree.children[0]?.type === "heading" && tree.children[0].depth === 1) {
    tree.children.shift();
  }
  visit(tree, "link", (node) => {
    node.url = rewriteLink(node.url, sourcePath, routeMap, sourceCommit);
  });
  visit(tree, "image", (node) => {
    node.url = rewriteImage(node.url, sourcePath);
  });
  const body = processor.stringify(tree).trim();
  const sourceUrl = `https://github.com/${DOCS_SITE.repository}/blob/${sourceCommit}/${encodeRepoPath(sourcePath)}`;
  const commitUrl = `https://github.com/${DOCS_SITE.repository}/commit/${sourceCommit}`;
  const provenance = `> Source: [\`${sourcePath}\`](${sourceUrl}) · repository commit [\`${sourceCommit.slice(0, 7)}\`](${commitUrl})`;
  const frontmatter = {
    title: entry.title,
    ...(entry.description ? { description: entry.description } : {}),
    lastUpdated,
    editUrl: `https://github.com/${DOCS_SITE.repository}/edit/${DOCS_SITE.branch}/${encodeRepoPath(sourcePath)}`,
  };
  return `---\n${stringifyYaml(frontmatter, { lineWidth: 0 }).trim()}\n---\n\n${provenance}\n\n${body}\n`;
}

function readManifest() {
  const parsed = parseYaml(readFileSync(MANIFEST_PATH, "utf8"));
  if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new Error("sync-manifest.yml must contain a non-empty files list");
  }
  if (parsed.source?.repository !== DOCS_SITE.repository) {
    throw new Error(`manifest repository must be ${DOCS_SITE.repository}`);
  }
  return parsed;
}

function resetGeneratedDirectory(path, label) {
  const rel = relative(SITE_ROOT, path);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error(`refusing to clean unsafe ${label} path: ${path}`);
  }
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

export function syncDocs() {
  const manifest = readManifest();
  const sourceCommit = git(["rev-parse", "HEAD"]);
  const docsCommit = sourceCommit;
  const routeMap = new Map();
  const outputPaths = new Set();

  for (const entry of manifest.files) {
    if (!entry?.from || !entry?.to || !entry?.title) {
      throw new Error("every manifest file requires from, to, and title");
    }
    const sourcePath = normalizeRepoPath(entry.from);
    const outputPath = normalizeRepoPath(entry.to);
    const sourceFile = resolve(REPO_ROOT, sourcePath);
    assertInsideRepo(sourceFile);
    if (!existsSync(sourceFile) || !statSync(sourceFile).isFile()) {
      throw new Error(`manifest source file missing: ${sourcePath}`);
    }
    if (routeMap.has(sourcePath)) throw new Error(`duplicate source in manifest: ${sourcePath}`);
    if (outputPaths.has(outputPath)) throw new Error(`duplicate output in manifest: ${outputPath}`);
    routeMap.set(sourcePath, routeForOutput(outputPath));
    outputPaths.add(outputPath);
  }

  resetGeneratedDirectory(GENERATED_DOCS, "generated docs");
  resetGeneratedDirectory(GENERATED_ASSETS, "generated assets");
  writeFileSync(resolve(GENERATED_DOCS, ".gitkeep"), "");

  const pages = [];
  for (const entry of manifest.files) {
    const sourcePath = normalizeRepoPath(entry.from);
    const outputPath = normalizeRepoPath(entry.to);
    const sourceFile = resolve(REPO_ROOT, sourcePath);
    const destination = resolve(GENERATED_DOCS, outputPath);
    const lastUpdated = git(["log", "-1", "--format=%cI", "--", sourcePath]);
    if (!lastUpdated) throw new Error(`no Git history for manifest source: ${sourcePath}`);
    const generated = transformMarkdown({
      source: readFileSync(sourceFile, "utf8"),
      sourcePath,
      entry,
      routeMap,
      sourceCommit,
      lastUpdated,
    });
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, generated);
    pages.push({ sourcePath, outputPath, route: routeMap.get(sourcePath), lastUpdated });
  }

  mkdirSync(dirname(BUILD_INFO), { recursive: true });
  writeFileSync(
    BUILD_INFO,
    `${JSON.stringify({
      builtAt: new Date().toISOString(),
      docsCommit,
      sourceCommits: { chainq: sourceCommit },
      pages,
    }, null, 2)}\n`,
  );

  return { sourceCommit, pages };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = syncDocs();
    console.log(`synced ${result.pages.length} pages from ${result.sourceCommit.slice(0, 7)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
