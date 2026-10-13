#!/usr/bin/env node
// check-portability.mjs — mechanical part of the cross-platform-discipline skill.
//
// Scans a project for the seams where macOS, Windows 11 and the Linux deploy
// target diverge, and prints one line per finding:
//
//   <category>  <path>[:<line>]  <message>
//
// Exit 0 = clean, 1 = findings, 2 = usage error. Zero dependencies, Node >= 18.
//
// Usage (identical on Windows and macOS, from the project root):
//   node scripts/check-portability.mjs [projectDir] [--json] [--allow-shell-scripts]
//
// Intended use: copy this file into the project's scripts/ directory and run it
// in CI. The categories:
//
//   scripts     shell-isms in package.json "scripts" (rm -rf, FOO=bar cmd, export, $VAR, ./script, bash …)
//   docs        POSIX-only commands inside fenced code blocks of README/CONTRIBUTING/docs
//   gitattrs    .gitattributes missing or without an eol=lf rule
//   editorconfig .editorconfig missing or without end_of_line = lf
//   nodeversion neither .nvmrc, .node-version nor engines.node
//   crlf        CRLF line endings in a tracked text file (except *.ps1/*.cmd/*.bat)
//   filename    a path segment Windows cannot create (reserved chars/names, trailing dot or space)
//   case        two paths that differ only by letter case
//   symlink     a symbolic link inside the project
//   shellscript a .sh/.ps1 in the repo root or scripts/ without a Node sibling and not referenced by a Dockerfile
//
// Allowlist: a line ending in `# portability: ok` (docs/scripts) or a
// `"//portability": ["<script name>", …]` array in package.json suppresses that finding.

import { readFileSync, readdirSync, lstatSync, existsSync, statSync } from "node:fs";
import { join, relative, basename, extname, dirname, sep } from "node:path";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
if (positional.length > 1 || flags.has("--help") || flags.has("-h")) {
  console.error("usage: node check-portability.mjs [projectDir] [--json] [--allow-shell-scripts]");
  process.exit(2);
}
const root = positional[0] ?? process.cwd();
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`check-portability: not a directory: ${root}`);
  process.exit(2);
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt", ".turbo", ".cache", "out", "vendor", ".venv", "__pycache__"]);
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx", ".json", ".jsonc", ".yml", ".yaml", ".toml", ".md", ".mdx", ".txt", ".sh", ".sql", ".env", ".html", ".css", ".scss", ".svg", ".xml", ".ini", ".cfg", ".conf", ".gitignore", ".gitattributes", ".editorconfig", ".dockerignore", ".prettierrc", ".npmrc", ".nvmrc"]);
const TEXT_NAMES = new Set(["Dockerfile", "Makefile", "justfile", "Procfile", ".gitignore", ".gitattributes", ".editorconfig", ".dockerignore", ".nvmrc", ".node-version", ".npmrc", ".prettierrc", "LICENSE"]);
const CRLF_OK_EXT = new Set([".ps1", ".cmd", ".bat"]);
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const WIN_BAD_CHARS = /[<>:"|?*\x00-\x1f]/;
const ALLOW = /#\s*portability:\s*ok\s*$/;

const findings = [];
const add = (category, path, line, message) => findings.push({ category, path: path.split(sep).join("/"), line, message });

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------
const files = [];
const dirs = [];
(function walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = relative(root, full);
    let st;
    try { st = lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) { add("symlink", rel, null, "symbolic link — needs admin/developer mode on Windows; reference by path instead"); continue; }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      dirs.push(rel);
      walk(full);
    } else if (st.isFile()) {
      files.push(rel);
    }
  }
})(root);

// ---------------------------------------------------------------------------
// filename / case
// ---------------------------------------------------------------------------
const seenLower = new Map();
for (const rel of [...files, ...dirs]) {
  for (const seg of rel.split(sep)) {
    if (WIN_BAD_CHARS.test(seg)) add("filename", rel, null, `segment "${seg}" contains a character NTFS forbids (< > : " | ? * or control)`);
    if (WIN_RESERVED.test(seg)) add("filename", rel, null, `segment "${seg}" is a reserved device name on Windows`);
    if (/[. ]$/.test(seg)) add("filename", rel, null, `segment "${seg}" ends with a dot or space — Windows strips it`);
  }
  const key = rel.toLowerCase();
  if (seenLower.has(key) && seenLower.get(key) !== rel) add("case", rel, null, `differs only by case from ${seenLower.get(key)} — collides on macOS/Windows checkouts`);
  else seenLower.set(key, rel);
}

