#!/usr/bin/env node
// check-osfp.mjs — the checks only OSFP needs. scripts/check-standard.mjs checks the document
// against its data. This script checks the data against its schema, the examples, the
// conformance table, and the references.
//
// Usage: node scripts/check-osfp.mjs [--root <dir>] [--records <dir>]
//        --records checks a directory of your own records, instead of examples/, against the
//        [examples] and [rules] checks. It reads each .json file, also in subdirectories, sets
//        aside Markdown files and names that start with a dot, and fails on any other file. A
//        rule whose records the directory lacks is named as not checked. It is not a conformance test.
// Exit:  0 pass · 1 one or more violations · 2 could not run.
//
// Checks
//   [schema]      spec/standard.json is valid against schema/standard.schema.json. Only the keywords
//                 that schema uses are implemented; any other keyword stops the run (exit 2)
//   [structure]   each section title appears once, BCP 14 key words appear only in the numbered
//                 rules and the BCP 14 declaration, README's rule counts match the data, and CI runs
//                 the three scripts on push and pull_request, with no condition, filter, shell, or
//                 setting that could skip a check or ignore its failure
//   [examples]    each example uses only its own record's fields, each field's own values, and
//                 envelope fields only at the envelope level
//   [rules]       the examples obey the rules a machine can check, one by one and as a set
//   [classes]     the conformance table in section 12 lists exactly the rules whose classes in
//                 spec/standard.json name that class
//   [references]  every [key] in the prose has one entry in section 18, every entry is cited, and
//                 every bibliography URL and DOI in the data appears in its entry
//
// The prose is read with HTML comments removed, so nothing hidden from a reader counts. The
// vocabulary below is read from the prose's tables, and each list is checked against a second
// place that states it, so a reworded sentence stops the run instead of checking less.
// It does not test an implementation, and it cannot tell whether a rule is right.

import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function couldNotRun(msg) {
  console.error(`[could-not-run] ${msg}`);
  process.exit(2);
}
process.on("uncaughtException", (e) => couldNotRun(`internal error: ${e?.message ?? e}`));

const USAGE = "usage: node scripts/check-osfp.mjs [--root <dir>] [--records <dir>]";
const options = {};
for (let i = 0; i < process.argv.length - 2; i += 2) {
  const [flag, value] = process.argv.slice(2 + i, 4 + i);
  if (!["--root", "--records"].includes(flag) || !value || flag in options) couldNotRun(USAGE);
  options[flag] = value;
}
const ROOT = resolve(options["--root"] ?? ".");
// With --records, the records come from that directory, and only [examples] and [rules] report.
const checkingStandard = !options["--records"];
const RECORDS_DIR = checkingStandard ? join(ROOT, "examples") : resolve(options["--records"]);
const RECORDS_LABEL = checkingStandard ? "examples" : basename(RECORDS_DIR);

function readText(path) {
  try {
    return readFileSync(join(ROOT, path), "utf8");
  } catch (e) {
    return couldNotRun(`cannot read ${path}: ${e.code ?? e.message}`);
  }
}
function readJson(path) {
  const text = readText(path);
  try {
    return JSON.parse(text);
  } catch (e) {
    return couldNotRun(`${path} is not valid JSON: ${e.message}`);
  }
}

// Comments are blanked, not cut, so line numbers stay true.
const prose = readText("spec/STANDARD.md").replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ""));
const data = readJson("spec/standard.json");
const schema = readJson("schema/standard.schema.json");
if (!Array.isArray(data.items) || !Array.isArray(data.bibliography)) couldNotRun("spec/standard.json has no items or no bibliography");

// ------------------------------------------------------------------ reporting

const CHECK_NAMES = ["schema", "structure", "examples", "rules", "classes", "references"];
const ORDER = checkingStandard ? CHECK_NAMES : ["examples", "rules"];
const failures = new Map(CHECK_NAMES.map((c) => [c, []]));
const notes = new Map();
const fail = (check, msg) => failures.get(check).push(msg);
const note = (check, msg) => notes.set(check, msg);

// ------------------------------------------------------------------ the prose, read once

// "## 7. Task grant" → sections.get("Task grant") is the text under that heading.
// A title used twice fails: a later section would otherwise replace the tables of the first.
const sections = new Map();
for (const part of prose.split(/^## /m).slice(1)) {
  const [heading, ...body] = part.split("\n");
  const title = heading.replace(/^\d+\.\s*/, "").trim();
  if (sections.has(title)) fail("structure", `spec/STANDARD.md has two sections titled "${title}"`);
  else sections.set(title, body.join("\n"));
}
const section = (title) => sections.get(title) ?? couldNotRun(`spec/STANDARD.md has no "${title}" section`);
const codeWords = (text) => new Set([...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]));

// Each table in a text, as its header cells and its rows of cells.
function tablesIn(text) {
  const tables = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (!line.trimStart().startsWith("|")) {
      current = null;
      continue;
    }
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (!current) tables.push((current = { header: cells, rows: [] }));
    else if (!cells.every((c) => /^:?-+:?$/.test(c))) current.rows.push(cells);
  }
  return tables;
}
function table(title, firstHeader) {
  return tablesIn(section(title)).find((t) => t.header[0] === firstHeader) ?? couldNotRun(`section "${title}" has no table headed "${firstHeader}"`);
}
const firstColumn = (t) => new Set(t.rows.flatMap((r) => [...codeWords(r[0])]));
const rowOf = (t, field) => t.rows.find((r) => codeWords(r[0]).has(field));
const wordsOfRow = (t, field) => codeWords(rowOf(t, field)?.join(" ") ?? "");

// ------------------------------------------------------------------ the vocabulary

// The fields of each record are the first column of its field table.
const RECORDS = {
  "task-grant": table("Task grant", "Field"),
  outcome: table("Outcome", "Field"),
  "verification-evidence": table("Verification evidence", "Predicate field"),
  progress: table("Progress", "Field"),
};
const FIELDS = Object.fromEntries(Object.entries(RECORDS).map(([type, t]) => [type, firstColumn(t)]));
const CHECK_TABLE = table("Verification evidence", "Check field");

// The objects inside a record, and the fields each one holds. Each name must appear in its
// parent's row of the field table.
const NESTED = {
  resources: ["task-grant", ["uri", "access"]],
  disclosures: ["task-grant", ["source", "revision", "destination"]],
  tools: ["task-grant", ["server", "name"]],
  restrictions: ["task-grant", ["target", "rule", "enforcement"]],
  limits: ["task-grant", ["startAckSeconds", "totalSeconds"]],
  harness: ["outcome", ["name", "version"]],
};
const SHAPES = { checks: firstColumn(CHECK_TABLE) };
for (const [parent, [type, names]] of Object.entries(NESTED)) {
  const words = wordsOfRow(RECORDS[type], parent);
  for (const n of names) if (!words.has(n)) fail("examples", `the checker expects "${n}" inside "${parent}", but the ${type} row for "${parent}" does not name it`);
  SHAPES[parent] = new Set(names);
}

// The values of each enum field. A list read from a table's first column comes from the prose;
// a list written here must appear, word for word, in the row of the field it names.
const ENUMS = {
  recordType: { values: Object.keys(RECORDS) },
  access: { table: RECORDS["task-grant"], row: "resources", values: ["read", "write"] },
  operations: { values: [...firstColumn(table("Task grant", "Operation"))] },
  enforcement: { table: RECORDS["task-grant"], row: "restrictions", values: ["enforced", "instruction"] },
  state: { values: [...firstColumn(table("Outcome", "State"))] },
  status: { table: CHECK_TABLE, row: "status", values: ["passed", "failed", "not-run", "incomplete"] },
  event: { values: [...firstColumn(table("Progress", "Event"))] },
  limit: { table: RECORDS.progress, row: "limit", values: ["startAckSeconds", "totalSeconds"] },

};
for (const [field, e] of Object.entries(ENUMS)) {
  if (!e.table) continue;
  const words = wordsOfRow(e.table, e.row);
  for (const v of e.values) if (!words.has(v)) fail("examples", `the checker lists "${v}" as a value of "${field}", but the "${e.row}" row does not`);
}
for (const [type, t] of Object.entries(RECORDS)) {
  if (!codeWords(t.rows[0]?.join(" ") ?? "").has(type)) fail("examples", `the ${type} field table does not say that its recordType is ${type}`);
}
const VALUES = Object.fromEntries(Object.entries(ENUMS).map(([k, e]) => [k, new Set(e.values)]));

