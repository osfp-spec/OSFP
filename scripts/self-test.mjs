#!/usr/bin/env node
// self-test.mjs — proves that each check can fail. A check that cannot fail proves nothing.
//
// Each case copies this repository to a new temporary directory, makes one change, and runs one
// check against the copy. A failing case expects exit 1 and a named message on a FAIL line; a
// could-not-run case expects exit 2 and its message; a passing case expects exit 0. A clean copy
// must pass both checks. No case touches the repository itself.
//
// Every condition in both scripts has a case here: one that fails on that condition, or, for a
// condition that lets a correct record through, one that passes. So does each wrong copy that an
// adversarial review built, where a rule forbids it.
//
// Usage: node scripts/self-test.mjs
// Exit:  0 every case behaved · 1 a case did not · 2 could not run.

import { chmodSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Deletes only directories this run created under the OS temp dir.
const OWN_PREFIX = join(tmpdir(), "osfp-self-test-");
const madeHere = new Set();
function makeCopy() {
  const dir = mkdtempSync(OWN_PREFIX);
  madeHere.add(dir);
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !/^\.git(\/|$)/.test(relative(ROOT, src)) });
  makeWritable(dir);
  return dir;
}
// A copy of a read-only checkout is read-only too; the cases must edit it, and the run must delete it.
function makeWritable(path) {
  chmodSync(path, statSync(path).mode | 0o200);
  if (statSync(path).isDirectory()) for (const name of readdirSync(path)) makeWritable(join(path, name));
}
function removeCopy(dir) {
  if (!madeHere.has(dir) || !dir.startsWith(OWN_PREFIX)) throw new Error(`refusing to delete ${dir}: not a copy this run made`);
  rmSync(dir, { recursive: true, force: true });
}

// Each edit throws unless it changes exactly one place, so a case can never pass by missing its target.
function replace(dir, path, from, to) {
  const file = join(dir, path);
  const text = readFileSync(file, "utf8");
  const found = text.split(from).length - 1;
  if (found !== 1) throw new Error(`mutation missed: ${path} contains ${JSON.stringify(from.slice(0, 60))} ${found} times, not once`);
  writeFileSync(file, text.replace(from, to));
}
function replaceMatch(dir, path, pattern, to) {
  const file = join(dir, path);
  const text = readFileSync(file, "utf8");
  if (!pattern.test(text)) throw new Error(`mutation missed: ${path} does not match ${pattern}`);
  writeFileSync(file, text.replace(pattern, to));
}
// The full line of a table row, found by its first cell, so a case does not depend on the rest of the row.
function rowLine(dir, path, firstCell) {
  const line = readFileSync(join(dir, path), "utf8").split("\n").find((l) => l.startsWith(`| ${firstCell} |`));
  if (!line) throw new Error(`mutation missed: ${path} has no row for ${firstCell}`);
  return line;
}
function editJson(dir, path, change) {
  const file = join(dir, path);
  const before = readFileSync(file, "utf8");
  const doc = JSON.parse(before);
  change(doc);
  const after = `${JSON.stringify(doc, null, 2)}\n`;
  if (JSON.stringify(JSON.parse(after)) === JSON.stringify(JSON.parse(before))) throw new Error(`mutation missed: ${path} is unchanged`);
  writeFileSync(file, after);
}
function remove(dir, path) {
  const file = join(dir, path);
  readFileSync(file);
  rmSync(file);
}
const addJson = (dir, path, doc) => writeFileSync(join(dir, path), `${JSON.stringify(doc, null, 2)}\n`);
function replaceAll(dir, path, from, to) {
  const file = join(dir, path);
  const text = readFileSync(file, "utf8");
  if (!text.includes(from)) throw new Error(`mutation missed: ${path} does not contain ${JSON.stringify(from.slice(0, 60))}`);
  writeFileSync(file, text.split(from).join(to));
}
function copyJson(dir, from, to, change) {
  const doc = JSON.parse(readFileSync(join(dir, from), "utf8"));
  change(doc);
  addJson(dir, to, doc);
}
const ruleText = (dir, id) => {
  const line = readFileSync(join(dir, "spec/STANDARD.md"), "utf8").split("\n").find((l) => l.startsWith(`- \`${id}\` — `));
  if (!line) throw new Error(`mutation missed: no definition of ${id}`);
  return line.slice(`- \`${id}\` — `.length);
};

const STANDARD = "check-standard.mjs";
const OSFP = "check-osfp.mjs";
const SPEC = "spec/STANDARD.md";
const DATA = "spec/standard.json";
const [GRANT, RETRY, STANDING, SCHEDULED] = ["", "-retry", "-standing", "-scheduled"].map((s) => `examples/task-grant${s}.json`);
const OUTCOME = "examples/outcome-unknown.json";
const EXPIRED = "examples/progress-limit-expired.json";
const OVERDUE = "examples/progress-overdue.json";
const EVIDENCE = "examples/verification-evidence.json";
const [DISPATCHED, DISPATCHED_RETRY] = ["", "-retry"].map((s) => `examples/progress-dispatched${s}.json`);
const WORKFLOW = ".github/workflows/check.yml";
// A dispatched event for attempt b3 of the nightly task a2, at a given time.
const dispatchB3 = (d, at) =>
  copyJson(d, DISPATCHED, "examples/progress-dispatched-nightly.json", (e) => {
    Object.assign(e, { id: U("00000000000f"), time: at });
    Object.assign(e.data, { id: U("000000000010"), occurredAt: at, taskId: U("0000000000a2"), attemptId: U("0000000000b3") });
  });
const PASS = /Result: 0 violation/;
// Task a3, which can write the repository of task a1, is dispatched while a1's first attempt is unknown.
function otherWriter(d, grant) {
  copyJson(d, GRANT, "examples/task-grant-other.json", (g) => Object.assign(g, { id: U("00000000001c"), taskId: U("0000000000a3"), approvedAt: "2026-11-11T18:04:00Z" }, grant));
  copyJson(d, DISPATCHED, "examples/progress-dispatched-other.json", (e) => {
    Object.assign(e, { id: U("00000000001d"), time: "2026-11-11T18:05:00Z" });
    Object.assign(e.data, { id: U("00000000001e"), occurredAt: e.time, taskId: U("0000000000a3"), attemptId: U("0000000000b4") });
  });
}
// The definition of OSFP.EV.4, wrapped so that its key word starts the second line.
const wrapRule = (d) => replace(d, SPEC, "- `OSFP.EV.4` — A check whose command exited MUST record", "- `OSFP.EV.4` — A check whose command exited\n  MUST record");
const checksOf = (doc) => doc.predicate.checks;
const item = (doc, id) => doc.items.find((it) => it.id === id);
const U = (s) => `urn:uuid:7b0c9d62-1f3a-4c2e-9a51-${s}`;
const VERSION = JSON.parse(readFileSync(join(ROOT, "spec/standard.json"), "utf8")).version;
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// An ended event for the second attempt of task a1, which the examples do not include.
const endedEvent = (overrides = {}) => ({
  specversion: "1.0",
  type: "io.github.sunnypatneedi.osfp.progress.ended",
  source: "urn:example:factory",
  id: U("00000000000b"),
  time: "2026-11-11T18:15:00Z",
  data: {
    osfpVersion: VERSION, recordType: "progress", id: U("00000000000c"), event: "ended", occurredAt: "2026-11-11T18:15:00Z",
    taskId: U("0000000000a1"), attemptId: U("0000000000b2"), state: "completed", ...overrides,
  },
});

