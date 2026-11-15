# Verification record

One dated entry per release, newest first. Each says what ran, what passed, and what it does not prove.

## 0.1.0-draft.1 — 2026-11-15

- **Ran:** `node scripts/check-standard.mjs`, `node scripts/check-osfp.mjs`, and `node scripts/self-test.mjs` on 2026-11-15, on Node v25.8.1 and on Node v22.23.5, both on macOS. The CI workflow runs the same three on GitHub's Ubuntu runner.
- **Result**, the same on both versions:
  ```
  ok   [version] 0.1.0-draft.1 read from spec/STANDARD.md, spec/standard.json, README.md
  ok   [changelog] looked for [Unreleased] and [0.1.0-draft.1] headings in CHANGELOG.md
  ok   [ids] 58 IDs read from spec/standard.json, 58 unique
  ok   [parity] 58 data IDs and 58 prose IDs compared both ways; unprefixed sweep found 0
  ok   [text] 58 text fields (statement) compared for equality with their ID's own definition; 58 definitions found; 0 restatement(s) with key words
  ok   [pinned] 5 pinned IDs checked
  ok   [citations] 58 items checked for introducedIn; 58 new in 0.1.0; 0 declared gap(s); 33 sources checked for a DOI or URL, presence only
  ok   [keywords] 87 uppercase key words; BCP 14 declaration present
  ok   [sections] 9 required sections looked for among 22 headings
  ok   [links] 46 relative links in 18 Markdown files resolved; 41 external links NOT checked (offline)
  ok   [ci] 1 action references in 1 workflow files checked for SHA pins
  Result: 0 violation(s), 0 warning(s) → exit 0

  ok   [schema] 58 rules and 33 sources in spec/standard.json validated against schema/standard.schema.json
  ok   [structure] 19 section titles, each used once; key words only in the 58 numbered rules and the BCP 14 declaration; CI runs 3 checks on push and pull_request
  ok   [examples] 12 examples, 205 fields read, each against its own record's tables and its own values
  ok   [rules] 110 rule checks on 12 examples, one by one and as a set
  ok   [classes] 5 rows of the conformance table compared both ways with the classes of 58 rules
  ok   [references] 37 keys cited in the prose, 49 entries in section 18, 33 bibliography URLs compared
  Result: 0 violation(s) → exit 0

  265 cases, 265 behaved → exit 0
  ```