// The terminal states, the fields that belong to one event, and the results each event may carry
// are read from the prose. A list that cannot be read, or that disagrees with the other place the
// prose states it, stops the run, so a reworded sentence never makes the check weaker.
const lineIn = (title, test) => section(title).split("\n").find(test) ?? "";
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
// Section 8: "`completed`, ... are **terminal**: ...". Section 16: "- **Terminal state**: `completed`, ... ."
const TERMINAL = [...codeWords(lineIn("Outcome", (l) => l.includes("are **terminal**")).split("are **terminal**")[0])];
const TERMINAL_TERM = codeWords(lineIn("Terminology", (l) => l.startsWith("- **Terminal state**:")).split(/\.\s/)[0]);
if (!TERMINAL.length) couldNotRun("cannot read the terminal states in section 8");
for (const s of TERMINAL) if (!VALUES.state.has(s)) couldNotRun(`section 8 calls "${s}" terminal, but the State table has no such state`);
if (!sameSet(new Set(TERMINAL), TERMINAL_TERM)) {
  couldNotRun(`the terminal states in section 8 (${TERMINAL.join(", ")}) differ from those in section 16 (${[...TERMINAL_TERM].join(", ")})`);
}
// A progress row such as "| `state` | `ended` only: ... |" says which event carries its fields.
const ONLY_ON = {};
for (const [fields, meaning = ""] of RECORDS.progress.rows) {
  const event = meaning.match(/^`([^`]+)` only:/)?.[1];
  if (!event) {
    if (/\bonly\b/i.test(meaning)) couldNotRun(`the progress row for ${fields} says "only", but not as "\`event\` only:"`);
    continue;
  }
  if (!VALUES.event.has(event)) couldNotRun(`the progress row for ${fields} names "${event}", which is not an event`);
  for (const field of codeWords(fields)) ONLY_ON[field] = [event];
}
if (!Object.keys(ONLY_ON).length) couldNotRun("cannot read the fields that belong to one event in section 10");
const RESULTS = {};
for (const [, event, values] of (rowOf(RECORDS.progress, "result")?.[1] ?? "").matchAll(/On `([^`]+)`[^:]*:([^.]*)/g)) RESULTS[event] = [...codeWords(values)];
if (!Object.keys(RESULTS).length) couldNotRun("cannot read the results that each event may carry in section 10");
for (const event of Object.keys(RESULTS)) if (!VALUES.event.has(event)) couldNotRun(`the result row names "${event}", which is not an event`);
ONLY_ON.result = Object.keys(RESULTS);
VALUES.result = new Set(Object.values(RESULTS).flat());
const TREE_ALGORITHMS = ["gitTree", "dirHash"];
// Fields that hold one in-toto digest set, and the one field that holds a list of them.
const DIGEST_FIELDS = new Set(["treeAtStart", "treeAtEnd", "outputDigest"]);
const DIGEST_LISTS = new Set(["findings"]);
const PREDICATE_TYPE = section("Verification evidence").match(/^`(https:\/\/[^`]+)`$/m)?.[1];
const EVENT_PREFIX = section("Progress").match(/prefix `([^`]+)`/)?.[1];
if (!PREDICATE_TYPE || !EVENT_PREFIX) couldNotRun("cannot find the predicate type in section 9 or the event prefix in section 10");
const STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
const STATEMENT_KEYS = new Set(["_type", "subject", "predicateType", "predicate"]);
const EVENT_KEYS = new Set(["specversion", "type", "source", "id", "time", "datacontenttype", "dataschema", "subject", "data"]);
// A CloudEvents extension attribute name: lowercase letters and digits only (CloudEvents 1.0.2).
const EXTENSION_NAME = /^[a-z0-9]+$/;
// True when two names differ by one inserted, deleted, or changed letter.
function oneEditApart(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const rest = (x, n) => x.slice(i + n);
  return rest(a, 1) === rest(b, 1) || rest(a, 1) === rest(b, 0) || rest(a, 0) === rest(b, 1);
}

// ------------------------------------------------------------------ small helpers

const list = (x) => (Array.isArray(x) ? x : []);
const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
// The entries of a list that are objects. [examples] reports the others, so the rules skip them.
const entries = (x) => list(x).filter(isObject);
const filled = (s) => typeof s === "string" && s.length > 0;
const text = (s) => typeof s === "string" && s.trim().length > 0;
const count = (n) => Number.isInteger(n) && n >= 0;
const positive = (n) => Number.isInteger(n) && n > 0;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:([0-5]\d|60)(\.\d+)?Z$/;
// RFC 3339 allows a leap second, ":60". Date.parse cannot read one, so it counts as the second before.
const ms = (s) => (typeof s === "string" && UTC.test(s) ? Date.parse(s.replace(/:60(?=(\.\d+)?Z$)/, ":59")) : NaN);
const isUtc = (s) => !Number.isNaN(ms(s));
const an = (word) => `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
const canonical = (o) => JSON.stringify(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));
// Two in-toto digest sets match when any algorithm they share has the same value.
const digestsMatch = (a, b) => Object.entries(a ?? {}).some(([alg, v]) => b?.[alg] === v);
// An in-toto digest set: an object of one or more algorithms, each with a value.
const isDigestSet = (set) => isObject(set) && Object.keys(set).length > 0 && Object.values(set).every(filled);
// A tree digest set has a gitTree or a dirHash value; it may hold other algorithms too.
const hasTreeDigest = (d) => isObject(d) && TREE_ALGORITHMS.some((a) => filled(d[a]));
// A tree changed if its two digest sets share no algorithm, or any shared algorithm differs (OSFP.EV.5).
function treeChanged(a, b) {
  const shared = Object.keys(a ?? {}).filter((alg) => alg in (b ?? {}));
  return !shared.length || shared.some((alg) => a[alg] !== b[alg]);
}

// ------------------------------------------------------------------ [schema]

// The JSON Schema keywords schema/standard.schema.json uses. A keyword outside this list stops the
// run, so the check can never pass by skipping a constraint it does not understand.
const SCHEMA_KEYWORDS = new Set([
  "$schema", "title", "description", "$defs", "$ref", "type", "const", "enum", "pattern", "minLength", "format",
  "required", "properties", "additionalProperties", "anyOf", "items", "minItems", "uniqueItems",
]);
const typeOf = (x) => (Array.isArray(x) ? "array" : x === null ? "null" : Number.isInteger(x) ? "integer" : typeof x);
const deref = (s) => (s.$ref ? deref(s.$ref.split("/").slice(1).reduce((o, k) => o?.[k], schema) ?? couldNotRun(`cannot resolve ${s.$ref}`)) : s);

function validate(rule, x, at) {
  const s = deref(rule);
  for (const k of Object.keys(s)) if (!SCHEMA_KEYWORDS.has(k)) couldNotRun(`schema/standard.schema.json uses "${k}", which this check does not implement`);
  const problem = (msg) => fail("schema", `${at} ${msg}`);
  const type = typeOf(x);
  if (s.type && s.type !== type) return problem(`is ${type}, not ${s.type}`);
  if ("const" in s && x !== s.const) problem(`is not ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(x)) problem(`is ${JSON.stringify(x)}, not one of ${s.enum.join(", ")}`);
  if (s.pattern && !new RegExp(s.pattern, "u").test(x)) problem(`does not match ${s.pattern}`);
  if (s.minLength && x.length < s.minLength) problem(`is shorter than ${s.minLength}`);
  if (s.format === "uri" && !/^[a-z][a-z0-9+.-]*:\S+$/i.test(x)) problem("is not a URI");
  for (const k of s.required ?? []) if (!(k in x)) problem(`has no ${k}`);
  if (s.anyOf && !s.anyOf.some((alt) => (alt.required ?? []).every((k) => k in x))) problem(`has none of ${s.anyOf.map((a) => a.required).join(" or ")}`);
  if (s.properties || s.additionalProperties === false) {
    for (const [k, v] of Object.entries(x)) {
      if (s.properties?.[k]) validate(s.properties[k], v, `${at}.${k}`);
      else if (s.additionalProperties === false) problem(`has ${k}, which the schema does not allow`);
    }
  }
  if (s.items) x.forEach((v, i) => validate(s.items, v, `${at}[${i}]`));
  if (s.minItems && x.length < s.minItems) problem(`has fewer than ${s.minItems} items`);
  if (s.uniqueItems && new Set(x.map((v) => JSON.stringify(v))).size !== x.length) problem("repeats an item");
}

