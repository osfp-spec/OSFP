# Verification record

One dated entry per release, newest first. Each says what ran, what passed, and what it does not prove.

## 0.1.0-draft.1 — 2026-11-16

- **Ran:** `node scripts/check-standard.mjs`, `node scripts/check-osfp.mjs`, and `node scripts/self-test.mjs` on 2026-11-16, on Node v25.8.1 and on Node v22.23.5, both on macOS. The CI workflow runs the same three on GitHub's Ubuntu runner.
- **Result**, the same on both versions:
  ```
  ok   [version] 0.1.0-draft.1 read from spec/STANDARD.md, spec/standard.json, README.md
  ok   [changelog] looked for [Unreleased] and [0.1.0-draft.1] headings in CHANGELOG.md
  ok   [ids] 59 IDs read from spec/standard.json, 59 unique
  ok   [parity] 59 data IDs and 59 prose IDs compared both ways; unprefixed sweep found 0
  ok   [text] 59 text fields (statement) compared for equality with their ID's own definition; 59 definitions found; 0 restatement(s) with key words
  ok   [pinned] 5 pinned IDs checked
  ok   [citations] 59 items checked for introducedIn; 59 new in 0.1.0; 0 declared gap(s); 34 sources checked for a DOI or URL, presence only
  ok   [keywords] 88 uppercase key words; BCP 14 declaration present
  ok   [sections] 9 required sections looked for among 22 headings
  ok   [links] 47 relative links in 18 Markdown files resolved; 41 external links NOT checked (offline)
  ok   [ci] 1 action references in 1 workflow files checked for SHA pins
  Result: 0 violation(s), 0 warning(s) → exit 0

  ok   [schema] 59 rules and 34 sources in spec/standard.json validated against schema/standard.schema.json
  ok   [structure] 19 section titles, each used once; key words only in the 59 numbered rules and the BCP 14 declaration; CI runs 3 checks on push and pull_request
  ok   [examples] 12 records in examples/, 205 fields read, each against its own record's tables and its own values; set aside 1 other file: README.md
  ok   [rules] 108 rule checks on 12 records, one by one and as a set
  ok   [classes] 5 rows of the conformance table compared both ways with the classes of 59 rules
  ok   [references] 38 keys cited in the prose, 50 entries in section 18, 34 bibliography URLs compared
  Result: 0 violation(s) → exit 0

  400 cases, 400 behaved → exit 0
  ```
- **What the self-test shows.** The self-test makes one change to a copy of the repository per case, and expects a named result. Its 400 cases include a case that fails on each failure site in both checks. A mutation run on the final checks, on 2026-11-15 and 2026-11-16, measured how much more of the checks the cases reach. It used the method of the re-check of review 4. It parsed both scripts, made one change at a time, and ran the unchanged self-test against each changed copy. Each change was one of four kinds: remove a call that records a failure; keep only one side of an `&&` or an `||`; force the test of a `?:` true, or false; or disable a guard that stops a run with exit 2, or the handler for internal errors.

  | Kind of change | check-osfp.mjs, caught | check-standard.mjs, caught |
  |---|---|---|
  | Remove a failure site | 144 of 144 | 34 of 34 |
  | Keep one side of `&&` or `\|\|` | 283 of 308 | 41 of 74 |
  | Force a `?:` test | 48 of 60 | 11 of 34 |
  | Disable a guard | 22 of 22 | 12 of 13 |

  94 of the 689 changes survived: 37 in check-osfp.mjs and 57 in check-standard.mjs.

  - In check-osfp.mjs, 14 change only a message or which checks a run prints, and 18 cannot change a result, such as a guard that a later condition repeats, or a comparison with a missing time.
  - Four change a result only for input that another check already fails, or that no rule forbids but that makes little sense: a progress event with no task or no attempt, and a grant whose start deadline is longer than its total budget.
  - One is a gap: a `missed` report for a schedule that created no task is not timed against the schedule's start deadline.
  - In check-standard.mjs, the generic checker, the survivors are in parts that OSFP's files do not use, such as local IDs, definitions in tables or under headings, rules from earlier versions, and `--help`; in message text; or in its handler for internal errors, which no input that was tried reaches.

  The mutation tools are scratch tools, not part of the repository.
