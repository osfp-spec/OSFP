#!/usr/bin/env node
// osfp-evidence.mjs: runs the checks of a project, and writes one OSFP verification-evidence
// record about them, as section 9 of the OSFP standard defines it. Zero dependencies. It needs
// Node.js 22 or later, git, and bash.
//
// Usage: node osfp-evidence.mjs --config <file> --out <dir>
//          [--base <commit>] [--task-id <id>] [--attempt-id <id>] [--verifier <id>]
//
//   --config      the checks to run, and the ignore rules for the tree digests (see README.md)
//   --out         a directory outside the tree, for the record
//   --base        the commit that the attempt started from. With it, the record says whether the
//                 attempt changed what decides each check. Without it, the record says nothing
//                 about that. On a GitHub pull request, the default is the pull request's base.
//   --task-id, --attempt-id, --verifier
//                 the IDs to record. On a GitHub pull request, the defaults are the pull request,
//                 its head commit, and the workflow run.
//
// Run it inside the git working tree that the checks judge. Each check's command must write a
// JUnit XML report to the path in the environment variable OSFP_JUNIT.
//
// Exit status: 0 if every check passed; 1 if a check did not pass; 2 if the checks could not run.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OSFP_VERSION = "0.1.0-draft.1";
const PREDICATE_TYPE = "https://github.com/osfp-spec/OSFP/blob/main/predicates/verification-evidence/v0.1.md";
const FLAGS = ["--config", "--out", "--base", "--task-id", "--attempt-id", "--verifier"];
const USAGE = "usage: node osfp-evidence.mjs --config <file> --out <dir> [--base <commit>] [--task-id <id>] [--attempt-id <id>] [--verifier <id>]";

function couldNotRun(message) {
  console.error(`osfp-evidence: ${message}`);
  process.exit(2);
}

// ------------------------------------------------------------------ inputs

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const [flag, value] = process.argv.slice(i, i + 2);
  if (!FLAGS.includes(flag) || !value || flag in options) couldNotRun(USAGE);
  options[flag] = value;
}
if (!options["--config"] || !options["--out"]) couldNotRun(USAGE);