function checkSchema() {
  validate(schema, data, "spec/standard.json");
  note("schema", `${data.items.length} rules and ${data.bibliography.length} sources in spec/standard.json validated against schema/standard.schema.json`);
}

// ------------------------------------------------------------------ [structure]

const KEY_WORD = /\b(MUST NOT|MUST|SHALL NOT|SHALL|SHOULD NOT|SHOULD|NOT RECOMMENDED|RECOMMENDED|REQUIRED|MAY|OPTIONAL)\b/g;
const RULE_LINE = /^- `OSFP\.[A-Z]{2}\.\d+` — /;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s/;
const DECLARATION = "are to be interpreted as described in BCP 14";
const CHECKS = ["check-standard.mjs", "check-osfp.mjs", "self-test.mjs"];

// A workflow's lines, without comments.
const workflowLines = (workflow) => workflow.split("\n").map((l) => l.replace(/(^|\s)#.*$/, "").trimEnd());

// The commands a workflow runs: each "- run:" step, and each line of a "- run: |" step. The lines
// of any other block scalar, such as an env value, are skipped, so a run line inside one is not a step.
function commandsOf(lines) {
  const commands = [];
  let block = null;
  for (const line of lines) {
    const indent = line.search(/\S/);
    if (block && (indent > block.indent || !line.trim())) {
      if (block.run && line.trim()) commands.push(line.trim());
      continue;
    }
    block = null;
    const key = line.match(/^\s*(-\s+)?([\w-]+):\s*(.*)$/);
    if (!key) continue;
    const [, step, name, value] = key;
    if (/^[|>][-+]?$/.test(value)) block = { indent, run: name === "run" && !!step };
    else if (name === "run" && step) commands.push(value.trim());
  }
  return commands;
}

// The workflow's triggers: each key of its top-level "on:" block, with the lines under it.
function triggersOf(lines) {
  const triggers = new Map();
  const at = lines.findIndex((l) => /^on:\s*$/.test(l));
  if (at < 0) return triggers;
  let current = null;
  for (const line of lines.slice(at + 1)) {
    if (!line.trim()) continue;
    if (/^\S/.test(line)) break;
    const key = line.match(/^ {2}([\w-]+):\s*(.*)$/);
    if (key) triggers.set((current = key[1]), key[2] ? [key[2]] : []);
    else if (current) triggers.get(current).push(line.trim());
  }
  return triggers;
}
// The filters each trigger may carry: pushes to main, and every pull request.
const TRIGGER_FILTERS = { push: ["branches: [main]"], pull_request: [] };
// Each value that the workflow gives to a key, anywhere, as a step's key or not.
const valuesOf = (lines, key) => lines.map((l) => l.match(new RegExp(`^\\s*(?:-\\s+)?${key}:\\s*(.*)$`))?.[1]).filter((v) => v !== undefined);

// A class's key in standard.json, from its label: "Harness adapter" → "harness-adapter".
const classKey = (label) => label.toLowerCase().replace(/\s+/g, "-");
const rulesOfClass = (cls) => data.items.filter((it) => list(it.classes).includes(cls));
const classesNamed = () => new Set(data.items.flatMap((it) => list(it.classes)));

// README's counts of rules, in total and for each class, match the data. Comments and code blocks
// are removed first, so a hidden count does not stand in for the visible one.
function checkReadmeCounts(raw) {
  const readme = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/^```[\s\S]*?^```/gm, "");
  const totals = [...readme.matchAll(/The standard has (\d+) rules/g)].map((m) => Number(m[1]));
  if (totals.length !== 1 || totals[0] !== data.items.length) {
    fail("structure", `README.md must say once that the standard has ${data.items.length} rules; it says ${totals.length ? totals.join(" and ") : "no count"}`);
  }
  const t = tablesIn(readme).find((x) => x.header.includes("Its class") && x.header.includes("Rules"));
  if (!t) return fail("structure", "README.md has no table of classes with a Rules column");
  const [classAt, rulesAt] = [t.header.indexOf("Its class"), t.header.indexOf("Rules")];
  const classes = classesNamed();
  const rows = new Set();
  for (const row of t.rows) {
    const cls = classKey(row[classAt]);
    rows.add(cls);
    if (!classes.has(cls)) fail("structure", `README.md has a row for the ${row[classAt]} class, which no rule names`);
    const want = rulesOfClass(cls).length;
    if (Number(row[rulesAt]) !== want) fail("structure", `README.md gives the ${row[classAt]} class ${row[rulesAt]} rules; the data gives it ${want}`);
  }
  for (const cls of classes) if (!rows.has(cls)) fail("structure", `README.md has no row for the ${cls} class`);
}

// Only the numbered rules state requirements (section 4); the BCP 14 declaration names the key words.
// A rule goes on over indented lines, but a list item nested under it is not part of it.
function checkKeyWords() {
  let inRule = false;
  prose.split("\n").forEach((line, i) => {
    inRule = RULE_LINE.test(line) || (inRule && /^\s+\S/.test(line) && !LIST_ITEM.test(line));
    if (inRule || line.includes(DECLARATION)) return;
    for (const [, kw] of line.matchAll(KEY_WORD)) fail("structure", `spec/STANDARD.md:${i + 1} uses the key word ${kw} outside a numbered rule`);
  });
}

// CI runs the three checks on push and pull_request, and nothing in it skips a check or ignores a failure.
function checkWorkflow() {
  const WF = ".github/workflows/check.yml";
  const lines = workflowLines(readText(WF));
  const commands = commandsOf(lines);
  for (const script of CHECKS) if (!commands.includes(`node scripts/${script}`)) fail("structure", `${WF} does not run node scripts/${script}`);
  const triggers = triggersOf(lines);
  for (const [trigger, allowed] of Object.entries(TRIGGER_FILTERS)) {
    if (!triggers.has(trigger)) fail("structure", `${WF} does not run on ${trigger}`);
    for (const filter of triggers.get(trigger) ?? []) if (!allowed.includes(filter)) fail("structure", `${WF} filters its ${trigger} trigger with "${filter}", so some changes would skip the checks`);
  }
  if (valuesOf(lines, "continue-on-error").some((v) => v !== "false")) fail("structure", `${WF} sets continue-on-error, so a failing check would not fail the run`);
  if (valuesOf(lines, "if").length) fail("structure", `${WF} makes a job or a step conditional with if:, so a check could be skipped`);
  if (valuesOf(lines, "shell").length) fail("structure", `${WF} sets a shell, which can stop a failing command from failing its step`);
  if (commands.some((c) => /\bset\s+(\+\w*e|\+o\s+errexit)\b/.test(c))) fail("structure", `${WF} runs set +e, so a failing check would not fail its step`);
}

function checkStructure() {
  checkKeyWords();
  checkReadmeCounts(readText("README.md"));
  checkWorkflow();
  note("structure", `${sections.size} section titles, each used once; key words only in the ${data.items.length} numbered rules and the BCP 14 declaration; CI runs ${CHECKS.length} checks on push and pull_request`);
}

// ------------------------------------------------------------------ [examples]

// The files under a directory and its subdirectories, as paths relative to it. A name that starts
// with a dot, such as .git or .DS_Store, is set aside and not read.
function filesUnder(dir, rel = "", seen = new Set()) {
  const found = { files: [], setAside: [] };
  const real = realpathSync(dir);
  if (seen.has(real)) return found;
  seen.add(real);
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (name.startsWith(".")) found.setAside.push(`${rel}${name}`);
    else if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
      const sub = filesUnder(path, `${rel}${name}/`, seen);
      found.files.push(...sub.files);
      found.setAside.push(...sub.setAside);
    } else found.files.push(`${rel}${name}`);
  }
  return found;
}