// ---------------------------------------------------------------------------
// package.json scripts
// ---------------------------------------------------------------------------
const SCRIPT_RULES = [
  [/(^|[\s;&|(])(rm|cp|mv|mkdir|touch|cat|ln|chmod|chown|sudo|rsync|sed|awk|which)\s/, (m) => `uses "${m[2]}" — a POSIX command cmd.exe does not have; use a node -e one-liner, rimraf/shx, or a scripts/*.mjs`],
  [/(^|[\s;&|(])[A-Z_][A-Z0-9_]*=\S*\s+\S/, () => "inline env assignment (FOO=bar cmd) — POSIX only; load from .env via process.loadEnvFile() or dotenv"],
  [/(^|[\s;&|(])export\s+[A-Z_]/, () => "\"export\" — does not exist in PowerShell/cmd; use .env"],
  [/\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/, () => "shell variable expansion ($VAR) — cmd.exe uses %VAR%; move the logic into a Node script"],
  [/(^|[\s;&|(])(bash|sh|zsh|pwsh|powershell)\s/, (m) => `invokes "${m[2]}" — that interpreter is not on every developer machine; make it a Node script`],
  [/(^|[\s;&|(])\.\/\S+/, () => "runs a file by path (./x) — needs the executable bit, which Windows checkouts lose; use node <file>"],
  [/\S+\.(sh|ps1)(\s|$)/, (m) => `references a ${m[1]} script — shell scripts are for containers/servers, not developer tasks`],
  [/2>\s*\/dev\/null|\/dev\/null/, () => "/dev/null — does not exist on Windows"],
  [/(^|\s)~\//, () => "~/ — home-directory shorthand is shell syntax; use os.homedir() in a script"],
  [/(^|\s)\/tmp\b/, () => "/tmp — does not exist on Windows; use os.tmpdir()"],
];
const pkgPath = join(root, "package.json");
let pkg = null;
if (existsSync(pkgPath)) {
  try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")); } catch (e) { add("scripts", "package.json", null, `cannot parse: ${e.message}`); }
}
if (pkg?.scripts) {
  const allow = new Set(Array.isArray(pkg["//portability"]) ? pkg["//portability"] : []);
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    if (allow.has(name) || typeof cmd !== "string") continue;
    for (const [re, msg] of SCRIPT_RULES) {
      const m = cmd.match(re);
      if (m) { add("scripts", "package.json", null, `"${name}": ${msg(m)}`); break; }
    }
  }
}

// ---------------------------------------------------------------------------
// docs — fenced code blocks in README / CONTRIBUTING / docs/**
// ---------------------------------------------------------------------------
const DOC_RULES = [
  [/^\s*[A-Z_][A-Z0-9_]*=\S*\s+(npm|npx|pnpm|yarn|node|tsx|bun)\b/, "inline env assignment before a command — fails in PowerShell; show .env or both variants"],
  [/^\s*export\s+[A-Z_][A-Z0-9_]*=/, "\"export\" — PowerShell has no export; use .env or show $env: alongside"],
  [/^\s*(sudo|chmod|chown|rsync)\s/, "POSIX-only command in a setup step"],
  [/^\s*(rm\s+-rf?|cp\s+-r|mkdir\s+-p)\b/, "POSIX file command in a setup step — use npm run <script> or show both variants"],
  [/^\s*source\s+\S/, "\"source\" — no equivalent in PowerShell; load env from .env instead"],
  [/^\s*\.\/\S+\.sh\b|^\s*bash\s+\S+\.sh\b|^\s*sh\s+\S+\.sh\b/, "runs a shell script as a developer step — provide a Node script"],
  [/^\s*brew\s+install\b/, "brew — macOS only; list prerequisites per OS in a table instead"],
];
const isDoc = (rel) => {
  const b = basename(rel).toLowerCase();
  const inDocs = rel.split(sep)[0] === "docs";
  return /\.(md|mdx)$/.test(b) && (b.startsWith("readme") || b.startsWith("contributing") || b.startsWith("setup") || b.startsWith("getting") || b.startsWith("install") || inDocs);
};
for (const rel of files.filter(isDoc)) {
  let text;
  try { text = readFileSync(join(root, rel), "utf8"); } catch { continue; }
  const lines = text.split(/\r?\n/);
  let inFence = false, fenceLang = "";
  lines.forEach((line, i) => {
    const f = line.match(/^\s*(```+|~~~+)\s*([\w-]*)/);
    if (f) { inFence = !inFence; fenceLang = inFence ? f[2].toLowerCase() : ""; return; }
    if (!inFence || ALLOW.test(line)) return;
    if (/^(powershell|pwsh|ps1|cmd|bat|dockerfile|docker|yaml|yml|json|js|ts|javascript|typescript|sql)$/.test(fenceLang)) return;
    // The one accepted fork: a POSIX file command with its PowerShell twin within
    // two lines (`cp .env.example .env` / `Copy-Item .env.example .env`).
    const neighbours = lines.slice(Math.max(0, i - 2), i + 3).join("\n");
    if (/^\s*(cp|rm|mkdir|mv)\b/.test(line) && /\b(Copy-Item|Remove-Item|New-Item|Move-Item)\b/.test(neighbours)) return;
    for (const [re, msg] of DOC_RULES) {
      if (re.test(line)) { add("docs", rel, i + 1, msg); break; }
    }
  });
}

// ---------------------------------------------------------------------------
// gitattributes / editorconfig / node version
// ---------------------------------------------------------------------------
const ga = join(root, ".gitattributes");
if (!existsSync(ga)) add("gitattrs", ".gitattributes", null, "missing — add `* text=auto eol=lf` so Windows checkouts do not turn scripts and Dockerfiles into CRLF");
else if (!/eol\s*=\s*lf/.test(readFileSync(ga, "utf8"))) add("gitattrs", ".gitattributes", null, "has no eol=lf rule — add `* text=auto eol=lf`");

const ec = join(root, ".editorconfig");
if (!existsSync(ec)) add("editorconfig", ".editorconfig", null, "missing — add one with `end_of_line = lf`");
else if (!/end_of_line\s*=\s*lf/i.test(readFileSync(ec, "utf8"))) add("editorconfig", ".editorconfig", null, "has no `end_of_line = lf`");

if (pkg && !existsSync(join(root, ".nvmrc")) && !existsSync(join(root, ".node-version")) && !pkg.engines?.node) {
  add("nodeversion", "package.json", null, "no Node version pin — add .nvmrc and engines.node so nvm/fnm/nvm-windows agree");
}

// ---------------------------------------------------------------------------
// crlf
// ---------------------------------------------------------------------------
for (const rel of files) {
  const ext = extname(rel).toLowerCase();
  const name = basename(rel);
  if (CRLF_OK_EXT.has(ext)) continue;
  const isDockerfile = /^dockerfile/i.test(name) || ext === ".dockerfile";
  if (!TEXT_EXT.has(ext) && !TEXT_NAMES.has(name) && !name.startsWith(".env") && !isDockerfile) continue;
  let st;
  try { st = statSync(join(root, rel)); } catch { continue; }
  if (st.size > 1_000_000) continue;
  const buf = readFileSync(join(root, rel));
  if (buf.includes("\r\n")) add("crlf", rel, null, "contains CRLF — breaks shebangs, Dockerfiles and YAML on Linux; fix .gitattributes and run `git add --renormalize .`");
}

// ---------------------------------------------------------------------------
// shell scripts as developer automation
// ---------------------------------------------------------------------------
if (!flags.has("--allow-shell-scripts")) {
  const dockerfiles = files.filter((f) => /^dockerfile/i.test(basename(f)) || /\.dockerfile$/i.test(f));
  const dockerText = dockerfiles.map((f) => { try { return readFileSync(join(root, f), "utf8"); } catch { return ""; } }).join("\n");
  const fileSet = new Set(files.map((f) => f.split(sep).join("/")));
  for (const rel of files) {
    const ext = extname(rel).toLowerCase();
    if (ext !== ".sh" && ext !== ".ps1") continue;
    const parts = rel.split(sep);
    const dev = parts.length === 1 || (parts.length === 2 && /^(scripts?|bin|tools?)$/.test(parts[0]));
    if (!dev) continue;
    const stem = rel.slice(0, -ext.length).split(sep).join("/");
    const hasNodeSibling = [".mjs", ".cjs", ".js", ".ts"].some((e) => fileSet.has(stem + e));
    const inDockerfile = dockerText.includes(basename(rel));
    if (hasNodeSibling || inDockerfile) continue;
    add("shellscript", rel, null, `${ext} as developer automation — ${ext === ".sh" ? "needs Bash, which Windows does not guarantee" : "needs PowerShell 7 on macOS"}; port to scripts/${basename(stem)}.mjs or mark server-only via a Dockerfile reference`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const order = ["scripts", "docs", "shellscript", "crlf", "gitattrs", "editorconfig", "nodeversion", "filename", "case", "symlink"];
findings.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0));

if (flags.has("--json")) {
  console.log(JSON.stringify({ root, findings }, null, 2));
} else {
  for (const f of findings) console.log(`${f.category.padEnd(12)} ${f.path}${f.line ? ":" + f.line : ""}  ${f.message}`);
  const byCat = {};
  for (const f of findings) byCat[f.category] = (byCat[f.category] ?? 0) + 1;
  const summary = Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(findings.length === 0 ? `check-portability: clean (${files.length} files scanned)` : `check-portability: ${findings.length} finding(s) — ${summary}`);
}
process.exit(findings.length === 0 ? 0 : 1);