// [script, case, expected message, mutation, expected exit (1 unless stated)]
const CASES = [
  // check-standard.mjs: the document against its data, one case per check.
  [STANDARD, "[version] README names another version", /\[version\]/, (d) => replace(d, "README.md", `**Version:** ${VERSION}`, `**Version:** ${VERSION}.0`)],
  [STANDARD, "[changelog] the Unreleased heading is gone", /\[changelog\]/, (d) => replace(d, "CHANGELOG.md", "## [Unreleased]\n", "")],
  [STANDARD, "[ids] two rules share an ID in the data", /\[ids\]/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.GE.2").id = "OSFP.GE.1"))],
  [STANDARD, "[parity] a rule is in the prose but not in the data", /\[parity\]/, (d) =>
    replace(d, SPEC, "- `OSFP.GE.6` —", "- `OSFP.GE.99` — A consumer MUST log every record it reads.\n- `OSFP.GE.6` —")],
  [STANDARD, "[text] two rules swap their text in the prose", /\[text\]/, (d) => {
    const [a, b] = [ruleText(d, "OSFP.EV.3"), ruleText(d, "OSFP.EV.10")];
    replace(d, SPEC, `\`OSFP.EV.3\` — ${a}`, `\`OSFP.EV.3\` — ${b}`);
    replace(d, SPEC, `\`OSFP.EV.10\` — ${b}`, `\`OSFP.EV.10\` — ${a}`);
  }],
  [STANDARD, "[text] a second definition contradicts the first", /\[text\].*OSFP\.OU\.4 is defined 2 times/, (d) =>
    replace(d, SPEC, "## 9. Verification evidence", "- `OSFP.OU.4` — A factory MAY record `failed` when it cannot establish what happened.\n\n## 9. Verification evidence")],
  [STANDARD, "[text] the data cuts a rule's final clause", /\[text\].*OSFP\.EV\.3/, (d) =>
    editJson(d, DATA, (doc) => (item(doc, "OSFP.EV.3").statement = item(doc, "OSFP.EV.3").statement.replace(/; skipped.*$/, "")))],
  [STANDARD, "[text] the prose adds a sentence with no key word", /\[text\].*OSFP\.AU\.4/, (d) =>
    replace(d, SPEC, "any that the task's authority does not permit.", "any that the task's authority does not permit. Tools that the harness already provides are not covered.")],
  [STANDARD, "[text] a rule gains an indented line", /\[text\].*OSFP\.AU\.9/, (d) =>
    replace(d, SPEC, "- `OSFP.AU.9` — A factory MUST NOT place a credential in a model's input.", "- `OSFP.AU.9` — A factory MUST NOT place a credential in a model's input.\n  This does not apply to tool results.")],
  [STANDARD, "[text] a rule's statement is gone from the data", /\[text\].*OSFP\.OU\.5/, (d) => editJson(d, DATA, (doc) => delete item(doc, "OSFP.OU.5").statement)],
  [STANDARD, "[pinned] a pinned rule disappears from prose and data together", /\[pinned\].*OSFP\.EV\.10/, (d) => {
    replace(d, SPEC, `- \`OSFP.EV.10\` — ${ruleText(d, "OSFP.EV.10")}\n`, "");
    editJson(d, DATA, (doc) => (doc.items = doc.items.filter((it) => it.id !== "OSFP.EV.10")));
  }],
  [STANDARD, "[citations] a rule cites a source the bibliography lacks", /\[citations\]/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.GE.1").citations = ["made-up"]))],
  [STANDARD, "[keywords] the BCP 14 paragraph is gone", /\[keywords\]/, (d) => replace(d, SPEC, "when, and only when, they appear in all capitals", "when they appear")],
  [STANDARD, "[sections] the known limitations section is renamed", /\[sections\]/, (d) => replace(d, SPEC, "## 17. Known limitations", "## 17. Caveats")],
  [STANDARD, "[links] a relative link points at a missing file", /\[links\]/, (d) => writeFileSync(join(d, "BROKEN.md"), "See [the FAQ](FAQ.md).\n")],
  [STANDARD, "[ci] the checkout action loses its SHA pin", /\[ci\]/, (d) => replaceMatch(d, ".github/workflows/check.yml", /@[0-9a-f]{40}/, "@v7")],

  // check-standard.mjs: the other conditions inside each check.
  [STANDARD, "[version] the version is not SemVer", /\[version\].*not a Semantic Versioning/, (d) => {
    replace(d, SPEC, `**Version:** ${VERSION}`, "**Version:** 0.1-draft");
    replace(d, "README.md", `**Version:** ${VERSION}`, "**Version:** 0.1-draft");
    editJson(d, DATA, (doc) => (doc.version = "0.1-draft"));
  }],
  [STANDARD, "[changelog] no heading for the current version", new RegExp(`\\[changelog\\].*${escaped(VERSION)}`), (d) => replace(d, "CHANGELOG.md", `## [${VERSION}] - `, `## [${VERSION}.0] - `)],
  [STANDARD, "[ids] a malformed ID", /\[ids\].*malformed ID/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.GE.6").id = "OSFP.G.6"))],
  [STANDARD, "[ids] the data holds no rules", /\[ids\].*no IDs found/, (d) => editJson(d, DATA, (doc) => (doc.items = []))],
  [STANDARD, "[parity] a rule is in the data but not in the prose", /\[parity\].*OSFP\.AU\.8 is in spec\/standard\.json but not in/, (d) =>
    replace(d, SPEC, `- \`OSFP.AU.8\` — ${ruleText(d, "OSFP.AU.8")}\n`, "")],
  [STANDARD, "[version] the standard states no version", /\[version\].*has no line matching versionPattern/, (d) => replace(d, SPEC, `**Version:** ${VERSION}\n`, "")],
  [STANDARD, "[version] the data states no version", /\[version\].*has no top-level "version" string/, (d) => editJson(d, DATA, (doc) => delete doc.version)],
  [STANDARD, "[version] README states no version", /\[version\].*README\.md states no version/, (d) => replace(d, "README.md", `**Version:** ${VERSION}\n`, "")],
  [STANDARD, "[version] README is gone", /\[version\].*README\.md not found/, (d) => remove(d, "README.md")],
  [STANDARD, "[changelog] CHANGELOG is gone", /\[changelog\].*CHANGELOG\.md not found/, (d) => remove(d, "CHANGELOG.md")],
  [STANDARD, "[pinned] a pinned rule disappears from the prose only", /\[pinned\].*OSFP\.EV\.10 is missing from spec\/STANDARD\.md/, (d) => replaceAll(d, SPEC, "OSFP.EV.10", "OSFP.EV.99")],
  [STANDARD, "[citations] the data has no bibliography", /\[citations\].*no top-level "bibliography" array/, (d) => editJson(d, DATA, (doc) => delete doc.bibliography)],
  [STANDARD, "[citations] a source has no key", /\[citations\].*bibliography\[0\] has no key/, (d) => editJson(d, DATA, (doc) => delete doc.bibliography[0].key)],
  [STANDARD, "[text] a rule loses the line that defines it", /\[text\].*OSFP\.AU\.8 has no definition/, (d) =>
    replace(d, SPEC, `- \`OSFP.AU.8\` — ${ruleText(d, "OSFP.AU.8")}`, `- ${ruleText(d, "OSFP.AU.8")} (\`OSFP.AU.8\`)`)],
  [STANDARD, "[text] a paragraph restates a rule with a key word", /\[text\].*key word "MUST NOT" beside OSFP\.OU\.5/, (d) =>
    replace(d, SPEC, "## 9. Verification evidence", "A factory MUST NOT dispatch another attempt while one is unknown (`OSFP.OU.5`).\n\n## 9. Verification evidence")],
  [STANDARD, "[text] a defining heading owns a paragraph with another key word", /\[text\].*has 2 BCP 14 key word/, (d) =>
    replace(d, SPEC, `- \`OSFP.GE.6\` — ${ruleText(d, "OSFP.GE.6")}`, `### \`OSFP.GE.6\` — ${ruleText(d, "OSFP.GE.6")}\n\nA producer MUST log each rejected record.`)],
  [STANDARD, "[text] an underscore inside a name changes", /\[text\].*OSFP\.PF\.3/, (d) =>
    editJson(d, DATA, (doc) => (item(doc, "OSFP.PF.3").statement = item(doc, "OSFP.PF.3").statement.replace("TASK_STATE_INPUT_REQUIRED", "TASK_STATE_INPUTREQUIRED")))],
  [STANDARD, "[citations] a new rule cites nothing", /\[citations\].*cites nothing/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.GE.1").citations = []))],
  [STANDARD, "[citations] a rule declares a citation gap", /\[citations\].*declares a gap/, (d) =>
    editJson(d, DATA, (doc) => Object.assign(item(doc, "OSFP.GE.1"), { citations: [], citationsTodo: "find a source" }))],
  [STANDARD, "[citations] a rule has no introducedIn", /\[citations\].*no introducedIn/, (d) => editJson(d, DATA, (doc) => delete item(doc, "OSFP.GE.1").introducedIn)],
  [STANDARD, "[citations] a source has neither a DOI nor a URL", /\[citations\].*neither doi nor url/, (d) => editJson(d, DATA, (doc) => delete doc.bibliography.find((b) => b.key === "sarif").url)],
  [STANDARD, "[citations] two sources share a key", /\[citations\].*duplicate bibliography key/, (d) => editJson(d, DATA, (doc) => doc.bibliography.push({ ...doc.bibliography[0] }))],

  // check-osfp.mjs [schema]: the data against its schema.
  [OSFP, "[schema] a rule gains a field the schema does not allow", /\[schema\].*priority/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.GE.1").priority = "high"))],
  [OSFP, "[schema] a rule loses every class", /\[schema\].*OSFP|\[schema\].*classes/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.EV.10").classes = []))],
  [OSFP, "[schema] the schema uses a keyword the check does not implement", /\[could-not-run\].*"maxLength"/, (d) =>
    editJson(d, "schema/standard.schema.json", (s) => (s.$defs.item.properties.statement.maxLength = 400)), 2],
  [OSFP, "[schema] a statement is a number", /\[schema\].*statement is integer, not string/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.GE.1").statement = 42))],
  [OSFP, "[schema] the standard has another name", /\[schema\].*is not "OSFP"/, (d) => editJson(d, DATA, (doc) => (doc.standard = "OSFX"))],
  [OSFP, "[schema] a rule names a class that does not exist", /\[schema\].*"auditor", not one of/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.GE.4").classes = ["auditor"]))],
  [OSFP, "[schema] an area breaks its pattern", /\[schema\].*area does not match/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.GE.1").area = "G1"))],
  [OSFP, "[schema] the name is empty", /\[schema\].*name is shorter than 1/, (d) => editJson(d, DATA, (doc) => (doc.name = ""))],
  [OSFP, "[schema] a source URL is not a URI", /\[schema\].*url is not a URI/, (d) => editJson(d, DATA, (doc) => (doc.bibliography.find((b) => b.key === "sarif").url = "not a uri"))],
  [OSFP, "[schema] a rule has no introducedIn", /\[schema\].*has no introducedIn/, (d) => editJson(d, DATA, (doc) => delete item(doc, "OSFP.GE.1").introducedIn)],
  [OSFP, "[schema] a source has neither a DOI nor a URL", /\[schema\].*has none of doi or url/, (d) => editJson(d, DATA, (doc) => delete doc.bibliography.find((b) => b.key === "sarif").url)],
  [OSFP, "[schema] a rule repeats a class", /\[schema\].*repeats an item/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.GE.4").classes = ["consumer", "consumer"]))],

  // check-osfp.mjs [structure].
  [OSFP, "[structure] a second section takes a title and a table from the first", /\[structure\].*two sections titled "Outcome"/, (d) =>
    replace(d, SPEC, "## 9. Verification evidence", "## 8. Outcome\n\n| State | Meaning |\n|---|---|\n| `paused` | Stopped for now |\n\n## 9. Verification evidence")],
  [OSFP, "[structure] a paragraph states a requirement without a rule ID", /\[structure\].*key word MAY outside a numbered rule/, (d) =>
    replace(d, SPEC, "## 9. Verification evidence", "A factory MAY dispatch another attempt while an earlier attempt is `unknown`.\n\n## 9. Verification evidence")],
  [OSFP, "[structure] CI stops running check-standard", /\[structure\].*does not run node scripts\/check-standard\.mjs/, (d) => replace(d, WORKFLOW, "      - run: node scripts/check-standard.mjs\n", "")],
  [OSFP, "[structure] CI stops running check-osfp", /\[structure\].*does not run node scripts\/check-osfp\.mjs/, (d) => replace(d, WORKFLOW, "      - run: node scripts/check-osfp.mjs\n", "")],
  [OSFP, "[structure] a key word in quotes outside a rule", /\[structure\].*key word MAY outside a numbered rule/, (d) =>
    replace(d, SPEC, "## 9. Verification evidence", "A factory \"MAY\" dispatch another attempt while an earlier attempt is `unknown`.\n\n## 9. Verification evidence")],
  [OSFP, "[structure] a key word in backticks outside a rule", /\[structure\].*key word MAY outside a numbered rule/, (d) =>
    replace(d, SPEC, "## 9. Verification evidence", "A factory `MAY` dispatch another attempt while an earlier attempt is `unknown`.\n\n## 9. Verification evidence")],
  [OSFP, "[structure] CI ignores a failing check", /\[structure\].*continue-on-error/, (d) => replace(d, WORKFLOW, "    timeout-minutes: 10\n", "    timeout-minutes: 10\n    continue-on-error: true\n")],
  [OSFP, "[structure] CI no longer runs on pull requests", /\[structure\].*does not run on pull_request/, (d) => replace(d, WORKFLOW, "  pull_request:\n", "")],
  [OSFP, "[structure] CI no longer runs on push", /\[structure\].*does not run on push/, (d) => replace(d, WORKFLOW, "  push:\n    branches: [main]\n", "")],
  [OSFP, "[structure] CI runs the checks in one multi-line step", PASS, (d) =>
    replace(d, WORKFLOW, "      - run: node scripts/check-standard.mjs\n      - run: node scripts/check-osfp.mjs\n      - run: node scripts/self-test.mjs\n",
      "      - run: |\n          node scripts/check-standard.mjs\n          node scripts/check-osfp.mjs\n          node scripts/self-test.mjs\n"), 0],
  [OSFP, "[structure] CI stops running the self-test", /\[structure\].*does not run node scripts\/self-test\.mjs/, (d) => replace(d, ".github/workflows/check.yml", "      - run: node scripts/self-test.mjs\n", "")],

  // check-osfp.mjs [examples]: each record's own fields and each field's own values.
  [OSFP, "[examples] a grant uses a field from the outcome table", /\[examples\].*"state" is not a field of the task-grant record/, (d) =>
    editJson(d, "examples/task-grant.json", (g) => (g.state = "unknown"))],
  [OSFP, "[examples] an outcome's state is a field name", /\[examples\].*"note" is not a value of "state"/, (d) =>
    editJson(d, "examples/outcome-unknown.json", (o) => (o.state = "note"))],
  [OSFP, "[examples] a check's status is a field name", /\[examples\].*"verifier" is not a value of "status"/, (d) =>
    editJson(d, "examples/verification-evidence.json", (s) => (checksOf(s)[0].status = "verifier"))],
  [OSFP, "[examples] an operation is an access value", /\[examples\].*"write" is not a value of "operations"/, (d) =>
    editJson(d, "examples/task-grant.json", (g) => (g.operations = ["dispatch", "write"]))],
  [OSFP, "[examples] a hidden table row defines an operation", /\[examples\].*"deploy" is not a value of "operations"/, (d) => {
    replace(d, SPEC, "| `merge` |", "<!--\n| `deploy` | Deploying |\n-->\n| `merge` |");
    editJson(d, "examples/task-grant.json", (g) => g.operations.push("deploy"));
  }],
  [OSFP, "[examples] an event type leaves the maintainer's namespace", /\[examples\].*is not io\.github\.sunnypatneedi\.osfp\.progress\. followed by an event/, (d) =>
    editJson(d, "examples/progress-overdue.json", (e) => (e.type = "dev.osfp.progress.overdue"))],
  [OSFP, "[examples] a statement carries a field in-toto does not define", /\[examples\].*"signature" is not a field of the in-toto Statement/, (d) => editJson(d, EVIDENCE, (s) => (s.signature = "x"))],
  [OSFP, "[examples] an event carries a field with a capital letter", /\[examples\].*"Trace_Id" is not a field of the CloudEvent/, (d) => editJson(d, OVERDUE, (e) => (e.Trace_Id = "x"))],
  [OSFP, "[examples] an event misspells a CloudEvents attribute", /\[examples\].*"datacontentype" looks like a misspelling of "datacontenttype"/, (d) =>
    editJson(d, OVERDUE, (e) => {
      e.datacontentype = e.datacontenttype;
      delete e.datacontenttype;
    })],
  [OSFP, "[examples] an event carries a CloudEvents extension", PASS, (d) => editJson(d, OVERDUE, (e) => (e.traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")), 0],
  [OSFP, "[examples] an event carries another record", /\[examples\].*carries a progress record, not "outcome"/, (d) => editJson(d, OVERDUE, (e) => (e.data.recordType = "outcome"))],
  [OSFP, "[examples] a statement has another _type", /\[examples\].*_type is not/, (d) => editJson(d, EVIDENCE, (s) => (s._type = "https://in-toto.io/Statement/v0.1"))],
  [OSFP, "[examples] a statement has another predicate type", /\[examples\].*predicateType is not/, (d) => editJson(d, EVIDENCE, (s) => (s.predicateType = "https://slsa.dev/provenance/v1"))],
  [OSFP, "[examples] an event has another specversion", /\[examples\].*specversion is not 1\.0/, (d) => editJson(d, OVERDUE, (e) => (e.specversion = "0.3"))],
  [OSFP, "[examples] an event type names another event than its record", /\[examples\].*the event type says heartbeat/, (d) =>
    editJson(d, OVERDUE, (e) => (e.type = "io.github.sunnypatneedi.osfp.progress.heartbeat"))],
  [OSFP, "[examples] an output digest is a string", /\[examples\].*"outputDigest" is not an in-toto digest set/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].outputDigest = "sha256:abc"))],
  [OSFP, "[examples] a resource carries an unknown field", /\[examples\].*"mode" is not a field of "resources"/, (d) => editJson(d, GRANT, (g) => (g.resources[0].mode = "rw"))],
  [OSFP, "[examples] a tool is a string", /\[examples\].*"tools" holds something that is not an object/, (d) => editJson(d, GRANT, (g) => (g.tools = ["read_file"]))],
  [OSFP, "[examples] a field table stops naming a nested field", /\[examples\].*expects "server" inside "tools"/, (d) => replace(d, SPEC, "`server`, an identifier", "server, an identifier")],
  [OSFP, "[examples] a field table stops naming an enum value", /\[examples\].*lists "enforced" as a value of "enforcement"/, (d) =>
    replace(d, SPEC, "which is `enforced` or `instruction`", "which is enforced or instruction")],
  [OSFP, "[examples] a field table stops naming its record type", /\[examples\].*the outcome field table does not say/, (d) => replace(d, SPEC, "| `recordType` is `outcome` |", "| The record type |")],
  [OSFP, "[examples] a record has an unknown record type", /\[examples\].*recordType "verdict" is not one of/, (d) => editJson(d, OUTCOME, (o) => (o.recordType = "verdict"))],
  [OSFP, "[examples] an example is not JSON", /\[examples\].*is not valid JSON/, (d) => writeFileSync(join(d, OUTCOME), "{\n")],
  [OSFP, "[examples] a statement carries no record", /\[examples\].*carries no OSFP record/, (d) => editJson(d, EVIDENCE, (s) => (s.predicate = "passed"))],

  // check-osfp.mjs [rules]: one example at a time.
  [OSFP, "[rules] a timestamp has an offset instead of Z", /OSFP\.GE\.2/, (d) => editJson(d, "examples/task-grant.json", (g) => (g.approvedAt = "2026-11-11T18:00:00+00:00"))],
  [OSFP, "[rules] a disclosure loses its revision", /OSFP\.AU\.8/, (d) => editJson(d, "examples/task-grant.json", (g) => delete g.disclosures[0].revision)],
  [OSFP, "[rules] a grant expires before it was approved", /section 7.*expire after/, (d) =>
    editJson(d, "examples/task-grant-retry.json", (g) => (g.expiresAt = "2026-11-11T18:05:00Z"))],
  [OSFP, "[rules] evidence names the tree by a file digest", /OSFP\.EV\.1.*has no subject that names the checked tree/, (d) =>
    editJson(d, "examples/verification-evidence.json", (s) => (s.subject[0].digest = { sha256: "0".repeat(64) }))],
  [OSFP, "[rules] the subject names a different tree from the checks", /OSFP\.EV\.1.*subject does not name/, (d) =>
    editJson(d, "examples/verification-evidence.json", (s) => (s.subject[0].digest = { gitTree: "f".repeat(40) }))],
  [OSFP, "[rules] a check names its tree by a file digest", /section 9.*gitTree or dirHash/, (d) =>
    editJson(d, "examples/verification-evidence.json", (s) => (checksOf(s)[0].treeAtEnd = { sha256: "0".repeat(64) }))],
  [OSFP, "[rules] a fully skipped suite reports passed", /OSFP\.EV\.3/, (d) => editJson(d, "examples/verification-evidence.json", (s) => (checksOf(s)[1].status = "passed"))],
  [OSFP, "[rules] a check passes with a failing exit status", /OSFP\.EV\.3/, (d) => editJson(d, "examples/verification-evidence.json", (s) => (checksOf(s)[0].exitStatus = 1))],
  [OSFP, "[rules] the tree changes under a passed check", /OSFP\.EV\.5/, (d) =>
    editJson(d, "examples/verification-evidence.json", (s) => (checksOf(s)[0].treeAtEnd = { gitTree: "f".repeat(40) }))],
  [OSFP, "[rules] a check changed its own test but names no path", /OSFP\.EV\.6/, (d) => editJson(d, "examples/verification-evidence.json", (s) => (checksOf(s)[0].inputsChanged = true))],
  [OSFP, "[rules] a check names a changed path but says nothing changed", /OSFP\.EV\.6/, (d) =>
    editJson(d, "examples/verification-evidence.json", (s) => (checksOf(s)[0].changedInputs = ["tests/test_widgets.py"]))],
  [OSFP, "[rules] a progress record does not name its event", /OSFP\.PR\.7/, (d) => {
    const event = JSON.parse(readFileSync(join(d, "examples/progress-overdue.json"), "utf8"));
    remove(d, "examples/progress-overdue.json");
    const { event: _, ...record } = event.data;
    addJson(d, "examples/progress-overdue.json", record);
  }],
  [OSFP, "[rules] a task is overdue before it was expected", /section 10.*before the task was expected/, (d) =>
    editJson(d, "examples/progress-overdue.json", (e) => (e.data.expectedAt = "2026-11-12T04:00:00Z"))],
  [OSFP, "[rules] a record has no id", /OSFP\.GE\.1.*has no id/, (d) => editJson(d, OUTCOME, (o) => delete o.id)],
  [OSFP, "[rules] a record names another version", /version: .*has osfpVersion/, (d) => editJson(d, OUTCOME, (o) => (o.osfpVersion = "0.1.0-draft.2"))],
  [OSFP, "[rules] a grant names no approver", /OSFP\.AU\.2.*names no approver/, (d) => editJson(d, GRANT, (g) => delete g.approvedBy)],
  [OSFP, "[rules] a grant does not list its tools", /OSFP\.AU\.4.*does not list its tools/, (d) => editJson(d, GRANT, (g) => delete g.tools)],
  [OSFP, "[rules] a restriction has no enforcement", /OSFP\.AU\.7/, (d) => editJson(d, GRANT, (g) => delete g.restrictions[1].enforcement)],
  [OSFP, "[rules] a tool names no server", /OSFP\.PF\.2/, (d) => editJson(d, GRANT, (g) => delete g.tools[0].server)],
  [OSFP, "[rules] a grant states no total budget", /OSFP\.PR\.1/, (d) => editJson(d, GRANT, (g) => delete g.limits.totalSeconds)],
  [OSFP, "[rules] a standing grant also names a task", /section 7.*names both or neither/, (d) => editJson(d, STANDING, (g) => (g.taskId = U("0000000000a9")))],
  [OSFP, "[rules] a grant has generation 0", /section 7.*no positive generation/, (d) => editJson(d, GRANT, (g) => (g.generation = 0))],
  [OSFP, "[rules] a derived grant names a schedule instead of a task", /section 7.*names no task/, (d) =>
    editJson(d, SCHEDULED, (g) => {
      delete g.taskId;
      g.scheduleId = U("0000000000d1");
    })],
  [OSFP, "[rules] a standing grant lists unknown attempts", /section 7.*unknownAttempts/, (d) => editJson(d, STANDING, (g) => (g.unknownAttempts = [U("0000000000b1")]))],
  [OSFP, "[rules] an inspection flag is a string", /section 7.*inspection flag/, (d) => editJson(d, STANDING, (g) => (g.inspection = "yes"))],
  [OSFP, "[rules] a grant without an expiry passes", PASS, (d) => editJson(d, GRANT, (g) => delete g.expiresAt), 0],
  [OSFP, "[rules] a leap second is a valid time", PASS, (d) => editJson(d, STANDING, (g) => (g.expiresAt = "2026-12-31T23:59:60Z")), 0],
  [OSFP, "[rules] an outcome has sequence 0", /section 8.*no positive sequence/, (d) => editJson(d, OUTCOME, (o) => (o.sequence = 0))],
  [OSFP, "[rules] an outcome has no stateAt", /section 8.*no stateAt/, (d) => editJson(d, OUTCOME, (o) => delete o.stateAt)],
  [OSFP, "[rules] a stop is confirmed but never requested", /OSFP\.OU\.7.*never requested/, (d) =>
    editJson(d, OUTCOME, (o) => {
      delete o.stopRequestedAt;
      o.stopConfirmedAt = "2026-11-11T18:01:30Z";
    })],
  [OSFP, "[rules] cleanup is confirmed and the stop is not", /OSFP\.OU\.7.*cleanup before the stop was confirmed/, (d) => editJson(d, OUTCOME, (o) => (o.cleanupConfirmedAt = "2026-11-11T18:02:00Z"))],
  [OSFP, "[rules] a stop is confirmed before it was requested", /OSFP\.OU\.7.*before it was requested/, (d) => editJson(d, OUTCOME, (o) => (o.stopConfirmedAt = "2026-11-11T18:00:30Z"))],
  [OSFP, "[rules] cleanup is confirmed before the stop", /OSFP\.OU\.7.*confirms cleanup before the stop(?! was)/, (d) =>
    editJson(d, OUTCOME, (o) => Object.assign(o, { stopConfirmedAt: "2026-11-11T18:01:40Z", cleanupConfirmedAt: "2026-11-11T18:01:20Z" }))],
  [OSFP, "[rules] a check counts more failures than units", /section 9.*does not count its units/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].unitsFailed = 300))],
  [OSFP, "[rules] a check is failed without a failed unit", /section 9.*is failed without/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[1].status = "failed"))],
  [OSFP, "[rules] a check that exited with failure after it examined units is failed", PASS, (d) =>
    editJson(d, EVIDENCE, (s) => Object.assign(checksOf(s)[0], { status: "failed", exitStatus: 2 })), 0],
  [OSFP, "[rules] a not-run check examined units", /section 9.*is not-run but examined units/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[1].unitsExamined = 5))],
  [OSFP, "[rules] an exit status is a string", /OSFP\.EV\.4.*not an integer/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].exitStatus = "0"))],
  [OSFP, "[rules] a passed check records no exit status", /OSFP\.EV\.4.*records no exit status/, (d) => editJson(d, EVIDENCE, (s) => delete checksOf(s)[0].exitStatus)],
  [OSFP, "[rules] a not-run check with no exit status passes", PASS, (d) => editJson(d, EVIDENCE, (s) => delete checksOf(s)[1].exitStatus), 0],
  [OSFP, "[rules] answersReachable is a string", /OSFP\.EV\.7/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].answersReachable = "no"))],
  [OSFP, "[rules] a verifier that cannot tell leaves both flags out", PASS, (d) =>
    editJson(d, EVIDENCE, (s) => ["inputsChanged", "changedInputs", "answersReachable"].forEach((k) => delete checksOf(s)[0][k])), 0],
  [OSFP, "[rules] a success status is a string", /section 9.*success status that is not an integer/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].successStatus = "1"))],
  [OSFP, "[rules] a check whose tool documents success as 1 passes", PASS, (d) => editJson(d, EVIDENCE, (s) => Object.assign(checksOf(s)[0], { exitStatus: 1, successStatus: 1 })), 0],
  [OSFP, "[rules] the subject also carries a commit digest", PASS, (d) => editJson(d, EVIDENCE, (s) => (s.subject[0].digest.gitCommit = "a".repeat(40))), 0],
  [OSFP, "[rules] the statement also names the SARIF file", PASS, (d) => editJson(d, EVIDENCE, (s) => s.subject.push({ name: "findings.sarif", digest: { sha256: "0".repeat(64) } })), 0],
  [OSFP, "[rules] a record has no osfpVersion", /OSFP\.GE\.1.*has no osfpVersion/, (d) => editJson(d, OUTCOME, (o) => delete o.osfpVersion)],
  [OSFP, "[rules] a record has no recordType", /OSFP\.GE\.1.*has no recordType/, (d) => editJson(d, OUTCOME, (o) => delete o.recordType)],
  [OSFP, "[rules] a grant has no approval time", /OSFP\.AU\.2.*no approval time/, (d) => editJson(d, GRANT, (g) => delete g.approvedAt)],
  [OSFP, "[rules] a CloudEvent time has an offset instead of Z", /OSFP\.GE\.2.*has time/, (d) => editJson(d, OVERDUE, (e) => (e.time = "2026-11-12T03:50:00+00:00"))],
  [OSFP, "[rules] a grant does not list its operations", /OSFP\.AU\.4.*does not list its operations/, (d) => editJson(d, GRANT, (g) => delete g.operations)],
  [OSFP, "[rules] a grant does not list its resources", /OSFP\.AU\.4.*does not list its resources/, (d) => editJson(d, GRANT, (g) => delete g.resources)],
  [OSFP, "[rules] a grant does not list its disclosures", /OSFP\.AU\.4.*does not list its disclosures/, (d) => editJson(d, GRANT, (g) => delete g.disclosures)],
  [OSFP, "[rules] a restriction has no target", /OSFP\.AU\.7/, (d) => editJson(d, GRANT, (g) => delete g.restrictions[1].target)],
  [OSFP, "[rules] a restriction has no rule", /OSFP\.AU\.7/, (d) => editJson(d, GRANT, (g) => delete g.restrictions[1].rule)],
  [OSFP, "[rules] a disclosure has no destination", /OSFP\.AU\.8/, (d) => editJson(d, GRANT, (g) => delete g.disclosures[0].destination)],
  [OSFP, "[rules] a disclosure has no source", /OSFP\.AU\.8/, (d) => editJson(d, GRANT, (g) => delete g.disclosures[0].source)],
  [OSFP, "[rules] a tool has no name", /OSFP\.PF\.2/, (d) => editJson(d, GRANT, (g) => delete g.tools[0].name)],
  [OSFP, "[rules] a grant states no start deadline", /OSFP\.PR\.1/, (d) => editJson(d, GRANT, (g) => delete g.limits.startAckSeconds)],
  [OSFP, "[rules] a grant names neither a task nor a schedule", /section 7.*names both or neither/, (d) => editJson(d, GRANT, (g) => delete g.taskId)],
  [OSFP, "[rules] unknownAttempts is a string", /section 7.*unknownAttempts/, (d) => editJson(d, RETRY, (g) => (g.unknownAttempts = U("0000000000b1")))],
  [OSFP, "[rules] unknownAttempts holds an empty entry", /section 7.*unknownAttempts/, (d) => editJson(d, RETRY, (g) => (g.unknownAttempts = [""]))],
  [OSFP, "[rules] only a digest that is not a tree digest matches the checked tree", /OSFP\.EV\.1.*checked a tree the subject does not name/, (d) =>
    editJson(d, EVIDENCE, (s) => {
      s.subject = [{ name: "other-tree", digest: { gitTree: "f".repeat(40) } }, { name: "checked-tree", digest: { sha256: "0".repeat(64) } }];
      for (const c of checksOf(s)) c.treeAtStart.sha256 = "0".repeat(64);
    })],
  [OSFP, "[rules] a check names its starting tree by a file digest", /section 9.*names its tree without/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].treeAtStart = { sha256: "0".repeat(64) }))],
  [OSFP, "[rules] a check does not count its skipped units", /section 9.*does not count its units/, (d) => editJson(d, EVIDENCE, (s) => delete checksOf(s)[0].unitsSkipped)],
  [OSFP, "[rules] a check counts negative units", /section 9.*does not count its units/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].unitsSkipped = -3))],
  [OSFP, "[rules] a check that examined nothing is failed", /section 9.*is failed without/, (d) => editJson(d, EVIDENCE, (s) => Object.assign(checksOf(s)[1], { status: "failed", exitStatus: 1 }))],
  [OSFP, "[rules] an incomplete check with no exit status passes", PASS, (d) =>
    editJson(d, EVIDENCE, (s) => {
      checksOf(s)[0].status = "incomplete";
      delete checksOf(s)[0].exitStatus;
    }), 0],
  [OSFP, "[rules] a check says only where the attempt changed it", /OSFP\.EV\.6/, (d) => editJson(d, EVIDENCE, (s) => delete checksOf(s)[0].inputsChanged)],
  [OSFP, "[rules] inputsChanged is a string", /OSFP\.EV\.6/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].inputsChanged = "no"))],
  [OSFP, "[rules] a failed check with a failed unit and a success exit passes", PASS, (d) => editJson(d, EVIDENCE, (s) => Object.assign(checksOf(s)[0], { status: "failed", unitsFailed: 5 })), 0],
  [OSFP, "[rules] an ended event carries a limit", /section 10.*carries "limit"/, (d) => addJson(d, "examples/progress-ended.json", endedEvent({ limit: "totalSeconds" }))],
  [OSFP, "[rules] an overdue event carries an action", /section 10.*carries "action"/, (d) => editJson(d, OVERDUE, (e) => (e.data.action = "Requested a stop."))],
  [OSFP, "[rules] a limit-expired event carries a state", /section 10.*carries "state"/, (d) => editJson(d, EXPIRED, (e) => (e.data.state = "failed"))],
  [OSFP, "[rules] a limit-expired event carries a result", /section 10.*carries "result"/, (d) => editJson(d, EXPIRED, (e) => (e.data.result = "clean"))],
  [OSFP, "[rules] a limit-expired event names no task", /section 10.*does not name its task and its attempt/, (d) => editJson(d, EXPIRED, (e) => delete e.data.taskId)],
  [OSFP, "[rules] an ended event carries an overdue result", /section 10.*result "missed"/, (d) => addJson(d, "examples/progress-ended.json", endedEvent({ result: "missed" }))],
  [OSFP, "[rules] a limit-expired event names no action", /section 10.*without its limit or its action/, (d) => editJson(d, EXPIRED, (e) => delete e.data.action)],
  [OSFP, "[rules] an overdue event has no expectedAt", /section 10.*without its result or expectedAt/, (d) => editJson(d, OVERDUE, (e) => delete e.data.expectedAt)],
  [OSFP, "[rules] a derived grant adds a disclosure", /OSFP\.AU\.6.*a disclosure that the standing grant lacks/, (d) =>
    editJson(d, SCHEDULED, (g) => g.disclosures.push({ source: "https://git.example.com/acme/widgets.git#README.md", revision: "a".repeat(40), destination: "harness:example-coder" }))],
  [OSFP, "[rules] a derived grant has a longer start deadline", /OSFP\.AU\.6.*longer or missing startAckSeconds/, (d) => editJson(d, SCHEDULED, (g) => (g.limits.startAckSeconds = 600))],
  [OSFP, "[examples] an output digest is a list", /\[examples\].*"outputDigest" is not an in-toto digest set/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].outputDigest = ["0".repeat(64)]))],
  [OSFP, "[examples] an output digest is empty", /\[examples\].*"outputDigest" is not an in-toto digest set/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].outputDigest = {}))],
  [OSFP, "[examples] an output digest has an empty value", /\[examples\].*"outputDigest" is not an in-toto digest set/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].outputDigest = { sha256: "" }))],
  [OSFP, "[examples] findings is one digest set, not a list", /\[examples\].*"findings" is not a list of in-toto digest sets/, (d) => editJson(d, EVIDENCE, (s) => (s.predicate.findings = { sha256: "0".repeat(64) }))],
  [OSFP, "[examples] a findings entry is not a digest set", /\[examples\].*"findings" is not a list of in-toto digest sets/, (d) => editJson(d, EVIDENCE, (s) => (s.predicate.findings = ["sha256:abc"]))],
  [OSFP, "[rules] a passed check counts a failed unit", /OSFP\.EV\.3/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].unitsFailed = 1))],
  [OSFP, "[rules] a passed check lost part of its output", /OSFP\.EV\.5/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].outputComplete = false))],
  [OSFP, "[rules] a dirHash changes under a check while its gitTree does not", /OSFP\.EV\.5/, (d) =>
    editJson(d, EVIDENCE, (s) => {
      checksOf(s)[0].treeAtStart.dirHash = "a".repeat(64);
      checksOf(s)[0].treeAtEnd.dirHash = "b".repeat(64);
    })],
  [OSFP, "[rules] a check's two tree digests share no algorithm", /OSFP\.EV\.5/, (d) => editJson(d, EVIDENCE, (s) => (checksOf(s)[0].treeAtEnd = { dirHash: "b".repeat(64) }))],
  [OSFP, "[rules] a limit-expired event carries expectedAt", /section 10.*carries "expectedAt"/, (d) => editJson(d, EXPIRED, (e) => (e.data.expectedAt = "2026-11-11T18:00:00Z"))],
  [OSFP, "[rules] an overdue event carries an inspection result", /section 10.*result "clean"/, (d) => editJson(d, OVERDUE, (e) => (e.data.result = "clean"))],
  [OSFP, "[rules] a limit-expired event names no limit", /section 10.*without its limit or its action/, (d) => editJson(d, EXPIRED, (e) => delete e.data.limit)],
  [OSFP, "[rules] a limit-expired event names no attempt", /section 10.*does not name its task and its attempt/, (d) => editJson(d, EXPIRED, (e) => delete e.data.attemptId)],
  [OSFP, "[rules] an overdue event has no result", /section 10.*without its result or expectedAt/, (d) => editJson(d, OVERDUE, (e) => delete e.data.result)],
  [OSFP, "[rules] an unfinished task names no attempt", /section 10.*names no attempt/, (d) => editJson(d, OVERDUE, (e) => (e.data.result = "unfinished"))],
  [OSFP, "[rules] a missed task names the attempt that was dispatched", PASS, (d) => {
    editJson(d, OVERDUE, (e) => (e.data.attemptId = U("0000000000b3")));
    dispatchB3(d, "2026-11-12T03:35:30Z");
  }, 0],
  [OSFP, "[rules] an ended event has no terminal state", /section 10.*without a terminal state/, (d) => addJson(d, "examples/progress-ended.json", endedEvent({ state: "started" }))],
  [OSFP, "[rules] the CloudEvent time differs from occurredAt", /section 10.*CloudEvent time/, (d) => editJson(d, OVERDUE, (e) => (e.time = "2026-11-12T03:51:00Z"))],
  [OSFP, "[rules] a progress record does not say when", /OSFP\.PR\.7.*when its event happened/, (d) => editJson(d, OVERDUE, (e) => delete e.data.occurredAt)],

  // check-osfp.mjs [rules]: across the examples.
  [OSFP, "[rules] an attempt's task has no grant", /OSFP\.AU\.1/, (d) => editJson(d, DISPATCHED_RETRY, (e) => (e.data.taskId = U("0000000000a3")))],
  [OSFP, "[rules] a derived grant permits more than its standing grant", /OSFP\.AU\.6.*publish/, (d) => editJson(d, "examples/task-grant-scheduled.json", (g) => g.operations.push("publish"))],
  [OSFP, "[rules] a derived grant outlives its standing grant", /OSFP\.AU\.6.*later/, (d) => editJson(d, "examples/task-grant-scheduled.json", (g) => (g.expiresAt = "2027-06-01T00:00:00Z"))],
  [OSFP, "[rules] a derived grant drops a restriction", /OSFP\.AU\.6.*restriction on network/, (d) => editJson(d, "examples/task-grant-scheduled.json", (g) => (g.restrictions = []))],
  [OSFP, "[rules] a derived grant has no expiry", /OSFP\.AU\.6.*missing expiry/, (d) => editJson(d, "examples/task-grant-scheduled.json", (g) => delete g.expiresAt)],
  [OSFP, "[rules] a derived grant derives from nothing", /OSFP\.AU\.6.*not a standing grant/, (d) =>
    editJson(d, "examples/task-grant-scheduled.json", (g) => {
      g.derivedFrom = U("0000000000ff");
      g.operations.push("merge");
    })],
  [OSFP, "[rules] a second attempt starts with no grant after the unknown", /OSFP\.OU\.5/, (d) => remove(d, "examples/task-grant-retry.json")],
  [OSFP, "[rules] the retry grant does not name the unknown attempt", /OSFP\.OU\.5/, (d) => editJson(d, "examples/task-grant-retry.json", (g) => delete g.unknownAttempts)],
  [OSFP, "[rules] the retry grant comes after the new attempt ran", /OSFP\.OU\.5/, (d) => editJson(d, "examples/task-grant-retry.json", (g) => (g.approvedAt = "2026-11-11T18:30:00Z"))],
  [OSFP, "[rules] a limit expires and nobody requests a stop", /OSFP\.PR\.3/, (d) => editJson(d, "examples/outcome-unknown.json", (o) => delete o.stopRequestedAt)],
  [OSFP, "[rules] a task is reported missed before its start deadline", /OSFP\.PR\.4/, (d) =>
    editJson(d, "examples/progress-overdue.json", (e) => (e.data.expectedAt = "2026-11-12T03:49:00Z"))],
  [OSFP, "[rules] an inspection task ends without a result", /OSFP\.PR\.6/, (d) => {
    editJson(d, "examples/task-grant.json", (g) => (g.inspection = true));
    addJson(d, "examples/progress-ended.json", endedEvent());
  }],
  [OSFP, "[rules] two events share a source and an id", /CloudEvents/, (d) => editJson(d, "examples/progress-overdue.json", (e) => (e.id = U("000000000004")))],
  [OSFP, "[rules] an ended event that completed passes", /Result: 0 violation/, (d) => addJson(d, "examples/progress-ended.json", endedEvent()), 0],
  [OSFP, "[rules] two records share an id", /OSFP\.GE\.1.*reuses the id/, (d) => editJson(d, OUTCOME, (o) => (o.id = U("000000000001")))],
  [OSFP, "[rules] two grants for a task share a generation", /OSFP\.GE\.7.*repeats generation 1/, (d) => editJson(d, RETRY, (g) => (g.generation = 1))],
  [OSFP, "[rules] a derived grant names another approver", /OSFP\.AU\.2.*does not name the person who approved/, (d) => editJson(d, SCHEDULED, (g) => (g.approvedBy = "mailto:other@example.com"))],
  [OSFP, "[rules] a derived grant carries its own approval time", /section 7.*approval time/, (d) => editJson(d, SCHEDULED, (g) => (g.approvedAt = "2026-11-11T21:00:00Z"))],
  [OSFP, "[rules] a derived grant drops the inspection flag", /OSFP\.AU\.6.*inspection/, (d) => editJson(d, SCHEDULED, (g) => (g.inspection = false))],
  [OSFP, "[rules] a derived grant widens access", /OSFP\.AU\.6.*write access/, (d) => editJson(d, SCHEDULED, (g) => (g.resources[0].access = "write"))],
  [OSFP, "[rules] a derived grant adds a tool", /OSFP\.AU\.6.*a tool that the standing grant lacks/, (d) => editJson(d, SCHEDULED, (g) => g.tools.push({ server: "example-files", name: "read_file" }))],
  [OSFP, "[rules] a derived grant has a longer budget", /OSFP\.AU\.6.*longer or missing totalSeconds/, (d) => editJson(d, SCHEDULED, (g) => (g.limits.totalSeconds = 3600))],
  [OSFP, "[rules] a missed task has no grant", /OSFP\.PR\.4.*no grant/, (d) => editJson(d, OVERDUE, (e) => (e.data.taskId = U("0000000000a9")))],
  [OSFP, "[rules] a missed task names another schedule", /OSFP\.PR\.4.*schedule other than/, (d) => editJson(d, OVERDUE, (e) => (e.data.scheduleId = U("0000000000d9")))],
  [OSFP, "[rules] an attempt is dispatched after its task's grant expired", /OSFP\.AU\.1.*did not permit dispatch/, (d) =>
    editJson(d, DISPATCHED_RETRY, (e) => {
      e.time = "2026-11-12T19:00:00Z";
      e.data.occurredAt = e.time;
    })],
  [OSFP, "[rules] evidence checked after the grant expired is not a dispatch", PASS, (d) => editJson(d, EVIDENCE, (s) => (s.predicate.checkedAt = "2026-11-12T19:00:00Z")), 0],
  [OSFP, "[rules] an attempt is dispatched after a later grant revoked authority", /OSFP\.AU\.1.*did not permit dispatch/, (d) =>
    copyJson(d, GRANT, "examples/task-grant-revoked.json", (g) =>
      Object.assign(g, { id: U("00000000000d"), generation: 3, resources: [], operations: [], disclosures: [], tools: [], restrictions: [], approvedAt: "2026-11-11T18:10:30Z" }))],
  [OSFP, "[rules] a scheduled attempt is dispatched after its schedule was revoked", /OSFP\.AU\.1.*did not permit dispatch/, (d) => {
    copyJson(d, STANDING, "examples/task-grant-standing-revoked.json", (g) =>
      Object.assign(g, { id: U("00000000000e"), generation: 2, resources: [], operations: [], disclosures: [], tools: [], restrictions: [], approvedAt: "2026-11-05T09:00:00Z" }));
    dispatchB3(d, "2026-11-12T03:36:00Z");
  }],
  [OSFP, "[rules] an attempt has no dispatched event", /OSFP\.PR\.5.*no dispatched event/, (d) => remove(d, DISPATCHED)],
  [OSFP, "[rules] a grant that a factory recorded cannot answer for an unknown attempt", /OSFP\.OU\.5/, (d) => {
    editJson(d, RETRY, (g) => {
      g.generation = 3;
      delete g.unknownAttempts;
    });
    copyJson(d, GRANT, "examples/task-grant-revoked.json", (g) =>
      Object.assign(g, { id: U("00000000000d"), generation: 2, resources: [], operations: [], disclosures: [], tools: [], restrictions: [], unknownAttempts: [U("0000000000b1")], approvedBy: "urn:example:factory", approvedAt: "2026-11-11T18:05:00Z" }));
  }],
  [OSFP, "[rules] a factory revokes a task without a person", PASS, (d) =>
    copyJson(d, GRANT, "examples/task-grant-revoked.json", (g) =>
      Object.assign(g, { id: U("00000000000d"), generation: 3, resources: [], operations: [], disclosures: [], tools: [], restrictions: [], approvedBy: "urn:example:factory", approvedAt: "2026-11-11T18:25:00Z" })), 0],
  [OSFP, "[rules] a factory revokes a nightly task and keeps its restrictions", PASS, (d) =>
    copyJson(d, SCHEDULED, "examples/task-grant-scheduled-revoked.json", (g) =>
      Object.assign(g, { id: U("00000000000e"), generation: 2, resources: [], operations: [], approvedBy: "urn:example:factory", approvedAt: "2026-11-11T21:00:00Z" })), 0],
  [OSFP, "[rules] a later revocation does not reach an earlier attempt", PASS, (d) =>
    copyJson(d, GRANT, "examples/task-grant-revoked.json", (g) =>
      Object.assign(g, { id: U("00000000000d"), generation: 3, resources: [], operations: [], disclosures: [], tools: [], restrictions: [], approvedAt: "2026-11-11T19:00:00Z" })), 0],
  [OSFP, "[rules] a derived grant adds a resource", /OSFP\.AU\.6.*read access to https:\/\/git\.example\.com\/acme\/other\.git/, (d) =>
    editJson(d, SCHEDULED, (g) => g.resources.push({ uri: "https://git.example.com/acme/other.git", access: "read" }))],
  [OSFP, "[rules] a standing grant and its derived grant without expiries pass", PASS, (d) => {
    editJson(d, STANDING, (g) => delete g.expiresAt);
    editJson(d, SCHEDULED, (g) => delete g.expiresAt);
  }, 0],
  [OSFP, "[rules] a derived grant derives from a task grant", /OSFP\.AU\.6.*not a standing grant/, (d) => editJson(d, SCHEDULED, (g) => (g.derivedFrom = U("000000000001")))],
  [OSFP, "[rules] the retry grant was approved before the attempt went unknown", /OSFP\.OU\.5/, (d) => editJson(d, RETRY, (g) => (g.approvedAt = "2026-11-11T18:02:00Z"))],
  [OSFP, "[rules] two outcomes of an attempt share a sequence", /OSFP\.GE\.7.*repeats sequence 2/, (d) =>
    copyJson(d, OUTCOME, "examples/outcome-failed.json", (o) => Object.assign(o, { id: U("000000000011"), state: "failed", stateAt: "2026-11-11T18:03:00Z" }))],
  [OSFP, "[rules] an attempt leaves a terminal state", /OSFP\.GE\.7.*leaves the terminal state canceled/, (d) => {
    copyJson(d, OUTCOME, "examples/outcome-canceled.json", (o) => Object.assign(o, { id: U("000000000012"), sequence: 3, state: "canceled", stateAt: "2026-11-11T18:04:00Z", stopConfirmedAt: "2026-11-11T18:04:00Z" }));
    copyJson(d, OUTCOME, "examples/outcome-restarted.json", (o) => Object.assign(o, { id: U("000000000013"), sequence: 4, state: "started", stateAt: "2026-11-11T18:05:00Z", stopConfirmedAt: "2026-11-11T18:04:00Z" }));
  }],
  [OSFP, "[rules] a canceled attempt confirms its cleanup later", PASS, (d) => {
    copyJson(d, OUTCOME, "examples/outcome-canceled.json", (o) => Object.assign(o, { id: U("000000000012"), sequence: 3, state: "canceled", stateAt: "2026-11-11T18:04:00Z", stopConfirmedAt: "2026-11-11T18:04:00Z" }));
    copyJson(d, OUTCOME, "examples/outcome-cleaned.json", (o) =>
      Object.assign(o, { id: U("000000000013"), sequence: 4, state: "canceled", stateAt: "2026-11-11T18:04:00Z", stopConfirmedAt: "2026-11-11T18:04:00Z", cleanupConfirmedAt: "2026-11-11T18:06:00Z" }));
  }, 0],

  // check-osfp.mjs [classes] and [references].
  [OSFP, "[classes] a rule loses a class in the data only", /\[classes\].*OSFP\.EV\.9/, (d) => editJson(d, DATA, (doc) => (item(doc, "OSFP.EV.9").classes = ["factory"]))],
  [OSFP, "[classes] the conformance table drops a rule", /\[classes\].*OSFP\.PR\.4/, (d) => replace(d, SPEC, "`OSFP.PR.2` to `OSFP.PR.4`", "`OSFP.PR.2`, `OSFP.PR.3`")],
  [OSFP, "[classes] the visible row drops rules and a hidden row keeps them", /\[classes\].*OSFP\.EV\.10/, (d) =>
    replace(d, SPEC, "`OSFP.EV.10` to `OSFP.EV.12`, ", "<!-- `OSFP.EV.10` to `OSFP.EV.12` -->")],
  [OSFP, "[references] the prose cites a key with no reference", /\[references\].*\[made-up\]/, (d) =>
    replace(d, SPEC, "OSFP gives those records one meaning.", "OSFP gives those records one meaning [made-up].")],
  [OSFP, "[references] a bibliography URL drifts from its reference", /\[references\].*\[sarif\]/, (d) =>
    editJson(d, DATA, (doc) => (doc.bibliography.find((b) => b.key === "sarif").url = "https://example.com/sarif"))],
  [OSFP, "[references] a reference moves and a hidden copy keeps the old one", /\[references\].*\[a2a-spec\]/, (d) =>
    replace(d, SPEC, "https://a2a-protocol.org/v1.0.1/specification/\n", "https://a2a-protocol.org/v0.3.0/specification/\n<!-- - [a2a-spec] \"A2A\". https://a2a-protocol.org/v1.0.1/specification/ -->\n")],
  [OSFP, "[rules] another task writes the same repository while an attempt is unknown", /OSFP\.OU\.5.*no grant for its task that names that attempt/, (d) => otherWriter(d, {})],
  [OSFP, "[rules] another task's grant names the unknown attempt", PASS, (d) => otherWriter(d, { unknownAttempts: [U("0000000000b1")], approvedAt: "2026-11-11T18:04:30Z" }), 0],
  [OSFP, "[rules] another task only reads the repository", PASS, (d) => otherWriter(d, { resources: [{ uri: "https://git.example.com/acme/widgets.git", access: "read" }] }), 0],
  [OSFP, "[rules] an attempt is canceled while its stop is unconfirmed", /OSFP\.OU\.10/, (d) => editJson(d, OUTCOME, (o) => (o.state = "canceled"))],
  [OSFP, "[rules] an outcome ends unknown without saying how", /OSFP\.OU\.11/, (d) =>
    copyJson(d, OUTCOME, "examples/outcome-ended.json", (o) => {
      Object.assign(o, { id: U("00000000001f"), sequence: 3, state: "failed", stateAt: "2026-11-11T18:06:00Z", stopConfirmedAt: "2026-11-11T18:05:00Z", cleanupConfirmedAt: "2026-11-11T18:05:30Z" });
      delete o.note;
    })],
  [OSFP, "[rules] the prose stops calling completed terminal", /without a terminal state/, (d) =>
    replace(d, SPEC, "`completed`, `failed`, `canceled`, and `rejected` are **terminal**", "`failed`, `canceled`, and `rejected` are **terminal**")],
  [OSFP, "[rules] the prose moves the state field to another event", /is an ended event that carries "state"/, (d) => replace(d, SPEC, "| `state` | `ended` only:", "| `state` | `limit-expired` only:")],
  [OSFP, "[rules] the prose renames an overdue result", /result "missed"|"missed" is not a value of "result"/, (d) => replace(d, SPEC, "On `overdue`: `missed` or `unfinished`", "On `overdue`: `late` or `unfinished`")],
  [OSFP, "[could-not-run] section 8 names no terminal states", /\[could-not-run\].*terminal states/, (d) => replace(d, SPEC, "are **terminal**", "are **final**"), 2],
  [OSFP, "[structure] a rule wrapped onto two lines passes", PASS, (d) => wrapRule(d), 0],
  [STANDARD, "[text] a rule wrapped onto two lines passes", PASS, (d) => wrapRule(d), 0],
  [OSFP, "[structure] README gives a wrong rule count", /\[structure\].*README\.md says the standard has 1 rules/, (d) => replaceMatch(d, "README.md", /The standard has \d+ rules/, "The standard has 1 rules")],
  [OSFP, "[structure] README gives a class a wrong rule count", /\[structure\].*gives the Verifier class 1 rules/, (d) => replaceMatch(d, "README.md", /\| Verifier \| \d+ \|/, "| Verifier | 1 |")],
  [OSFP, "[structure] README loses its table of classes", /\[structure\].*no table of classes/, (d) => replace(d, "README.md", "| Your product | Its class | Rules |", "| Your product | Its class | Count |")],
  [OSFP, "[records] a directory of correct records passes", PASS, (d) => cpSync(join(d, "examples"), join(d, "my-records"), { recursive: true }), 0, (d) => ["--records", join(d, "my-records")]],
  [OSFP, "[records] a wrong record fails, named by its directory", /\[examples\].*my-records\/outcome-unknown\.json/, (d) => {
    cpSync(join(d, "examples"), join(d, "my-records"), { recursive: true });
    editJson(d, "my-records/outcome-unknown.json", (o) => (o.state = "done"));
  }, 1, (d) => ["--records", join(d, "my-records")]],
  [OSFP, "[records] the standard's own checks do not report", PASS, (d) => {
    cpSync(join(d, "examples"), join(d, "my-records"), { recursive: true });
    replaceMatch(d, "README.md", /The standard has \d+ rules/, "The standard has 1 rules");
  }, 0, (d) => ["--records", join(d, "my-records")]],
  [OSFP, "[could-not-run] --records without a directory", /\[could-not-run\].*usage/, () => {}, 2, ["--records"]],
  [OSFP, "[classes] two rows name one class", /\[classes\].*two rows for "consumer"/, (d) =>
    replace(d, SPEC, "| Consumer | Reads OSFP records |", "| Consumer | Reads OSFP records | `OSFP.GE.4` |\n| Consumer | Reads OSFP records |")],
  [OSFP, "[classes] a row lists a rule that the data does not give its class", /\[classes\].*consumer row lists OSFP\.EV\.12/, (d) =>
    {
      const row = rowLine(d, SPEC, "Consumer");
      replace(d, SPEC, row, row.replace(/ \|$/, ", `OSFP.EV.12` |"));
    }],
  [OSFP, "[classes] a part of a row is not an ID", /\[classes\].*not an ID or a range of IDs in one area/, (d) => {
    const row = rowLine(d, SPEC, "Consumer");
    replace(d, SPEC, row, row.replace("`OSFP.EV.11`", "EV.11"));
  }],
  [OSFP, "[could-not-run] section 9 names no predicate type", /\[could-not-run\].*predicate type/, (d) =>
    replace(d, SPEC, "`https://github.com/sunnypatneedi/OSFP/blob/main/predicates/verification-evidence/v0.1.md`\n", ""), 2],
  [OSFP, "[could-not-run] the data has no items", /\[could-not-run\].*no items or no bibliography/, (d) => editJson(d, DATA, (doc) => delete doc.items), 2],
  [OSFP, "[could-not-run] examples holds no JSON file", /\[could-not-run\].*holds no JSON files/, (d) => {
    for (const name of readdirSync(join(d, "examples"))) if (name.endsWith(".json")) remove(d, `examples/${name}`);
  }, 2],
  [OSFP, "[classes] a range crosses areas", /\[classes\].*not an ID or a range of IDs in one area/, (d) => {
    const row = rowLine(d, SPEC, "Consumer");
    replace(d, SPEC, row, row.replace("`OSFP.GE.4` to `OSFP.GE.6`", "`OSFP.GE.4` to `OSFP.EV.11`"));
  }],
  [OSFP, "[classes] a class loses its row", /\[classes\].*"consumer", but the conformance table has no row/, (d) =>
    replace(d, SPEC, `\n${rowLine(d, SPEC, "Consumer")}`, "")],
  [OSFP, "[classes] a row names a class that no rule has", /\[classes\].*row for "auditor", but no rule names/, (d) =>
    replace(d, SPEC, "| Consumer | Reads OSFP records |", "| Auditor | Reads evidence | `OSFP.EV.11` |\n| Consumer | Reads OSFP records |")],
  [OSFP, "[references] a key has two entries", /\[references\].*\[semver\] has two entries/, (d) => replace(d, SPEC, "- [semver] ", "- [semver] \"Semantic Versioning\". https://semver.org/\n- [semver] ")],
  [OSFP, "[references] an entry that nothing cites", /\[references\].*\[unused\] has an entry/, (d) => replace(d, SPEC, "- [semver] ", "- [unused] \"Unused\". https://example.com/unused\n- [semver] ")],
  [OSFP, "[references] an entry does not end with a URL", /\[references\].*\[agents-md\] in section 18 does not end with a URL/, (d) =>
    replace(d, SPEC, "- [agents-md] \"AGENTS.md\". https://agents.md/", "- [agents-md] \"AGENTS.md\".")],
  [OSFP, "[references] a cited source loses its entry", /\[references\].*bibliography entry sarif .*has no entry/, (d) =>
    replace(d, SPEC, "- [sarif] \"Static Analysis Results Interchange Format (SARIF) Version 2.1.0, OASIS Standard\". https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html\n", "")],
  [OSFP, "[references] an entry loses its DOI", /\[references\].*\[confused-deputy\] .*does not carry its DOI/, (d) => replace(d, SPEC, "DOI 10.1145/54289.871709.", "DOI 10.1145/0000.")],
];