// A file's JSON value, or undefined after a failure that says why it has none.
function parseFile(f, path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    fail("examples", `${f} cannot be read: ${e.code ?? "error"}`);
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    fail("examples", `${f} is not valid JSON: ${e.message}`);
    return undefined;
  }
}

// The record a document carries: the predicate of an in-toto Statement, the data of a CloudEvent,
// or the document itself.
function exampleOf(f, doc) {
  if ("_type" in doc) return { f, kind: "statement", envelope: doc, record: doc.predicate };
  if ("specversion" in doc) return { f, kind: "event", envelope: doc, record: doc.data };
  return { f, kind: "record", envelope: null, record: doc };
}

// An example is an OSFP record, or an in-toto Statement or a CloudEvent that carries one. A
// Markdown file is set aside as documentation; any other file that is not .json fails.
function readExamples() {
  let found;
  try {
    found = filesUnder(RECORDS_DIR);
  } catch (e) {
    couldNotRun(`cannot read ${RECORDS_LABEL}/: ${e.code ?? e.message}`);
  }
  const isJson = (n) => n.endsWith(".json");
  const isMarkdown = (n) => n.endsWith(".md");
  const files = found.files.filter(isJson);
  const setAside = [...found.setAside, ...found.files.filter(isMarkdown)];
  for (const n of found.files) if (!isJson(n) && !isMarkdown(n)) fail("examples", `${RECORDS_LABEL}/${n} is not a .json file, so nothing checked it`);
  if (!files.length) couldNotRun(`${RECORDS_LABEL}/ holds no JSON files; a check over nothing proves nothing`);
  const examples = [];
  for (const name of files) {
    const f = `${RECORDS_LABEL}/${name}`;
    const doc = parseFile(f, join(RECORDS_DIR, name));
    if (doc === undefined) continue;
    const ex = isObject(doc) && exampleOf(f, doc);
    if (ex && isObject(ex.record)) examples.push(ex);
    else fail("examples", `${f}: it carries no OSFP record`);
  }
  return { files, setAside, examples };
}

const ENVELOPE_RECORD = { statement: "verification-evidence", event: "progress" };

function checkEnvelope({ f, kind, envelope, record }) {
  if (kind === "record") return;
  const allowed = kind === "statement" ? STATEMENT_KEYS : EVENT_KEYS;
  const carrier = kind === "statement" ? "the in-toto Statement" : "the CloudEvent";
  for (const k of Object.keys(envelope)) {
    if (allowed.has(k)) continue;
    const near = [...allowed].find((a) => oneEditApart(a, k));
    if (near) fail("examples", `${f}: "${k}" looks like a misspelling of "${near}"`);
    else if (!(kind === "event" && EXTENSION_NAME.test(k))) fail("examples", `${f}: "${k}" is not a field of ${carrier}`);
  }
  if (record.recordType !== ENVELOPE_RECORD[kind]) fail("examples", `${f}: ${carrier} carries a ${ENVELOPE_RECORD[kind]} record, not "${record.recordType}"`);
  if (kind === "statement") {
    if (envelope._type !== STATEMENT_TYPE) fail("examples", `${f}: _type is not ${STATEMENT_TYPE}`);
    if (envelope.predicateType !== PREDICATE_TYPE) fail("examples", `${f}: predicateType is not the one section 9 names`);
    const subjects = list(envelope.subject);
    if (!subjects.length || subjects.some((x) => !entries([x]).length || !isDigestSet(x.digest))) fail("examples", `${f}: the in-toto Statement's subject is not a list of descriptors, each with a digest set`);
    return;
  }
  if (envelope.specversion !== "1.0") fail("examples", `${f}: specversion is not 1.0`);
  const name = typeof envelope.type === "string" && envelope.type.startsWith(EVENT_PREFIX) ? envelope.type.slice(EVENT_PREFIX.length) : null;
  if (!VALUES.event.has(name)) fail("examples", `${f}: event type "${envelope.type}" is not ${EVENT_PREFIX} followed by an event in section 10`);
  else if (record.event !== name) fail("examples", `${f}: the event type says ${name}, but the record's event is "${record.event}"`);
}

let fieldsRead = 0;

// Checks one field's value: its enum values, the fields of any object it holds, and digest sets.
function checkValue(f, key, value) {
  if (VALUES[key]) for (const v of [value].flat()) if (!VALUES[key].has(v)) fail("examples", `${f}: ${JSON.stringify(v)} is not a value of "${key}"`);
  if (DIGEST_FIELDS.has(key)) {
    if (!isDigestSet(value)) fail("examples", `${f}: "${key}" is not an in-toto digest set`);
    return;
  }
  if (DIGEST_LISTS.has(key)) {
    if (!Array.isArray(value) || !value.every(isDigestSet)) fail("examples", `${f}: "${key}" is not a list of in-toto digest sets`);
    return;
  }
  const shape = SHAPES[key];
  if (!shape) return;
  for (const item of [value].flat()) {
    if (!isObject(item)) {
      fail("examples", `${f}: "${key}" holds something that is not an object`);
      continue;
    }
    for (const [k, v] of Object.entries(item)) {
      fieldsRead++;
      if (shape.has(k)) checkValue(f, k, v);
      else fail("examples", `${f}: "${k}" is not a field of "${key}"`);
    }
  }
}

function checkExamples(examples, files, setAside) {
  for (const ex of examples) {
    checkEnvelope(ex);
    const fields = FIELDS[ex.record.recordType];
    if (!fields) {
      fail("examples", `${ex.f}: recordType "${ex.record.recordType}" is not one of ${Object.keys(RECORDS).join(", ")}`);
      continue;
    }
    for (const [k, v] of Object.entries(ex.record)) {
      fieldsRead++;
      if (fields.has(k)) checkValue(ex.f, k, v);
      else fail("examples", `${ex.f}: "${k}" is not a field of the ${ex.record.recordType} record`);
    }
  }
  const aside = setAside.length ? `; set aside ${setAside.length} other file${setAside.length === 1 ? "" : "s"}: ${setAside.join(", ")}` : "";
  note("examples", `${files.length} records in ${RECORDS_LABEL}/, ${fieldsRead} fields read, each against its own record's tables and its own values${aside}`);
}

// ------------------------------------------------------------------ [rules], one example at a time

// Each rule takes an example and returns the problems it finds, as strings.
const EVERY_RECORD = [
  ["OSFP.GE.1", ({ record: r }) => ["osfpVersion", "recordType", "id"].filter((k) => !filled(r[k])).map((k) => `has no ${k}`)],
  ["version", ({ record: r }) => (r.osfpVersion === data.version ? [] : [`has osfpVersion "${r.osfpVersion}", not ${data.version}`])],
  ["OSFP.GE.2", ({ record: r, envelope }) => {
    const stamps = Object.entries(r).filter(([k]) => k.endsWith("At"));
    if (envelope && "time" in envelope) stamps.push(["time", envelope.time]);
    return stamps.filter(([, v]) => !isUtc(v)).map(([k, v]) => `has ${k} "${v}", not an RFC 3339 date-time in UTC with the offset Z`);
  }],
];

const checksOf = (ex) => entries(ex.record.checks);
const success = (c) => c.successStatus ?? 0;
const exitedWithSuccess = (c) => c.exitStatus === success(c);
const exitedWithFailure = (c) => Number.isInteger(c.exitStatus) && c.exitStatus !== success(c);
// The two flags on what the attempt changed are absent when the verifier cannot tell; present, they agree.
const saysWhatChanged = (c) => "inputsChanged" in c || "changedInputs" in c;
const changesAgree = (c) => Array.isArray(c.changedInputs) && c.changedInputs.every(filled) && c.inputsChanged === c.changedInputs.length > 0;
const each = (ex, test, says) => checksOf(ex).filter(test).map((c) => `has a check "${c.name}" that ${says}`);