- **The namespace move.** After the mutation run, the identifiers moved from the maintainer's GitHub account to the osfp-spec organization, and the repository moved with them. The checkers did not change. The self-test changed only those strings, and all 400 cases behave.
- **Sources:** on 2026-11-16, after the move, each of the 70 external URLs in the repository, outside the self-test's test data, was requested. Three are `example.com` placeholders in the example records, and do not resolve by design. Of the other 67, 66 returned HTTP 200. The predicate type URL returned 404, because `main` gets that page only when this draft merges. Each GitHub file and directory link was also looked up through the GitHub API at its commit, tag, or branch, and each exists there except that page. Line anchors were checked against file lengths on 2026-11-12. The two DOIs resolved on 2026-11-11, but their publishers refuse automated clients, so their passages were read in the public copies at each entry's URL.
- **Passages read and confirmed** at the version each reference names, on 2026-11-11, 2026-11-12, 2026-11-14, or 2026-11-15:
  - `a2a-spec` 1.0.1: the definitions of `TASK_STATE_UNSPECIFIED`, `TASK_STATE_SUBMITTED`, `TASK_STATE_INPUT_REQUIRED`, `TASK_STATE_AUTH_REQUIRED`, and `TASK_STATE_COMPLETED`; required fields "MUST be present and set in valid messages"; a blocking send waits for "a terminal state" or "an interrupted state"; "SHOULD ignore unrecognized fields"; `VersionNotSupportedError`; metadata as "a flexible key-value map"; `TASK_STATE_INPUT_REQUIRED` "Indicates that the agent requires additional user input to proceed. This is an interrupted state."; and, in section 3.1.5, "The server will attempt to cancel the task, but success is not guaranteed".
  - `a2a-proto` at the 1.0.1 tag: `TASK_STATE_UNSPECIFIED = 0`, the state field marked REQUIRED, and `Task.metadata`.
  - `anthropic-managed-agents`: "the append-only log of everything that happened"; "Narrow scoping is an obvious mitigation, but"; tokens "never reachable from the sandbox".
  - `bash-pipelines`: the exit status of a pipeline.
  - `cloudevents`: `source` + `id` unique; a re-sent event "MAY have the same `id`"; `type` "SHOULD be prefixed with a reverse-DNS name"; `time` OPTIONAL.
  - `confused-deputy`: "The compiler serves two masters".
  - `idempotency-key`, draft 08: a timed-out client "does not know if it can safely retry the request"; a key lets the resource "recognize subsequent retries".
  - `in-toto-statement` and `in-toto-digest-set`, 1.2.0: `predicateType`; `gitTree` and `dirHash`; non-predefined algorithm names are allowed; `dirHash` hashes the output of `find . -type f`. The field types page: a type URI "SHOULD resolve to a human-readable description, but MAY be unresolvable".
  - `k8s-job`: `activeDeadlineSeconds`, and "Failed with reason: DeadlineExceeded". `k8s-cronjob`: `startingDeadlineSeconds`, and missed Jobs counted as failed.
  - `linux-cgroup-v2`: `populated`. `linux-watchdog`: "a hardware circuit that can reset the computer system in case of a software fault".
  - `mcp-spec`: tool descriptions "should be considered untrusted"; "explicit user consent before invoking any tool". `mcp-tools`: "Tool name uniqueness is scoped to a single server"; the server name "SHOULD NOT be relied upon for disambiguation".
  - `metr-reward-hacking`: the three methods quoted in DESIGN-LESSONS.md, which models used "attempting (often successfully) to get a higher score".
  - `otel-genai` at the cited commit: "Status: Development".
  - `protobuf-json`: fields at their default value are "omitted by default in JSON output". `protobuf-presence`: fields with implicit presence "are not serialized if they contain their default value".
  - `pytest-exit-codes` and `pytest-skipping`, 9.0: exit code 5, "No tests were collected"; "A skip means that you expect your test to pass only if some conditions are met".
  - `RFC6749`: "any scope not originally granted". `RFC7662`: `active`. `RFC9396`: `type` "is REQUIRED"; an object "of known type but containing unknown fields" is refused.
  - `saltzer-schroeder`: "Fail-safe defaults" and "Complete mediation".
  - `slsa-build` 1.2: signing material "MUST NOT be accessible to the environment running the user-defined build steps", in the requirement "Provenance is Unforgeable", which applies at Build L3. `slsa-provenance` 1.2: "Describe how an artifact or set of artifacts was produced". `slsa-vsa` 1.2: `inputAttestations` and `verificationResult`.
  - `uhp-harnesses`, section 4.3: "MUST enforce it as a hard block"; "MUST still convey the restriction to the agent — as a standing instruction"; "MUST NOT overstate". `uhp-tasks`, sections 3.2 and 6: "the task ends on the question"; "a normal continuation"; keys "SHOULD be retained for at least 24 hours". `uhp-sessions`, section 4: "Cancellation is a request, not a guarantee of immediacy"; a cancelled task ends with `status: "cancelled"`; a server answers a cancel within one second "even if the harness takes longer to wind down".
  - `w3c-prov-dm`: "Usage is the beginning of utilizing an entity by an activity"; "A revision is a derivation for which the resulting entity is a revised version of some original"; "Communication is the exchange of some unspecified entity by two activities".
  - `k8s-pod-lifecycle`: "The container runtime sends SIGKILL to any processes still running in any container in the Pod." `RFC3339`: "time-second = 2DIGIT ; 00-58, 00-59, 00-60 based on leap second rules". `cloudevents`: attribute names "MUST consist of lower-case letters ('a' to 'z') or digits ('0' to '9')".
  - `agent-plugins`: a 1.0.0 format for Agent Skills and MCP servers. `mcp-tasks`: `io.modelcontextprotocol/tasks`.
  - `in-toto-test-result` at commit b654af7: "two compulsory fields, `result` that describes the result of the test run, and `configuration`"; `passedTests`, `warnedTests`, and `failedTests` are each "_optional_"; its uses include verifying "that all tests were in fact run"; `result` is "One of `PASSED`, `WARNED`, or `FAILED`". `ag-ui`, on the page titled "Runs and Steps": `RUN_FINISHED` "Closes a run that did not fail"; "an absent outcome means success"; "Stripping an optional field leaves it absent".
  - In NEED.md: Agent Baseline's Secure Software Factory, version 1 of 13 October 2026: "never grants of authority", "fails closed", and the security-relevant events to record, "such as authorization decisions, admissions, process starts, and network requests"; Praxso attested's README at commit 491346d: a pull request "can still weaken its own tests".
  - Resolved, passage not re-read: `agent-skills`, `agents-md`, `dsse`, `otel`, `RFC2119`, `RFC8174`, `RFC8693`, `sarif`, `semver`, `w3c-qa`, `ws-i-bp`.