const git = (args, env = process.env) => execFileSync("git", args, { cwd: root, env, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
let root;
try {
  root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
} catch {
  couldNotRun("run me inside the git working tree that the checks judge");
}

const configPath = resolve(options["--config"]);
let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (e) {
  couldNotRun(`cannot read the config ${configPath}: ${e.message}`);
}
const strings = (x) => Array.isArray(x) && x.every((s) => typeof s === "string" && s.length > 0);
const checks = config.checks;
if (!Array.isArray(checks) || !checks.length) couldNotRun("the config has no checks");
for (const c of checks) {
  if (typeof c?.name !== "string" || !c.name || typeof c.command !== "string" || !c.command) couldNotRun("each check needs a name and a command");
  if (!strings(c.inputs)) couldNotRun(`check "${c.name}" needs inputs: the paths that decide its result, other than the code it judges`);
  if ("successStatus" in c && !Number.isInteger(c.successStatus)) couldNotRun(`check "${c.name}" has a successStatus that is not an integer`);
  if (!c.command.includes("OSFP_JUNIT")) console.error(`osfp-evidence: warning: the command of "${c.name}" does not name OSFP_JUNIT, so it may write no report`);
}
if (new Set(checks.map((c) => c.name)).size !== checks.length) couldNotRun("two checks have the same name");
const ignore = config.ignore ?? [];
if (!Array.isArray(ignore) || !ignore.every((s) => typeof s === "string" && s.length > 0)) couldNotRun("ignore must be a list of paths");
// An empty list says that the checks compare against nothing withheld from the attempt.
const withheld = config.withheldAnswers;
if (withheld !== undefined && !Array.isArray(withheld)) couldNotRun("withheldAnswers must be a list");

// The record goes outside the tree, so that it does not change the tree that a later run digests.
const out = resolve(options["--out"]);
mkdirSync(out, { recursive: true });
const inside = (dir) => {
  const rel = relative(realpathSync(root), realpathSync(dir));
  return !rel.startsWith("..") && !isAbsolute(rel);
};
if (inside(out)) couldNotRun(`--out ${out} is inside the tree; put the record outside it`);

// On a GitHub pull request, the IDs and the base come from the event.
const event = (() => {
  try {
    return process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  } catch {
    return {};
  }
})();
const pr = event.pull_request;
const server = process.env.GITHUB_SERVER_URL;
const repo = process.env.GITHUB_REPOSITORY;
let head = null;
try {
  head = git(["rev-parse", "--verify", "--quiet", "HEAD"]).trim() || null;
} catch {
  // A repository with no commit yet has no HEAD.
}
if (pr && head !== pr.head?.sha) {
  couldNotRun(`HEAD is ${head}, but the head of pull request ${pr.number} is ${pr.head?.sha}. Check out the head (actions/checkout with ref: github.event.pull_request.head.sha), so the record names the tree of the attempt it checked`);
}
const base = options["--base"] ?? pr?.base?.sha;
const taskId = options["--task-id"] ?? pr?.html_url;
const attemptId = options["--attempt-id"] ?? (pr && server && repo ? `${server}/${repo}/commit/${pr.head.sha}` : undefined);
const runId = process.env.GITHUB_RUN_ID;
const verifier = options["--verifier"] ?? (server && repo && runId ? `${server}/${repo}/actions/runs/${runId}/attempts/${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : "osfp-evidence.mjs, run outside CI");

let mergeBase = null;
if (base) {
  try {
    mergeBase = git(["merge-base", base, "HEAD"]).trim();
  } catch {
    couldNotRun(`cannot find where HEAD and ${base} meet. Fetch the full history (actions/checkout with fetch-depth: 0)`);
  }
}

// ------------------------------------------------------------------ the tree on disk

const work = mkdtempSync(join(tmpdir(), "osfp-evidence-"));
let indexes = 0;

// The tree that git would record for the files on disk, under this config's ignore rules only. A
// new index, and --force, keep the tree's own .gitignore files out: the attempt can change those
// (OSFP.EV.13).
function treeOnDisk() {
  const env = { ...process.env, GIT_INDEX_FILE: join(work, `index-${++indexes}`) };
  git(["add", "--all", "--force", "--", ".", ...ignore.map((p) => `:(exclude,glob)${p}`)], env);
  return git(["write-tree"], env).trim();
}

// The paths that decide a check, other than the code it judges. This script and its config always
// count, when they are in the tree.
const own = [fileURLToPath(import.meta.url), configPath]
  .map((p) => relative(realpathSync(root), realpathSync(p)))
  .filter((p) => !p.startsWith("..") && !isAbsolute(p));
function changedInputs(check, tree) {
  if (!mergeBase) return undefined;
  const pathspecs = [...check.inputs.map((p) => `:(glob)${p}`), ...own.map((p) => `:(literal)${p}`)];
  // With no pathspec, git diff lists every changed path. No inputs in the tree means none changed.
  if (!pathspecs.length) return [];
  const names = git(["diff", "--name-only", "--no-renames", mergeBase, tree, "--", ...pathspecs]);
  return [...new Set(names.split("\n").filter(Boolean))].sort();
}

// ------------------------------------------------------------------ units

// The units in a JUnit XML report. A test case with a failure or an error was examined, and it
// failed. A test case with only a skipped element was not examined; pytest reports an expected
// failure (xfail) that way. Every other test case was examined, and it passed. Returns null if
// there is no report.
function unitsOf(path) {
  let xml;
  try {
    xml = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  xml = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  if (!/<testsuites?\b/.test(xml)) return null;
  const units = { examined: 0, failed: 0, skipped: 0 };
  const start = /<testcase\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g;
  for (let m; (m = start.exec(xml)); ) {
    let body = "";
    if (!m[1]) {
      const end = xml.indexOf("</testcase>", start.lastIndex);
      body = xml.slice(start.lastIndex, end < 0 ? xml.length : end);
      if (end >= 0) start.lastIndex = end;
    }
    if (/<(failure|error)\b/.test(body)) {
      units.examined++;
      units.failed++;
    } else if (/<skipped\b/.test(body)) units.skipped++;
    else units.examined++;
  }
  return units;
}

// The status, as section 9 defines it. incomplete wins when OSFP.EV.5 applies; then failed; then
// not-run. A missing report leaves the result unknown, so the check is incomplete.
function statusOf({ ended, treeChanged, units, exitStatus, successStatus }) {
  if (!ended || treeChanged || !units) return "incomplete";
  if (units.failed > 0) return "failed";
  if (units.examined === 0) return "not-run";
  return exitStatus === successStatus ? "passed" : "failed";
}

// ------------------------------------------------------------------ run the checks

const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const checkedAt = now();
const recorded = [];
for (const check of checks) {
  const dir = mkdtempSync(join(work, "check-"));
  const report = join(dir, "junit.xml");
  const log = join(dir, "output.log");
  const treeAtStart = treeOnDisk();
  const fd = openSync(log, "w");
  console.log(`\n== ${check.name}: ${check.command}`);
  // pipefail: the exit status of a pipeline is that of its last failing command (OSFP.EV.4).
  const run = spawnSync("bash", ["-o", "pipefail", "-c", check.command], { cwd: root, stdio: ["ignore", fd, fd], env: { ...process.env, OSFP_JUNIT: report } });
  closeSync(fd);
  if (run.error) couldNotRun(`cannot start bash: ${run.error.message}`);
  const output = readFileSync(log);
  process.stdout.write(output);
  const treeAtEnd = treeOnDisk();
  const ended = run.signal === null;
  const units = unitsOf(report);
  const successStatus = check.successStatus ?? 0;
  const status = statusOf({ ended, treeChanged: treeAtStart !== treeAtEnd, units, exitStatus: run.status, successStatus });
  const changed = changedInputs(check, treeAtStart);
  recorded.push({
    name: check.name,
    command: check.command,
    status,
    unitsExamined: units?.examined ?? 0,
    unitsFailed: units?.failed ?? 0,
    unitsSkipped: units?.skipped ?? 0,
    ...(ended && { exitStatus: run.status }),
    ...("successStatus" in check && { successStatus }),
    outputComplete: ended,
    outputDigest: { sha256: createHash("sha256").update(output).digest("hex") },
    treeAtStart: { gitTree: treeAtStart },
    treeAtEnd: { gitTree: treeAtEnd },
    ...(changed && { inputsChanged: changed.length > 0, changedInputs: changed }),
    ...(Array.isArray(withheld) && !withheld.length && { answersReachable: false }),
  });
  if (!units) console.error(`osfp-evidence: "${check.name}" wrote no JUnit report to $OSFP_JUNIT, so its result is unknown`);
}
rmSync(work, { recursive: true, force: true });

// ------------------------------------------------------------------ write the record

const trees = [...new Set(recorded.map((c) => c.treeAtStart.gitTree))];
const id = randomUUID();
const statement = {
  _type: "https://in-toto.io/Statement/v1",
  subject: trees.map((t, i) => ({ name: i ? `checked-tree-${i + 1}` : "checked-tree", digest: { gitTree: t } })),
  predicateType: PREDICATE_TYPE,
  predicate: {
    osfpVersion: OSFP_VERSION,
    recordType: "verification-evidence",
    id: `urn:uuid:${id}`,
    ...(taskId && { taskId }),
    ...(attemptId && { attemptId }),
    checks: recorded,
    findings: [],
    verifier,
    checkedAt,
  },
};
// A record never changes after it is written (OSFP.GE.3), so a file that exists is never replaced.
const file = join(out, `evidence-${id}.json`);
writeFileSync(file, `${JSON.stringify(statement, null, 2)}\n`, { flag: "wx" });

// ------------------------------------------------------------------ report

const actions = process.env.GITHUB_ACTIONS === "true";
// A GitHub workflow command ends at a line break, so the message escapes them.
const annotate = (kind, title, message) => console.log(`::${kind} title=${title}::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`);
const lines = [`\nOSFP verification evidence: ${file}`];
for (const c of recorded) {
  lines.push(`  ${c.name}: ${c.status} (${c.unitsExamined} examined, ${c.unitsFailed} failed, ${c.unitsSkipped} skipped)`);
  if (c.status !== "passed" && actions) annotate("error", "OSFP check not passed", `${c.name} is ${c.status}: ${c.unitsExamined} examined, ${c.unitsFailed} failed, ${c.unitsSkipped} skipped`);
  if (c.inputsChanged) {
    lines.push(`    the attempt changed what decides it: ${c.changedInputs.join(", ")}. Read those changes before you count a pass (OSFP.EV.11).`);
    if (actions) annotate("warning", "What decides an OSFP check changed", `${c.name}: ${c.changedInputs.join(", ")}. Read those changes before you count a pass.`);
  }
}
if (!mergeBase) lines.push("  no --base: the record does not say whether the attempt changed what decides each check");
const commitTree = head && git(["rev-parse", "HEAD^{tree}"]).trim();
for (const t of trees) {
  if (t === commitTree) lines.push(`  checked tree ${t}: the tree of commit ${head}`);
  else {
    const diff = head ? git(["diff-tree", "-r", "--name-status", commitTree, t]).trim().split("\n").slice(0, 20) : [];
    lines.push(`  checked tree ${t}: not the tree of commit ${head ?? "(none)"}. Files on disk differ from the commit:`, ...diff.map((d) => `    ${d}`));
  }
}
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = recorded.map((c) => `| ${c.name} | \`${c.status}\` | ${c.unitsExamined} | ${c.unitsFailed} | ${c.unitsSkipped} | ${c.inputsChanged === undefined ? "unknown" : c.inputsChanged ? c.changedInputs.join(", ") : "none"} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, ["## OSFP verification evidence", "", "| Check | Status | Examined | Failed | Skipped | Inputs the attempt changed |", "|---|---|---|---|---|---|", ...rows, "", `Checked tree: ${trees.map((t) => `\`${t}\``).join(", ")}`, ""].join("\n"));
}
process.exit(recorded.every((c) => c.status === "passed") ? 0 : 1);