const BY_RECORD = {
  "task-grant": [
    ["OSFP.AU.2", ({ record: g }) => (filled(g.approvedBy) && isUtc(g.approvedAt) ? [] : ["names no approver, or no approval time"])],
    ["OSFP.AU.4", ({ record: g }) => ["resources", "operations", "disclosures", "tools"].filter((k) => !Array.isArray(g[k])).map((k) => `does not list its ${k}`)],
    ["OSFP.AU.7", ({ record: g }) => entries(g.restrictions).filter((x) => !filled(x.target) || !filled(x.rule) || !filled(x.enforcement)).map(() => "has a restriction without a target, a rule, or an enforcement")],
    ["OSFP.AU.8", ({ record: g }) => entries(g.disclosures).filter((d) => !filled(d.source) || !filled(d.revision) || !filled(d.destination)).map(() => "has a disclosure without its source, revision, or destination")],
    ["OSFP.PF.2", ({ record: g }) => entries(g.tools).filter((t) => !filled(t.server) || !filled(t.name)).map(() => "has a tool without its server or its name")],
    ["OSFP.PR.1", ({ record: g }) => (positive(g.limits?.startAckSeconds) && positive(g.limits?.totalSeconds) ? [] : ["does not state startAckSeconds and totalSeconds"])],
    ["section 7", ({ record: g }) => [
      filled(g.taskId) === filled(g.scheduleId) && "names both or neither of taskId and scheduleId",
      !positive(g.generation) && "has no positive generation",
      filled(g.derivedFrom) && !filled(g.taskId) && "derives from a standing grant but names no task",
      "expiresAt" in g && !(ms(g.expiresAt) > ms(g.approvedAt)) && "does not expire after it was approved",
      "unknownAttempts" in g && !(filled(g.taskId) && Array.isArray(g.unknownAttempts) && g.unknownAttempts.every(filled)) && "lists unknownAttempts, but names no task, or lists something that is not an attempt ID",
      "inspection" in g && typeof g.inspection !== "boolean" && "has an inspection flag that is not true or false",
    ].filter(Boolean)],
  ],
  outcome: [
    ["section 8", ({ record: o }) => [!positive(o.sequence) && "has no positive sequence", !isUtc(o.stateAt) && "has no stateAt"].filter(Boolean)],
    ["OSFP.OU.10", ({ record: o }) => (filled(o.stopRequestedAt) && TERMINAL.includes(o.state) && !filled(o.stopConfirmedAt) ? ["records a terminal state while its stop is unconfirmed"] : [])],
    ["OSFP.OU.7", ({ record: o }) => {
      const [req, conf, clean] = [o.stopRequestedAt, o.stopConfirmedAt, o.cleanupConfirmedAt];
      return [
        conf && !req && "confirms a stop that was never requested",
        clean && !conf && "confirms cleanup before the stop was confirmed",
        req && conf && ms(conf) < ms(req) && "confirms the stop before it was requested",
        conf && clean && ms(clean) < ms(conf) && "confirms cleanup before the stop",
      ].filter(Boolean);
    }],
  ],
  "verification-evidence": [
    ["OSFP.EV.1", ({ envelope }) => (entries(envelope?.subject).some((s) => hasTreeDigest(s.digest)) ? [] : ["has no subject that names the checked tree by a gitTree or dirHash digest"])],
    ["OSFP.EV.1", (ex) => each(ex, (c) => !entries(ex.envelope?.subject).some((s) => hasTreeDigest(s.digest) && digestsMatch(s.digest, c.treeAtStart)), "checked a tree the subject does not name")],
    ["section 9", (ex) => each(ex, (c) => !hasTreeDigest(c.treeAtStart) || !hasTreeDigest(c.treeAtEnd), "names its tree without a gitTree or dirHash digest")],
    ["section 9", (ex) => each(ex, (c) => "successStatus" in c && !Number.isInteger(c.successStatus), "records a success status that is not an integer")],
    ["section 9", (ex) => each(ex, (c) => ![c.unitsExamined, c.unitsFailed, c.unitsSkipped].every(count) || c.unitsFailed > c.unitsExamined, "does not count its units, or counts more failures than units")],
    ["OSFP.EV.3", (ex) => each(ex, (c) => c.status === "passed" && !(exitedWithSuccess(c) && c.unitsExamined >= 1 && c.unitsFailed === 0), "is passed without a success exit, an examined unit, and no failures")],
    ["section 9", (ex) => each(ex, (c) => c.status === "failed" && !(c.unitsExamined >= 1 && (c.unitsFailed >= 1 || exitedWithFailure(c))), "is failed without an examined unit that failed")],
    ["section 9", (ex) => each(ex, (c) => c.status === "not-run" && c.unitsExamined !== 0, "is not-run but examined units")],
    ["OSFP.EV.4", (ex) => each(ex, (c) => "exitStatus" in c && !Number.isInteger(c.exitStatus), "records an exit status that is not an integer")],
    ["OSFP.EV.4", (ex) => each(ex, (c) => !("exitStatus" in c) && !["not-run", "incomplete"].includes(c.status), "records no exit status, but says that its command ran to the end")],
    ["OSFP.EV.5", (ex) => each(ex, (c) => (c.outputComplete === false || treeChanged(c.treeAtStart, c.treeAtEnd)) && c.status !== "incomplete", "lost output or saw the tree change, but is not incomplete")],
    ["OSFP.EV.6", (ex) => each(ex, (c) => saysWhatChanged(c) && !changesAgree(c), "does not say consistently whether, and where, the attempt changed what decides it")],
    ["OSFP.EV.7", (ex) => each(ex, (c) => "answersReachable" in c && typeof c.answersReachable !== "boolean", "says with something other than true or false whether the attempt could read its withheld answers")],
  ],
  progress: [
    ["OSFP.PR.7", ({ record: p }) => [!VALUES.event.has(p.event) && "does not name its event", !isUtc(p.occurredAt) && "does not say when its event happened"].filter(Boolean)],
    ["section 10", ({ record, envelope }) => progressProblems(record, envelope)],
  ],
};


function progressProblems(p, envelope) {
  const e = p.event;
  const overdue = e === "overdue";
  const misplaced = Object.keys(ONLY_ON).filter((k) => k in p && !ONLY_ON[k].includes(e)).map((k) => `is ${an(e)} event that carries "${k}"`);
  return [
    ...misplaced,
    !overdue && !(filled(p.taskId) && filled(p.attemptId)) && `is ${an(e)} event that does not name its task and its attempt`,
    "result" in p && RESULTS[e] && !RESULTS[e].includes(p.result) && `is ${an(e)} event with the result "${p.result}"`,
    e === "limit-expired" && !(p.limit && filled(p.action)) && "is a limit-expired event without its limit or its action",
    overdue && !(p.result && isUtc(p.expectedAt)) && "is an overdue event without its result or expectedAt",
    overdue && p.result === "unfinished" && !filled(p.attemptId) && "is an unfinished overdue event that names no attempt",
    overdue && !(ms(p.expectedAt) < ms(p.occurredAt)) && "is an overdue event that happened before the task was expected",
    e === "ended" && !TERMINAL.includes(p.state) && "is an ended event without a terminal state",
    envelope && "time" in envelope && envelope.time !== p.occurredAt && "has a CloudEvent time that differs from its occurredAt",
  ].filter(Boolean);
}

let ruleChecks = 0;

function checkEachExample(examples) {
  for (const ex of examples) {
    for (const [rule, test] of [...EVERY_RECORD, ...(BY_RECORD[ex.record.recordType] ?? [])]) {
      ruleChecks++;
      for (const problem of test(ex)) fail("rules", `${rule}: ${ex.f} ${problem}`);
    }
  }
}

// ------------------------------------------------------------------ [rules], across the examples

const ACCESS = { read: 1, write: 2 };
// A grant that lists nothing permits nothing; it revokes authority, and may name who recorded it (OSFP.AU.2).
const permitsNothing = (g) => ["resources", "operations", "disclosures", "tools"].every((k) => !list(g[k]).length);