- **Each condition can fail.** The self-test makes one change to a copy of the repository per case, and expects a named result. Its 265 cases include one for each condition in both checks: a case that fails on that condition, or, for a condition that lets a correct record through, a case that passes. A mutation run on the final checks, on 2026-11-15, tested that claim with review 3's method. One at a time, it removed each of the 159 failure sites that it finds in the code, 46 parts of compound conditions, and the 3 guards that stop a run, and it ran the self-test against each changed copy. The self-test failed every time. Nine more parts on review 3's list target code that this draft replaced, such as lists that the checker now reads from the prose, so they no longer apply. On the checks that review 3 read, the self-test caught 1 of 79 conditions. The mutation script is a scratch tool, not part of the repository.
- **Sources:** on 2026-11-15, each of the 64 external URLs in the repository, outside the self-test's test data, was requested. 63 returned HTTP 200. The predicate type URL returned 404, because `main` gets that page only when this draft merges. Each GitHub link was also looked up at its pinned commit or tag through the GitHub API, and each file and directory exists there. Line anchors were checked against file lengths on 2026-11-12. The two DOIs resolved on 2026-11-11, but their publishers refuse automated clients, so their passages were read in the public copies at each entry's URL.
- **Passages read and confirmed** at the version each reference names, on 2026-11-11, 2026-11-12, 2026-11-14, or 2026-11-15:
  - `a2a-spec` 1.0.1: the definitions of `TASK_STATE_UNSPECIFIED`, `TASK_STATE_SUBMITTED`, `TASK_STATE_INPUT_REQUIRED`, `TASK_STATE_AUTH_REQUIRED`, and `TASK_STATE_COMPLETED`; required fields "MUST be present and set in valid messages"; a blocking send waits for "a terminal state" or "an interrupted state"; "SHOULD ignore unrecognized fields"; `VersionNotSupportedError`; metadata as "a flexible key-value map"; `TASK_STATE_INPUT_REQUIRED` "Indicates that the agent requires additional user input to proceed. This is an interrupted state."
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
  - `uhp-harnesses`, section 4.3: "MUST enforce it as a hard block"; "MUST still convey the restriction to the agent — as a standing instruction"; "MUST NOT overstate". `uhp-tasks`, sections 3.2 and 6: "the task ends on the question"; "a normal continuation"; keys "SHOULD be retained for at least 24 hours".
  - `w3c-prov-dm`: "Usage is the beginning of utilizing an entity by an activity"; "A revision is a derivation for which the resulting entity is a revised version of some original"; "Communication is the exchange of some unspecified entity by two activities".
  - `k8s-pod-lifecycle`: "The container runtime sends SIGKILL to any processes still running in any container in the Pod." `RFC3339`: "time-second = 2DIGIT ; 00-58, 00-59, 00-60 based on leap second rules". `cloudevents`: attribute names "MUST consist of lower-case letters ('a' to 'z') or digits ('0' to '9')".
  - `agent-plugins`: a 1.0.0 format for Agent Skills and MCP servers. `mcp-tasks`: `io.modelcontextprotocol/tasks`.
  - `in-toto-test-result` at commit b654af7: "that all tests were in fact run"; `result` is "One of `PASSED`, `WARNED`, or `FAILED`". `ag-ui`: "an absent outcome means success". In NEED.md: Agent Baseline's Secure Software Factory, version 1 of 13 October 2026: "never grants of authority", "fails closed", and "security-relevant events each boundary and the execution layer must" record; Praxso attested's README: a pull request "can still weaken its own tests".
  - Resolved, passage not re-read: `agent-skills`, `agents-md`, `dsse`, `otel`, `RFC2119`, `RFC8174`, `RFC8693`, `sarif`, `semver`, `w3c-qa`, `ws-i-bp`.
- **Observed behavior:** with pytest 9.0.2 on Python 3.14.5, on 2026-11-12: a suite whose two tests are both skipped exits 0 ("2 skipped"); an empty suite exits 5 ("no tests ran"); "1 passed, 1 xfailed, 1 error" exits 1; and `-k` that deselects all tests but one passing test exits 0 ("1 passed, 2 deselected").
- **Schema:** `check-osfp.mjs` validates `spec/standard.json` against `schema/standard.schema.json` on every run. It implements only the keywords that schema uses, and stops with exit 2 if the schema uses another.
- **Fixtures:** the files in `examples/` pass `check-osfp.mjs`. No record schemas exist yet, so nothing validates them against one.
- **Adversarial reviews:** four, by fresh-context AI reviewers, of unpublished earlier texts. On 2026-11-11: block, with 22 findings ([reviews/2026-11-11.md](reviews/2026-11-11.md)). On 2026-11-12: block, with 4 blocking findings among 22 ([reviews/2026-11-12.md](reviews/2026-11-12.md)). On 2026-11-14: block, with 1 blocking finding among 35, then a re-check of the fixes that blocked on one new finding among 11 ([reviews/2026-11-14.md](reviews/2026-11-14.md)). On 2026-11-15: six agents, one lens each, with 53 recommendations ([reviews/2026-11-15.md](reviews/2026-11-15.md)). The editor re-read the cited source for each finding before acting on it, and re-ran each wrong copy that a review built. The self-test re-checks each finding that a machine can check. No review has read the changes made for review 4.
- **Outside review:** none yet.
- **Does not prove:** that each source supports its rule as strongly as the rule needs; that the prose is clear, correct, or in scope; that the field tables are complete; that any implementation conforms; that anything deleted from both prose and data was meant to go; or that a sentence which contradicts a rule without a key word would be caught.