- **Observed behavior:** with pytest 9.0.2 on Python 3.14.5, on 2026-11-12: a suite whose two tests are both skipped exits 0 ("2 skipped"); an empty suite exits 5 ("no tests ran"); "1 passed, 1 xfailed, 1 error" exits 1; and `-k` that deselects all tests but one passing test exits 0 ("1 passed, 2 deselected").
- **Schema:** `check-osfp.mjs` validates `spec/standard.json` against `schema/standard.schema.json` on every run. It implements only the keywords that schema uses, and stops with exit 2 if the schema uses another.
- **Fixtures:** the files in `examples/` pass `check-osfp.mjs`. No record schemas exist yet, so nothing validates them against one.
- **Adversarial reviews:** four, by fresh-context AI reviewers, of unreleased earlier texts. On 2026-11-11: block, with 22 findings ([reviews/2026-11-11.md](reviews/2026-11-11.md)). On 2026-11-12: block, with 4 blocking findings among 22 ([reviews/2026-11-12.md](reviews/2026-11-12.md)). On 2026-11-14: block, with 1 blocking finding among 35, then a re-check of the fixes that blocked on one new finding among 11 ([reviews/2026-11-14.md](reviews/2026-11-14.md)). On 2026-11-15: six agents, one lens each, with 53 recommendations, then a re-check of the fixes by two reviewers, one for the text and one for the checks, each of which blocked on 2 of its findings, among 18 and 14 ([reviews/2026-11-15.md](reviews/2026-11-15.md)). The editor re-read the cited source for each finding before acting on it, and re-ran each wrong copy that a review built. The self-test re-checks each finding that a machine can check. No review has read the changes made for the last re-check.
- **Outside review:** none yet.
- **Does not prove:** that each source supports its rule as strongly as the rule needs; that the prose is clear, correct, or in scope; that the field tables are complete; that any implementation conforms; that anything deleted from both prose and data was meant to go; that a sentence which contradicts a rule without a key word would be caught; that the CI guard sees every way a workflow can skip a check, because it does not parse YAML and reads only the forms that this workflow uses; or that the checks cover what the mutation survivors above show no case tests.