// What a derived grant permits beyond its standing grant, or keeps less of (OSFP.AU.6).
function beyond(derived, standing) {
  const extra = [];
  for (const r of entries(derived.resources)) {
    const s = entries(standing.resources).find((x) => x.uri === r.uri);
    if (!s || !(ACCESS[r.access] <= ACCESS[s.access])) extra.push(`${r.access} access to ${r.uri}`);
  }
  for (const op of list(derived.operations)) if (!list(standing.operations).includes(op)) extra.push(`the operation ${op}`);
  for (const k of ["disclosures", "tools"]) {
    const allowed = new Set(list(standing[k]).map(canonical));
    for (const x of list(derived[k])) if (!allowed.has(canonical(x))) extra.push(`a ${k.slice(0, -1)} that the standing grant lacks`);
  }
  const kept = new Set(list(derived.restrictions).map(canonical));
  for (const x of entries(standing.restrictions)) if (!kept.has(canonical(x))) extra.push(`no restriction on ${x.target}`);
  for (const k of ["startAckSeconds", "totalSeconds"]) if (!(derived.limits?.[k] <= standing.limits?.[k])) extra.push(`a longer or missing ${k}`);
  if ("expiresAt" in standing && !(ms(derived.expiresAt) <= ms(standing.expiresAt))) extra.push("a later or missing expiry");
  if (standing.inspection === true && derived.inspection !== true) extra.push("no inspection flag");
  return extra;
}

const highestGeneration = (grants) => grants.reduce((a, g) => (!a || g.record.generation > a.record.generation ? g : a), null);

// The grant that holds a task's or a schedule's authority at a moment: the highest generation approved by then.
function latestAt(grants, key, value, t) {
  return highestGeneration(grants.filter((g) => g.record[key] === value && ms(g.record.approvedAt) <= t));
}
const permitsDispatchAt = (g, t) => !!g && list(g.record.operations).includes("dispatch") && !(ms(g.record.expiresAt) <= t);

// Each attempt that a record names: its tasks, its records, its outcomes in sequence order, and the
// moment it was dispatched. An attempt is timed by its dispatched event, or without one by its
// earliest record, so a record written before the dispatch does not move the dispatch earlier.
function attemptsOf(examples, events, when) {
  const attempts = new Map();
  for (const x of examples) {
    const id = x.record.attemptId;
    if (!filled(id)) continue;
    if (!attempts.has(id)) attempts.set(id, { id, tasks: new Set(), records: [], dispatch: null });
    const a = attempts.get(id);
    if (filled(x.record.taskId)) a.tasks.add(x.record.taskId);
    a.records.push(x);
  }
  for (const e of events) {
    const a = e.record.event === "dispatched" && attempts.get(e.record.attemptId);
    if (!a) continue;
    // Keep the earliest dispatched event.
    const earlierKept = a.dispatch && ms(a.dispatch.record.occurredAt) <= ms(e.record.occurredAt);
    if (!earlierKept) a.dispatch = e;
  }
  for (const a of attempts.values()) {
    const first = a.records.reduce((p, q) => (when(q) < when(p) ? q : p));
    a.taskId = [...a.tasks][0];
    a.outcomes = a.records.filter((x) => x.record.recordType === "outcome").toSorted((p, q) => p.record.sequence - q.record.sequence);
    a.at = a.dispatch ? ms(a.dispatch.record.occurredAt) : when(first);
    a.f = (a.dispatch ?? first).f;
  }
  return attempts;
}

// The examples grouped by record and by attempt, with the lookups the set rules share.
function groupExamples(examples) {
  const byType = (type) => examples.filter((x) => x.record.recordType === type);
  const grants = byType("task-grant");
  const events = byType("progress");
  const grantsOf = (taskId) => grants.filter((g) => g.record.taskId === taskId);
  const when = (x) => ms(x.record.stateAt ?? x.record.checkedAt ?? x.record.occurredAt);
  const attempts = attemptsOf(examples, events, when);
  // The resources that an attempt's grant let it write when it was dispatched, by exact uri. The
  // checker cannot see what a harness reaches beyond its grant, or that two URIs name one resource.
  const writable = (a) => {
    const grant = latestAt(grants, "taskId", a.taskId, a.at);
    return new Set(entries(grant?.record.resources).filter((r) => r.access === "write").map((r) => r.uri));
  };
  const overlaps = (a, b) => a.taskId === b.taskId || [...writable(b)].some((uri) => writable(a).has(uri));
  // The other attempts of a's task, or that could write what a could write, dispatched from `from` until `until`.
  const dispatchedDuring = (a, from, until) => [...attempts.values()].filter((x) => x !== a && x.at >= from && x.at < until && overlaps(a, x));
  return {
    examples,
    grants,
    outcomes: byType("outcome"),
    events,
    when,
    grantsOf,
    latestGrantOf: (taskId) => highestGeneration(grantsOf(taskId)),
    attempts,
    dispatchedDuring,
  };
}
const ruleFail = (id, f, msg) => fail("rules", `${id}: ${f} ${msg}`);

// Each item whose key an earlier item already used, paired with that earlier item.
function repeats(items, keyOf) {
  const seen = new Map();
  const found = [];
  for (const x of items) {
    const key = keyOf(x);
    if (seen.has(key)) found.push([x, seen.get(key)]);
    else seen.set(key, x);
  }
  return found;
}

// Each set rule takes the grouped examples and returns how many checks it made.

// No record reuses an id (OSFP.GE.1), no event reuses a source and an id (CloudEvents), and no
// task or schedule repeats a generation (section 7).
function checkRepeats({ examples, grants }) {
  for (const [x, first] of repeats(examples, (y) => y.record.id)) ruleFail("OSFP.GE.1", x.f, `reuses the id of ${first.f}`);
  const events = examples.filter((y) => y.kind === "event");
  for (const [x, first] of repeats(events, (y) => `${y.envelope.source} ${y.envelope.id}`)) ruleFail("CloudEvents", x.f, `reuses the source and id of ${first.f}`);
  const generation = (g) => `${g.record.taskId ?? g.record.scheduleId}#${g.record.generation}`;
  for (const [g, first] of repeats(grants, generation)) ruleFail("OSFP.GE.7", g.f, `repeats generation ${g.record.generation} of ${first.f}`);
  return 3;
}

// Each dispatched event comes while its task's authority permits dispatch: the latest grant for the
// task lists dispatch and has not expired, and so does its schedule's latest standing grant, for a
// derived grant (OSFP.AU.1).
function checkAuthority({ events, grants }) {
  const dispatches = events.filter((x) => x.record.event === "dispatched");
  for (const x of dispatches) {
    const t = ms(x.record.occurredAt);
    const grant = latestAt(grants, "taskId", x.record.taskId, t);
    const standing = filled(grant?.record.derivedFrom) && grants.find((g) => g.record.id === grant.record.derivedFrom);
    const schedule = standing && latestAt(grants, "scheduleId", standing.record.scheduleId, t);
    const permitted = permitsDispatchAt(grant, t) && (!standing || permitsDispatchAt(schedule, t));
    if (!permitted) ruleFail("OSFP.AU.1", x.f, "dispatches an attempt when its task's authority did not permit dispatch");
  }
  return dispatches.length;
}

// The events that report an attempt's lifecycle after its dispatch, and the states each one reports.
const LIFECYCLE = [
  ["started", (state) => state === "started"],
  ["ended", (state) => TERMINAL.includes(state)],
];

// Each attempt that a record names has a dispatched event. Each attempt that an outcome shows
// started has a started event, each one that reached a terminal state has an ended event, and
// neither event comes before the dispatch (OSFP.PR.5).
function checkLifecycleEvents({ attempts, events }) {
  for (const a of attempts.values()) {
    if (!a.dispatch) {
      for (const x of a.records) ruleFail("OSFP.PR.5", x.f, "is about an attempt with no dispatched event");
      continue;
    }
    for (const [event, shows] of LIFECYCLE) {
      const reported = events.filter((e) => e.record.event === event && e.record.attemptId === a.id);
      if (!reported.length) {
        for (const o of a.outcomes.filter((x) => shows(x.record.state))) ruleFail("OSFP.PR.5", o.f, `records the state ${o.record.state}, but no ${event} event reports it`);
      }
      for (const e of reported) if (ms(e.record.occurredAt) < a.at) ruleFail("OSFP.PR.5", e.f, `is ${an(event)} event from before the attempt was dispatched`);
    }
  }
  return attempts.size;
}