function run(script, dir, args = []) {
  const extra = typeof args === "function" ? args(dir) : args;
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", script), "--root", dir, ...extra], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// The line that each expected exit code is judged by.
const MARKERS = { 0: "Result:", 1: "FAIL", 2: "[could-not-run]" };

// Why a case misbehaved, or "" if it behaved.
function misbehavior(r, code, expected, dir) {
  if (r.out.includes(dir)) return "the output names the temporary directory";
  if (r.code !== code) return `exit ${r.code}, expected ${code}`;
  const lines = r.out.split("\n").filter((line) => line.trimStart().startsWith(MARKERS[code])).join("\n");
  return expected.test(lines) ? "" : `no ${MARKERS[code]} line matched ${expected}`;
}

let bad = 0;
let broken = 0;
const report = (ok, name, why = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${why ? `: ${why}` : ""}`);
};

// Each case runs on its own copy. A case whose edit misses its target is reported, its copy is
// removed, and the remaining cases still run; the run then exits 2, because it could not test it.
function runCase(name, test) {
  const dir = makeCopy();
  try {
    report(...test(dir));
  } catch (e) {
    broken++;
    report(false, name, `[could-not-run] ${e.message}`);
  } finally {
    removeCopy(dir);
  }
}

for (const script of [STANDARD, OSFP]) {
  runCase(`control: ${script} passes on a clean copy`, (dir) => {
    const r = run(script, dir);
    return [r.code === 0, `control: ${script} passes on a clean copy`, r.code === 0 ? "" : `exit ${r.code}\n${r.out}`];
  });
}
for (const [script, name, expected, mutate, code = 1, args = []] of CASES) {
  runCase(`${script} ${name}`, (dir) => {
    mutate(dir);
    const why = misbehavior(run(script, dir, args), code, expected, dir);
    return [!why, `${script} ${name}`, why];
  });
}

const total = CASES.length + 2;
const exit = broken ? 2 : bad ? 1 : 0;
console.log(`${total} cases, ${total - bad} behaved${broken ? `, ${broken} could not run` : ""} → exit ${exit}`);
process.exit(exit);