// Each attempt belongs to one task (section 8).
function checkAttemptTasks({ attempts }) {
  for (const a of attempts.values()) if (a.tasks.size > 1) ruleFail("section 8", a.f, `names one attempt under ${a.tasks.size} tasks: ${[...a.tasks].join(", ")}`);
  return attempts.size;
}

const STOP_FACTS = ["stopRequestedAt", "stopConfirmedAt", "cleanupConfirmedAt"];

// Each outcome of an attempt after the first, paired with the one before it.
const consecutive = (outcomes) => outcomes.slice(1).map((o, i) => [outcomes[i], o]);

// An attempt leaves a terminal state only for unknown (OSFP.GE.7).
function checkTerminalStates(a) {
  let terminal = null; // the outcome that put the attempt in its terminal state
  for (const o of a.outcomes) {
    const state = o.record.state;
    if (terminal && state !== terminal.record.state && state !== "unknown") ruleFail("OSFP.GE.7", o.f, `leaves the terminal state ${terminal.record.state} of ${terminal.f}`);
    if (state === "unknown") terminal = null;
    else if (TERMINAL.includes(state) && state !== terminal?.record.state) terminal = o;
  }
}

// No ended event comes while a requested stop is unconfirmed (OSFP.OU.10).
function checkEndedEvents(a, events) {
  for (const e of events.filter((x) => x.record.event === "ended" && x.record.attemptId === a.id)) {
    const t = ms(e.record.occurredAt);
    const latest = a.outcomes.filter((o) => ms(o.record.stateAt) <= t).at(-1)?.record;
    const unconfirmed = filled(latest?.stopRequestedAt) && !(ms(latest.stopConfirmedAt) <= t);
    if (unconfirmed) ruleFail("OSFP.OU.10", e.f, "reports a terminal state while the attempt's stop is unconfirmed");
  }
}

// An attempt's outcomes have distinct sequence numbers, and keep each part of a stop once it is
// recorded (section 8). The outcome that ends unknown says how, and comes after cleanup was
// confirmed (OSFP.OU.11). Terminal states and ended events are checked above.
function checkAttemptHistory({ attempts, events }) {
  for (const a of attempts.values()) {
    for (const [o, first] of repeats(a.outcomes, (x) => x.record.sequence)) ruleFail("OSFP.GE.7", o.f, `repeats sequence ${o.record.sequence} of ${first.f}`);
    for (const [before, o] of consecutive(a.outcomes)) {
      for (const k of STOP_FACTS) if (k in before.record && o.record[k] !== before.record[k]) ruleFail("section 8", o.f, `drops or changes the ${k} of ${before.f}`);
      if (before.record.state !== "unknown" || o.record.state === "unknown") continue;
      if (!text(o.record.note)) ruleFail("OSFP.OU.11", o.f, `ends the unknown state of ${before.f} without a note that says how`);
      if (!filled(o.record.cleanupConfirmedAt)) ruleFail("OSFP.OU.11", o.f, `ends the unknown state of ${before.f} before cleanup was confirmed`);
    }
    checkTerminalStates(a);
    checkEndedEvents(a, events);
  }
  return attempts.size;
}

// A derived grant stays within a standing grant in the set (OSFP.AU.6), and names its approver (OSFP.AU.2).
function checkDerivedGrants({ grants }) {
  const derived = grants.filter((g) => filled(g.record.derivedFrom));
  for (const d of derived) {
    const standing = grants.find((g) => g.record.id === d.record.derivedFrom);
    if (!standing || !filled(standing.record.scheduleId)) {
      ruleFail("OSFP.AU.6", d.f, "derives from a grant that is not a standing grant in the examples");
      continue;
    }
    for (const extra of beyond(d.record, standing.record)) ruleFail("OSFP.AU.6", d.f, `has ${extra}, beyond ${standing.f}`);
    if (permitsNothing(d.record)) continue;
    if (d.record.approvedBy !== standing.record.approvedBy) ruleFail("OSFP.AU.2", d.f, `does not name the person who approved ${standing.f}`);
    if (d.record.approvedAt !== standing.record.approvedAt) ruleFail("section 7", d.f, `does not carry the approval time of ${standing.f}`);
  }
  return derived.length;
}

// While an attempt is unknown, no attempt of its task, and no attempt whose grant lets it write a
// resource that the unknown attempt's grant let it write, is dispatched, unless a grant for the new
// attempt's task names the unknown attempt, permits dispatch, and was approved in between. The
// unknown state lasts until the attempt's next outcome that is not unknown (OSFP.OU.5).
// Each span of time an attempt was unknown: from the outcome that made it unknown until its next
// outcome that is not unknown, or without end.
function unknownSpans(a) {
  const spans = [];
  a.outcomes.forEach((o, i) => {
    if (o.record.state !== "unknown" || a.outcomes[i - 1]?.record.state === "unknown") return;
    const next = a.outcomes.slice(i + 1).find((x) => x.record.state !== "unknown");
    spans.push({ outcome: o, from: ms(o.record.stateAt), until: next ? ms(next.record.stateAt) : Infinity });
  });
  return spans;
}

function checkRetryDecisions({ attempts, grantsOf, dispatchedDuring }) {
  let checked = 0;
  for (const a of attempts.values()) {
    for (const { outcome, from, until } of unknownSpans(a)) {
      for (const x of dispatchedDuring(a, from, until)) {
        checked++;
        const answers = (g) =>
          list(g.record.unknownAttempts).includes(a.id) &&
          list(g.record.operations).includes("dispatch") &&
          ms(g.record.approvedAt) >= from &&
          ms(g.record.approvedAt) <= x.at;
        if (!grantsOf(x.taskId).some(answers)) ruleFail("OSFP.OU.5", x.f, `dispatches an attempt while ${outcome.f} is unknown, with no grant for its task that names that attempt`);
      }
    }
  }
  return checked;
}

// From the request to stop an attempt until its cleanup is confirmed or it is unknown, no attempt of
// its task, and no attempt whose grant lets it write a resource that the stopping attempt's grant
// let it write, is dispatched (OSFP.OU.12).
// The span of time an attempt's stop was in progress: from its first stop request until its cleanup
// is confirmed or it is unknown, whichever comes first. Null if no stop was requested.
function stopSpan(a) {
  const asked = a.outcomes.find((o) => filled(o.record.stopRequestedAt));
  if (!asked) return null;
  const from = ms(asked.record.stopRequestedAt);
  const ends = a.outcomes.flatMap((o) => [ms(o.record.cleanupConfirmedAt), o.record.state === "unknown" ? ms(o.record.stateAt) : NaN]);
  return { outcome: asked, from, until: Math.min(...ends.filter((t) => t >= from)) };
}

function checkStopWindows({ attempts, dispatchedDuring }) {
  let checked = 0;
  for (const a of attempts.values()) {
    const span = stopSpan(a);
    if (!span) continue;
    for (const x of dispatchedDuring(a, span.from, span.until)) {
      checked++;
      ruleFail("OSFP.OU.12", x.f, `dispatches an attempt while the stop that ${span.outcome.f} requested is in progress`);
    }
  }
  return checked;
}

// An expired limit comes with a stop request (OSFP.PR.3).
function checkStopRequests({ events, outcomes }) {
  const expired = events.filter((x) => x.record.event === "limit-expired" && filled(x.record.attemptId));
  for (const e of expired) {
    const requested = outcomes.some((o) => o.record.attemptId === e.record.attemptId && filled(o.record.stopRequestedAt));
    if (!requested) ruleFail("OSFP.PR.3", e.f, "reports an expired limit, but no outcome records a stop request");
  }
  return expired.length;
}

// A task is missed only after its start deadline, unfinished only after its total budget, and
// reported only on its own schedule (OSFP.PR.4).
function checkMissedTasks({ events, grants, latestGrantOf }) {
  const overdue = events.filter((x) => x.record.event === "overdue" && filled(x.record.taskId));
  for (const e of overdue) {
    const grant = latestGrantOf(e.record.taskId);
    if (!grant) {
      ruleFail("OSFP.PR.4", e.f, `reports ${an(e.record.result)} task with no grant in the examples`);
      continue;
    }
    if (e.record.result === "missed" && !(ms(e.record.expectedAt) + 1000 * grant.record.limits?.startAckSeconds <= ms(e.record.occurredAt))) {
      ruleFail("OSFP.PR.4", e.f, "reports a task as missed before its start deadline passed");
    }
    const started = events.find((x) => x.record.event === "started" && filled(x.record.attemptId) && x.record.attemptId === e.record.attemptId);
    if (e.record.result === "unfinished" && started && !(ms(started.record.occurredAt) + 1000 * grant.record.limits?.totalSeconds <= ms(e.record.occurredAt))) {
      ruleFail("OSFP.PR.4", e.f, "reports a task as unfinished before its total budget ran out");
    }
    const standing = grants.find((g) => g.record.id === grant.record.derivedFrom);
    if (standing && standing.record.scheduleId !== e.record.scheduleId) ruleFail("OSFP.PR.4", e.f, "names a schedule other than its task's standing grant");
  }
  return overdue.length;
}

// An inspection task ends with a result (OSFP.PR.6).
function checkInspectionResults({ events, grantsOf }) {
  const ended = events.filter((x) => x.record.event === "ended" && filled(x.record.taskId));
  for (const e of ended) {
    const inspection = grantsOf(e.record.taskId).some((g) => g.record.inspection === true);
    if (inspection && !("result" in e.record)) ruleFail("OSFP.PR.6", e.f, "ends an inspection task without a result");
  }
  return ended.length;
}

// Each set rule, the rules it checks, and the records it needs. With --records, a rule whose records
// the directory lacks is named as not checked; it does not pass by default.
const SET_RULES = [
  [checkRepeats, "OSFP.GE.1 and OSFP.GE.7 generations", []],
  [checkAuthority, "OSFP.AU.1", ["task grants", "progress events"]],
  [checkLifecycleEvents, "OSFP.PR.5", ["progress events"]],
  [checkAttemptTasks, "section 8 tasks", []],
  [checkAttemptHistory, "OSFP.GE.7 sequences, OSFP.OU.10, and OSFP.OU.11", ["outcomes"]],
  [checkDerivedGrants, "OSFP.AU.6", ["task grants"]],
  [checkRetryDecisions, "OSFP.OU.5", ["task grants", "outcomes"]],
  [checkStopWindows, "OSFP.OU.12", ["outcomes"]],
  [checkStopRequests, "OSFP.PR.3", ["progress events", "outcomes"]],
  [checkMissedTasks, "OSFP.PR.4", ["progress events", "task grants"]],
  [checkInspectionResults, "OSFP.PR.6", ["progress events", "task grants"]],
];
const notChecked = [];

function checkTheSet(examples) {
  const grouped = groupExamples(examples);
  const have = { "task grants": grouped.grants.length, outcomes: grouped.outcomes.length, "progress events": grouped.events.length };
  for (const [rule, ids, needs] of SET_RULES) {
    const missing = needs.filter((n) => !have[n]);
    if (!checkingStandard && missing.length) notChecked.push(`${ids} (no ${missing.join(" or ")})`);
    else ruleChecks += rule(grouped);
  }
}

// ------------------------------------------------------------------ [classes]

// "`OSFP.GE.1` to `OSFP.GE.3`, `OSFP.EV.7`" → the set of IDs it names.
function expandIds(cell, cls) {
  const ids = new Set();
  for (const part of cell.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^`OSFP\.([A-Z]{2})\.(\d+)`(?:\s+to\s+`OSFP\.([A-Z]{2})\.(\d+)`)?$/);
    if (!m || (m[3] && m[3] !== m[1])) {
      fail("classes", `the ${cls} row has "${part}", which is not an ID or a range of IDs in one area`);
      continue;
    }
    for (let n = Number(m[2]); n <= Number(m[4] ?? m[2]); n++) ids.add(`OSFP.${m[1]}.${n}`);
  }
  return ids;
}

function checkClasses() {
  const rows = new Map();
  for (const [label, , rules = ""] of table("Conformance", "Class").rows) {
    const cls = classKey(label);
    if (rows.has(cls)) fail("classes", `the conformance table has two rows for "${cls}"`);
    rows.set(cls, expandIds(rules, cls));
  }
  const named = classesNamed();
  for (const cls of new Set([...named, ...rows.keys()])) {
    if (!rows.has(cls)) fail("classes", `rules name the class "${cls}", but the conformance table has no row for it`);
    if (!named.has(cls)) fail("classes", `the conformance table has a row for "${cls}", but no rule names that class`);
    const want = new Set(rulesOfClass(cls).map((it) => it.id));
    const have = rows.get(cls) ?? new Set();
    for (const id of want) if (!have.has(id)) fail("classes", `${id} names ${cls} in standard.json, but the ${cls} row does not list it`);
    for (const id of have) if (!want.has(id)) fail("classes", `the ${cls} row lists ${id}, but standard.json does not give it that class`);
  }
  note("classes", `${rows.size} rows of the conformance table compared both ways with the classes of ${data.items.length} rules`);
}

// ------------------------------------------------------------------ [references]

function checkReferences() {
  const refs = section("References");
  const entries = new Map();
  for (const [, key, line] of refs.matchAll(/^- \[([^\]]+)\] (.+)$/gm)) {
    if (entries.has(key)) fail("references", `[${key}] has two entries in section 18`);
    entries.set(key, line);
  }
  const body = prose.replace(refs, "").replace(/`[^`\n]*`/g, "");
  const cited = new Set([...body.matchAll(/\[([A-Za-z][\w-]*)\](?!\()/g)].map((m) => m[1]));
  const byRule = new Set(data.items.flatMap((it) => list(it.citations)));

  for (const k of cited) if (!entries.has(k)) fail("references", `[${k}] is cited in the prose, but section 18 has no entry for it`);
  for (const [k, line] of entries) {
    if (!cited.has(k) && !byRule.has(k)) fail("references", `[${k}] has an entry in section 18, but neither the prose nor a rule cites it`);
    if (!/https?:\/\/\S+$/.test(line)) fail("references", `[${k}] in section 18 does not end with a URL`);
  }
  for (const b of data.bibliography) {
    const line = entries.get(b.key);
    if (!line) fail("references", `bibliography entry ${b.key} in standard.json has no entry in section 18`);
    else if (b.url && !line.endsWith(` ${b.url}`)) fail("references", `[${b.key}] in section 18 does not end with its URL in standard.json`);
    else if (b.doi && !line.includes(b.doi)) fail("references", `[${b.key}] in section 18 does not carry its DOI`);
  }
  note("references", `${cited.size} keys cited in the prose, ${entries.size} entries in section 18, ${data.bibliography.length} bibliography URLs compared`);
}

// ------------------------------------------------------------------ run

if (checkingStandard) {
  checkSchema();
  checkStructure();
}
const { files, setAside, examples } = readExamples();
checkExamples(examples, files, setAside);
checkEachExample(examples);
checkTheSet(examples);
const skipped = notChecked.length ? `; not checked, for want of records: ${notChecked.join("; ")}` : "";
note("rules", `${ruleChecks} rule checks on ${files.length} records, one by one and as a set${skipped}`);
if (checkingStandard) {
  checkClasses();
  checkReferences();
}

console.log(`check-osfp · OSFP ${data.version}`);
let total = 0;
for (const c of ORDER) {
  const msgs = failures.get(c);
  total += msgs.length;
  if (msgs.length) for (const m of msgs) console.log(`FAIL [${c}] ${m}`);
  else console.log(`ok   [${c}] ${notes.get(c)}`);
}
console.log(`Result: ${total} violation(s) → exit ${total ? 1 : 0}`);
process.exit(total ? 1 : 0);
