# Open Software Factory Profile (OSFP)

**Version:** 0.1.0-draft.1
**Date:** 2026-11-16
**Status:** Draft for review. Not adopted. No outside review yet.
**Editor:** Sunny Patneedi
**License:** Apache License 2.0

## 1. Purpose

A software factory turns a request into a verified change. It decides what a task may touch, hands the work to a harness, checks the result, and shows it to a person. The standards a factory builds on define how to run a harness, call a tool, and sign a statement. None of them defines what a factory's own records mean. So each factory defines that itself, and a reader cannot tell what another factory's records claim.

OSFP gives those records one meaning. Like WS-I Basic Profile [ws-i-bp], it constrains standards that already exist so that they work together. Unlike that profile, it also defines what its records mean, and it adds four records that none of those standards define:

- a **task grant**, which states the authority a task runs under;
- an **outcome**, which states what happened to an attempt, including when nobody knows;
- **verification evidence**, which states what was checked and whether it passed;
- **progress** events, which show that work is moving, and report work that stopped or never started.

## 2. Scope

OSFP covers:

- the authority a task runs under, and how that authority is confirmed and revoked;
- the states of an attempt, including the unknown state and the three parts of a stop;
- the evidence that a change passed its checks, and what may not count as evidence;
- the time limits on an attempt, the supervisor that enforces them, and scheduled tasks that did not start or end in time;
- how these records map onto the standards in sections 11 and 14.

## 3. Out of scope

Each topic below belongs to another standard. OSFP refers to it and does not redefine it.

- Running a harness (sessions, tasks, streaming, files, environments): defer to UHP [uhp], or to the harness's own interface.
- Calling tools: defer to MCP [mcp-tools].
- Packaging skills and plugins: defer to Agent Skills [agent-skills] and Agent Plugins [agent-plugins].
- Repository instructions for agents: defer to AGENTS.md [agents-md].
- Messages between agents: defer to A2A [a2a-spec].
- Traces, metrics, and logs: defer to OpenTelemetry [otel].
- Build provenance: defer to SLSA [slsa-provenance].
- Issuing and validating tokens: defer to OAuth 2.0 [RFC6749].
- Choosing a model or a harness for a task: a product decision, not part of this profile.

OSFP is not a harness, a runtime, a product, or a certification. It does not say how to build a factory. It says what a factory's records mean.

## 4. Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals, as shown here.

Each rule has an ID of the form `OSFP.<area>.<n>`. The areas are GE (general), AU (task grant), OU (outcome), EV (verification evidence), PR (progress), and PF (rules for the standards OSFP profiles). IDs are permanent. The file `standard.json` holds every rule with the same ID and the same words, and names the classes of product each rule applies to (section 12).

OSFP records are JSON objects. Field names in this document are written in `code`. Only the numbered rules, and the conformance clauses in section 12, state requirements. The rest of the text defines the terms the rules use, such as what a grant permits (section 7), and explains the rules. The field tables are informative in this draft. Section 16 defines each term, and this document uses each term in one sense only. A key in square brackets, such as [RFC3339], names an entry in section 18.

## 5. The factory model

This section is informative.

A **request** arrives. The **factory** turns it into one **task** with a fixed scope, and records a **task grant** that a person approved. It dispatches an **attempt** of the task to a **harness**, and records each change in the attempt's state as an **outcome**. A **verifier**, outside the attempt's reach, runs **checks** on the result and records **verification evidence**. A person reviews the evidence and records a **verdict**. Throughout, a **supervisor** enforces the attempt's time limits, and **progress** events show whether work is moving.

A **schedule** is a standing request. Each time it fires, it creates a new **scheduled task**. A person approves one **standing grant** for the schedule. Each scheduled task runs under a **derived grant** that stays within it.

| Layer | What answers it | Standard |
|---|---|---|
| Which task is authorized, and what happened to it | The factory | OSFP |
| Which harness runs the attempt, and how | The harness interface | UHP, or the harness's own interface |
| Which tools the harness may call | The tool protocol | MCP |
| Which model answers a request inside the harness | The harness or a model router | None; a product decision |

These layers do not grant each other's authority. A harness cannot widen a grant. A tool listing grants nothing. A model's text is not evidence.

## 6. General rules

An OSFP record never changes after it is written. When something changes, the producer writes a new record with a new `id`, so any reader can replay what happened.

- `OSFP.GE.1` — Every OSFP record MUST carry `osfpVersion`, `recordType`, and an `id` that is never reused.
- `OSFP.GE.2` — Every timestamp in an OSFP record MUST be an RFC 3339 date-time in UTC, written with the offset `Z`.
- `OSFP.GE.3` — A producer MUST NOT change an OSFP record after writing it; a change of state is a new record with a new `id`.
- `OSFP.GE.4` — A consumer MUST ignore fields it does not recognize, and MUST reject a record whose `osfpVersion` it does not support.
- `OSFP.GE.5` — A consumer MUST NOT treat a missing status or state, or a status or state value it does not recognize, as success.
- `OSFP.GE.6` — A consumer MUST reject a record that reuses a known `id` with a different JSON value.
- `OSFP.GE.7` — A producer MUST give each grant for a task or a schedule the next `generation`, and each outcome of an attempt the next `sequence`, and MUST NOT record a different state after a terminal state, except `unknown` when `OSFP.OU.4` requires it.
- `OSFP.GE.8` — A consumer MUST treat a task or a schedule whose grants repeat a `generation` as having no authority, and an attempt whose outcomes repeat a `sequence`, or move from a terminal state to any state but `unknown`, as `unknown`.

## 7. Task grant

A task grant states the authority one task runs under. A request says what someone wants. Only a grant says what may be touched.

| Field | Meaning |
|---|---|
| `id`, `osfpVersion`, `recordType` | `recordType` is `task-grant` |
| `taskId` | The task this grant covers. A standing grant has `scheduleId` instead |
| `scheduleId` | Standing grants only: the schedule whose tasks this grant covers |
| `generation` | 1 for the first grant of a task, or of a schedule. Each later grant for the same task or schedule has the next number |
| `requestRef` | A reference to the request. It carries no authority |
| `resources` | Each resource the task may read or change: `uri`, and `access`, which is `read` or `write`. Resources match by exact `uri` |
| `operations` | The operations the task may perform, from the table below |
| `disclosures` | Each item the factory may send to the harness: `source`, `revision`, and `destination` |
| `tools` | Each MCP tool the factory provides: `server`, an identifier that the factory assigns to the MCP server and keeps unique, and `name`, the tool's name |
| `restrictions` | Each restriction on the harness: `target` (what is restricted, such as `network` or a tool's name), `rule` (what the restriction does, such as `deny-all` or `disabled`), and `enforcement`, which is `enforced` or `instruction` |
| `limits` | `startAckSeconds` and `totalSeconds` for each attempt (section 10) |
| `inspection` | True if the task is an inspection task (section 10) |
| `unknownAttempts` | The `attemptId` of each attempt that was `unknown` when the person approved this grant. Listing one records the person's decision that the task may run again after it (section 8) |
| `approvedBy`, `approvedAt` | The person who approved this grant, or the standing grant it derives from, and when |
| `derivedFrom` | Derived grants only: the `id` of the standing grant this grant derives from |
| `expiresAt` | When the grant ends. A grant without one does not expire |

| Operation | Permits |
|---|---|
| `dispatch` | Dispatching attempts of the task to a harness |
| `publish` | Making a change or a message visible to others: pushing to a shared branch, opening or updating a pull request or an issue, or posting a message |
| `merge` | Integrating a change into a protected branch |

A grant permits a side effect only if the side effect is one of these:

- a change to a resource that the grant lists with `write` access, visible only inside the factory;
- a publish or a merge on such a resource, when the grant also lists `publish` or `merge`.

It permits no other side effect. A deploy, a release to users, and a payment are none of these, so no grant in this version permits them.

A task's **authority** is what its latest grant permits, until that grant expires. The latest grant is the one with the highest `generation`. For a scheduled task, authority is also limited to what the schedule's latest standing grant permits, until that grant expires.

A grant is never edited. To narrow, widen, or revoke authority, the factory records a new grant for the same task or schedule with the next `generation`. A grant that lists no resources, operations, disclosures, or tools permits nothing, so recording one revokes authority. Revoking a standing grant revokes every grant derived from it. A factory may record a grant that permits nothing without a person, for example when it finds a leaked credential (`OSFP.AU.2`). Such a grant cannot let a task run again after an unknown attempt, because it does not permit `dispatch` (`OSFP.OU.5`).

A harness can make side effects of its own, without passing through the factory. The factory's confirmation before each side effect (`OSFP.AU.5`) does not reach those. When a harness can perform an operation or reach a resource that the task's authority does not permit, for example because it holds a credential that can push, the grant carries a restriction against it, recorded as `instruction`, never as `enforced` (`OSFP.AU.7`, `OSFP.AU.11`). A grant that only leaves something out does not show that it is blocked.

A task grant is its own record, not an OAuth 2.0 `authorization_details` object [RFC9396]. That RFC requires a `type` field, and requires an authorization server to refuse an object of known type that contains unknown fields. OSFP consumers ignore unknown fields instead (`OSFP.GE.4`). A factory may translate a grant into an `authorization_details` object for an OAuth server. That translation is outside this profile.

- `OSFP.AU.1` — A factory MUST record a task grant before it dispatches any attempt of that task, and MUST dispatch an attempt only while the task's authority permits `dispatch`.
- `OSFP.AU.2` — A grant's `approvedBy` MUST name the person who approved it, or the person who approved the standing grant it derives from; a grant that permits nothing MAY instead name the person or product that recorded it.
- `OSFP.AU.3` — A factory MUST NOT treat a request, an instruction, a skill, or a tool listing as a grant of authority.
- `OSFP.AU.4` — A grant MUST list every resource, operation, disclosure, and tool it permits, and a factory MUST NOT provide, perform, or relay any that the task's authority does not permit.
- `OSFP.AU.5` — Before each side effect it performs or relays, a factory MUST confirm that the task's authority permits that side effect, and MUST NOT perform it otherwise.
- `OSFP.AU.6` — A derived grant MUST NOT permit anything that its standing grant does not permit, MUST keep each of the standing grant's restrictions and its `inspection` value, and MUST NOT have a longer limit or a later expiry.
- `OSFP.AU.7` — For each restriction in a grant, a factory MUST record whether it is enforced or only conveyed to the harness as an instruction, and MUST NOT record an instruction as enforced.
- `OSFP.AU.8` — Each disclosure in a grant MUST name its source, its revision, and its destination.
- `OSFP.AU.9` — A factory MUST NOT place a credential in a model's input.
- `OSFP.AU.10` — A factory SHOULD keep credentials out of reach of code that a model writes, for example behind a proxy outside the harness's sandbox.
- `OSFP.AU.11` — When a harness can perform an operation, or reach a resource, that the task's authority does not permit without passing through the factory, the grant MUST carry a restriction against it, recorded as an instruction.

## 8. Outcome

An outcome states what happened to one attempt at one moment. Its most important state is `unknown`: the factory cannot establish whether the attempt ran or what it changed.

| Field | Meaning |
|---|---|
| `id`, `osfpVersion`, `recordType` | `recordType` is `outcome` |
| `taskId`, `attemptId` | The task, and the attempt this record describes |
| `sequence` | 1 for the first outcome of an attempt. Each later outcome for the same attempt has the next number |
| `harness` | The harness's `name` and `version` |
| `state`, `stateAt` | One state from the table below, and when it began |
| `stopRequestedAt`, `stopConfirmedAt`, `cleanupConfirmedAt` | The three parts of a stop. Each is absent until it happens, and keeps its value in every later outcome of the attempt |
| `note` | Optional plain-language detail, for example why the state is `unknown` |

| State | Meaning |
|---|---|
| `admitted` | The factory accepted the attempt under a grant. The harness has not acknowledged it |
| `started` | The harness acknowledged the attempt |
| `waiting` | The attempt needs input or authorization from a person |
| `completed` | The harness reported that the attempt is done. This says nothing about whether the result passed its checks |
| `failed` | The harness reported failure |
| `canceled` | The attempt stopped because someone asked it to |
| `rejected` | The factory or the harness refused the attempt |
| `unknown` | The factory cannot establish whether the attempt ran or what it changed |

`completed`, `failed`, `canceled`, and `rejected` are **terminal**: an attempt that reaches one leaves it only for `unknown`, when the factory finds that it cannot establish what the attempt did (`OSFP.GE.7`, `OSFP.OU.4`). For example, a process of a `completed` attempt may still be running. `unknown` is not terminal. An attempt stays `unknown` until the factory establishes what it did.

When an attempt's state changes, or a stop moves forward, the factory writes a new outcome for the same `attemptId` with the next `sequence`. The attempt's current state is in its outcome with the highest `sequence`.

A **retry** is a new attempt of a task. It has a new `attemptId`, so no harness can recognize it as a repeat. A **re-send** is the same command sent again under its original identity, which a harness that removes duplicates can recognize. A re-send is safe only while the harness still holds that identity. UHP, for example, asks servers to retain idempotency keys for at least 24 hours [uhp-tasks]. After that, the factory records `unknown` instead of re-sending. A retry is never safe after a timeout, because the first attempt may still be changing things. A stop is different: a factory can always send a new stop command, with a new identity.

The resources an attempt **could change** are those its grant gives `write` access to, and any that its harness can change without passing through the factory (`OSFP.AU.11`). Two URIs that might name one resource, such as the SSH and HTTPS URLs of one repository, count as one unless the factory has established that they differ.

An attempt that is being stopped, or that is `unknown`, may still be changing the resources it could change. So from the request to stop an attempt until its cleanup is confirmed, the factory dispatches no other attempt that could change those resources: no other attempt of the task, no scheduled task, and no attempt for a new request (`OSFP.OU.12`). Once the attempt is `unknown`, only a person can lift that. The decision to try again takes the form of a new grant for the next attempt's task that permits `dispatch` and whose `unknownAttempts` names the unknown attempt (`OSFP.OU.5`).

The factory can end `unknown` itself. It confirms the stop and the cleanup, establishes what the attempt changed in each resource it could change, and records the state it found, with a `note` that says how (`OSFP.OU.11`). A harness's report alone does not establish it. Only when the factory cannot end `unknown` does a new attempt need a person.

- `OSFP.OU.1` — A factory MUST persist an attempt's `attemptId` before it dispatches the attempt to a harness.
- `OSFP.OU.2` — An outcome MUST be in exactly one of these states: `admitted`, `started`, `waiting`, `completed`, `failed`, `canceled`, `rejected`, or `unknown`.
- `OSFP.OU.3` — A factory MUST NOT record `started` until the harness acknowledges the attempt; admitting an attempt is not starting it.
- `OSFP.OU.4` — When a factory cannot establish whether an attempt ran, or what it changed in the resources it could change, it MUST record the state `unknown`.
- `OSFP.OU.5` — While an attempt is `unknown`, a factory MUST NOT dispatch another attempt of the same task, or any attempt that could change a resource that the unknown attempt could change, unless a person has approved, since the attempt became `unknown`, a new grant for the task of the attempt to be dispatched that permits `dispatch` and whose `unknownAttempts` names the unknown attempt.
- `OSFP.OU.6` — When a factory sends a command to a harness again, it MUST reuse the command's original identity, and MUST NOT reuse that identity for a different command, or once the harness may no longer hold it.
- `OSFP.OU.7` — A factory MUST record a stop as three separate facts, each with its own time: stop requested, stop confirmed, and cleanup confirmed.
- `OSFP.OU.8` — A factory MUST NOT record cleanup as confirmed until every process, container, and volume the attempt created is gone; the exit of a lead process does not confirm cleanup.
- `OSFP.OU.9` — A factory MUST record a new outcome each time an attempt's state changes, and each time a stop moves forward.
- `OSFP.OU.10` — After a stop is requested, a factory MUST NOT record a terminal state for the attempt until the stop is confirmed.
- `OSFP.OU.11` — A factory MUST NOT move an attempt out of `unknown` until it has confirmed cleanup and established what the attempt changed in each resource it could change, and the outcome that ends `unknown` MUST say in `note` how the factory established it.
- `OSFP.OU.12` — After a stop of an attempt is requested, a factory MUST NOT dispatch another attempt of the same task, or any attempt that could change a resource that the stopping attempt could change, until the stopping attempt's cleanup is confirmed or the attempt is `unknown`.

## 9. Verification evidence

Verification evidence states what a verifier checked, on exactly which tree, and what happened. It is an in-toto Statement [in-toto-statement] with this predicate type:

`https://github.com/osfp-spec/OSFP/blob/main/predicates/verification-evidence/v0.1.md`

The verifier works outside the attempt's reach. An attempt that can write its own evidence, or reach the key that signs it, can claim anything. SLSA Build L3 asks the same of build provenance: signing material must not be "accessible to the environment running the user-defined build steps" [slsa-build].

| Predicate field | Meaning |
|---|---|
| `id`, `osfpVersion`, `recordType` | `recordType` is `verification-evidence` |
| `taskId`, `attemptId` | The attempt whose result was checked |
| `checks` | One entry per check, with the fields in the next table |
| `findings` | Each SARIF file's digest, as an in-toto digest set, if any |
| `verifier`, `checkedAt` | Who ran the checks, and when |

| Check field | Meaning |
|---|---|
| `name`, `command` | The check's name, and the command that ran it |
| `status` | `passed`, `failed`, `not-run`, or `incomplete` |
| `unitsExamined`, `unitsFailed`, `unitsSkipped` | How many units the check examined, how many of those failed or errored, and how many it did not examine |
| `exitStatus`, `successStatus` | The exit status of the command that ran the check, absent if the command did not run or a signal ended it; and the exit status that means success, if the check's tool documents one other than 0 |
| `outputComplete`, `outputDigest` | False if the output was cut off; the full output's digest, as an in-toto digest set |
| `treeAtStart`, `treeAtEnd` | The digest of the checked tree as it is on disk, as an in-toto digest set [in-toto-digest-set] with a `gitTree` or a `dirHash` value, at the check's start and at its end. A `gitTree` value is the tree that git would record for those files under ignore rules that the verifier controls, so it leaves out the files those rules ignore |
| `inputsChanged`, `changedInputs` | True if the attempt changed a test, a grader, an assertion, or other code or configuration that decides this check's result, other than the code the check judges, even if the check did not run the changed version; the paths it changed. Both are absent if the verifier cannot tell |
| `answersReachable` | True if the attempt could read expected answers or a reference implementation that this check compares against and that were withheld from the attempt. Absent if the verifier cannot tell |

A check examines **units**: tests for a test suite, files for a linter, targets for a build. A unit that the check skipped, deselected, or ran as an expected failure is not examined, even when the tool skipped it while collecting it. A unit that could not be built, collected, or loaded, and that the tool did not report as skipped, is examined, and it failed. The exit status alone cannot show this: pytest 9.0.2 exits 0 when every test in a suite is skipped, and when a filter deselects all tests but one passing test.

A check's status is one of four values:

- `passed`: the command exited with its success status, the check examined at least one unit, and every unit it examined passed.
- `failed`: at least one examined unit failed or errored, or the command reported failure after it examined units.
- `not-run`: the check did not run, or it examined no units.
- `incomplete`: the check started, but its result cannot be trusted, for example because its output was cut off, the tree changed underneath it, or it stopped before it finished.

When more than one status fits, `incomplete` wins if `OSFP.EV.5` applies. Otherwise `failed` wins over the others, and `incomplete` wins over `not-run`.

A command's success status is 0, unless the check's tool documents another, which the check records in `successStatus`.

A verifier that takes the tests and their configuration from the tree the attempt started from keeps the attempt's changes to them out of that check. It still records the changes, because the changed files stay in the attempt's tree and decide the next check once they merge. `inputsChanged` is false by construction only when the attempt cannot change those files at all, for example because they are outside its reach.

The tree digests describe the files on disk, not a commit, so a change during the check to a file that the digest covers shows. A check that writes into the tree, such as a test run that writes caches, changes a `dirHash` value. Record a `gitTree` value under ignore rules that leave those caches out, or keep the check's own writes out of the tree. The verifier takes the ignore rules from outside the attempt's reach, because an attempt that can change them can hide files from the digest (`OSFP.EV.13`).

A **verdict** is `accept`, `needs-changes`, or `reject`. It is a person's decision about a change. It cannot turn a failed or not-run check into a passed one. It is not permission to apply the change either: applying the change needs a grant that permits it.

- `OSFP.EV.1` — Verification evidence MUST be an in-toto Statement whose subject identifies the checked tree by a `gitTree` or `dirHash` digest.
- `OSFP.EV.2` — Each check in the evidence MUST report exactly one status: `passed`, `failed`, `not-run`, or `incomplete`.
- `OSFP.EV.3` — A check MUST NOT report `passed` unless its command exited with its success status, it examined at least one unit, and every unit it examined passed; skipped, deselected, and expected-failure units are not examined.
- `OSFP.EV.4` — A check whose command exited MUST record that command's exit status, not the status of a command that read its output.
- `OSFP.EV.5` — If a check's output was cut off, or any digest of the tree on disk changed between the check's start and its end, the check MUST report `incomplete`.
- `OSFP.EV.6` — If an attempt changed a test, a grader, an assertion, or other code or configuration that decides a check's result, other than the code the check judges, the evidence MUST say so for that check, even if the check did not run the changed version, and MUST NOT record `inputsChanged` as false unless the verifier established that the attempt changed none of these.
- `OSFP.EV.7` — If an attempt could read expected answers or a reference implementation that a check compares against and that were withheld from the attempt, the evidence MUST say so for that check, and MUST NOT record `answersReachable` as false unless the verifier established that the attempt could not.
- `OSFP.EV.8` — Findings from static analysis SHOULD be recorded in SARIF 2.1.0 and referenced from the evidence by digest.
- `OSFP.EV.9` — Evidence SHOULD be signed in a DSSE envelope.
- `OSFP.EV.10` — A consumer, including a factory, MUST NOT accept as verification evidence any text that a model wrote, or any evidence that the attempt could have produced or altered.
- `OSFP.EV.11` — A consumer MUST NOT count a check as passed unless its evidence says that the attempt did not change what decides the check's result and could not read its withheld answers, or a person has recorded, with a reference to the evidence, a decision that it may.
- `OSFP.EV.12` — A factory MUST record each verdict with a reference to the evidence it reviewed, and MUST NOT change the status of any check because of a verdict.
- `OSFP.EV.13` — A verifier MUST run each check, take the ignore rules for its tree digests, hold its signing key, and write its evidence outside the attempt's reach.

## 10. Progress

Progress events show that an attempt is moving. A supervisor enforces the time limits in the grant, and reports scheduled tasks that did not start or end in time.

Each event type is the prefix `io.github.osfp-spec.osfp.progress.` followed by an event below. CloudEvents recommends that an event type start with a reverse-DNS name, whose domain names the organization that defines the event's meaning [cloudevents]. The osfp-spec organization on GitHub controls `osfp-spec.github.io`, the domain this prefix reverses.

| Event | Sent by | Sent when |
|---|---|---|
| `dispatched` | Factory or harness adapter | The factory dispatched an attempt to a harness |
| `started` | Factory or harness adapter | The harness acknowledged an attempt |
| `heartbeat` | Factory or harness adapter | Work is still moving |
| `ended` | Factory or harness adapter | An attempt reached a terminal state |
| `limit-expired` | Supervisor | A start deadline or a total budget expired |
| `overdue` | Supervisor | A scheduled task did not start within its start deadline, or started and did not end within its total budget |

Each event carries an OSFP record with `recordType` `progress`. Sent as a CloudEvent, the record is the event's `data`:

| Field | Meaning |
|---|---|
| `id`, `osfpVersion`, `recordType` | `recordType` is `progress` |
| `event`, `occurredAt` | The event's name from the table above, and when the event happened |
| `taskId`, `attemptId` | The task and the attempt the event is about. An `overdue` event has no `attemptId` if no attempt was dispatched, and no `taskId` if the schedule created no task |
| `scheduleId` | For a scheduled task: its schedule |
| `limit`, `action` | `limit-expired` only: `startAckSeconds` or `totalSeconds`, and what the supervisor did |
| `state` | `ended` only: the attempt's terminal state |
| `result` | On `ended`, for an inspection task: `clean`, `findings`, or `aborted`. On `overdue`: `missed` or `unfinished` |
| `expectedAt` | `overdue` only: when the schedule expected the task to start |

An **inspection task** is a task whose purpose is to inspect something and report findings, such as a nightly audit. Its grant says so in `inspection`. Its result is `clean` only if it inspected something and found nothing.

An attempt's start deadline runs from its `dispatched` event. For a scheduled task, the supervisor also counts `startAckSeconds` from the time the schedule expected the task to start (`OSFP.PR.4`). A `missed` report stands even if the task starts later.

When a limit expires, the factory records the outcome from what it can establish. A stopped attempt may already have changed things, so the outcome is `unknown` until the factory establishes what the attempt did (`OSFP.OU.4`, `OSFP.OU.11`). Until the stop's cleanup is confirmed, no attempt that could change the same resources is dispatched (`OSFP.OU.12`).

- `OSFP.PR.1` — A grant MUST state, for each attempt, a deadline for the harness to acknowledge the start and a total time budget.
- `OSFP.PR.2` — A supervisor MUST run the timer that enforces an attempt's limits outside the attempt's reach, in a process that the attempt cannot stop or alter.
- `OSFP.PR.3` — When a limit expires, a supervisor MUST ask for the attempt to stop.
- `OSFP.PR.4` — A supervisor MUST report a scheduled task as `missed` when no `started` event arrives within `startAckSeconds` of its expected start, and as `unfinished` when a started task does not end within `totalSeconds`.
- `OSFP.PR.5` — A factory MUST send a `dispatched` event when it dispatches an attempt, a `started` event when the harness acknowledges the attempt, and an `ended` event when the attempt reaches a terminal state.
- `OSFP.PR.6` — An `ended` event for an inspection task MUST carry a `result`, and that result MUST be `aborted`, never `clean`, if the task inspected nothing.
- `OSFP.PR.7` — Every progress record MUST name its event in `event`, and the time the event happened in `occurredAt`.
- `OSFP.PR.8` — Progress events SHOULD be sent as CloudEvents.
- `OSFP.PR.9` — A factory MUST NOT dispatch an attempt unless a product that conforms as a Supervisor enforces that attempt's limits.

## 11. Rules for the standards OSFP profiles

Each rule here applies only when a factory uses the standard it names. The rule on traces applies only when a factory traces attempts. A factory that uses none of these standards, and traces nothing, meets these rules by default.

A2A uses different words for the same states, and which party acknowledges a task depends on which side is the A2A server. The mapping below gives both directions:

| OSFP state | A factory reporting over A2A (the factory is the A2A server) | A factory reading an A2A agent (the agent runs the attempt) |
|---|---|---|
| `admitted` | `TASK_STATE_SUBMITTED` | No equivalent |
| `started` | `TASK_STATE_WORKING` | `TASK_STATE_SUBMITTED` or `TASK_STATE_WORKING` |
| `waiting` | `TASK_STATE_INPUT_REQUIRED` or `TASK_STATE_AUTH_REQUIRED` | Either of those |
| `completed` | `TASK_STATE_COMPLETED` | `TASK_STATE_COMPLETED` |
| `failed` | `TASK_STATE_FAILED` | `TASK_STATE_FAILED` |
| `canceled` | `TASK_STATE_CANCELED` | `TASK_STATE_CANCELED` |
| `rejected` | `TASK_STATE_REJECTED` | `TASK_STATE_REJECTED` |
| `unknown` | `TASK_STATE_INPUT_REQUIRED` | `TASK_STATE_UNSPECIFIED`, no state, or a state the factory does not recognize |

A factory cannot send `TASK_STATE_UNSPECIFIED`. A2A defines it as "an unknown or indeterminate state" [a2a-spec], but it is also the enum's zero value [a2a-proto]. Protocol Buffers does not serialize a field with implicit presence that holds its default value [protobuf-presence], and A2A requires every required field to be present and set [a2a-spec]. So OSFP sends `unknown` as `TASK_STATE_INPUT_REQUIRED`: an interrupted state, not a terminal one, in which the task cannot proceed without more input. The OSFP state itself travels in the task's `metadata`, under the key `io.github.osfp-spec.osfp.state` (`OSFP.PF.5`), and a factory that reads A2A tasks checks that key before it maps the state (`OSFP.PF.4`). Input that a client sends to an `unknown` task is a request, not a grant (`OSFP.AU.3`): the attempt stays `unknown`, and another attempt needs a new grant (`OSFP.OU.5`). A2A's `TASK_STATE_COMPLETED` says a task "has finished successfully"; like OSFP's `completed`, it says nothing about checks.

- `OSFP.PF.1` — A factory that runs harnesses through UHP MUST map each UHP task, together with the continuations that answer its input requests, to exactly one OSFP attempt, and MUST keep the attempt's `attemptId` after the harness stops retaining the idempotency key.
- `OSFP.PF.2` — When a grant provides a tool from an MCP server, the grant MUST name the server by an identifier that the factory assigns and keeps unique, not by the name the server reports, and the tool by its name.
- `OSFP.PF.3` — A factory that reports outcomes over A2A MUST map each OSFP state to A2A as the mapping in section 11 shows, so that `unknown` becomes `TASK_STATE_INPUT_REQUIRED` and never a terminal state.
- `OSFP.PF.4` — A factory that reads A2A tasks MUST map each A2A state to OSFP as the mapping in section 11 shows, and MUST treat a task as `unknown` when its state is missing, unspecified, or unrecognized, or when its metadata gives the OSFP state `unknown`.
- `OSFP.PF.5` — A factory that reports outcomes over A2A MUST carry each outcome's OSFP state in the task's `metadata`, under the key `io.github.osfp-spec.osfp.state`.
- `OSFP.PF.6` — Traces of an attempt SHOULD use OpenTelemetry and SHOULD carry the OSFP task and attempt identifiers in the attributes `io.github.osfp-spec.osfp.task.id` and `io.github.osfp-spec.osfp.attempt.id`.

## 12. Conformance

**Classes of products.** OSFP defines five classes of products, in the sense of the W3C QA Framework [w3c-qa]. Each class conforms on its own. A product that plays several roles claims each class it plays, and meets the rules of each.

| Class | What it does | Rules it meets |
|---|---|---|
| Factory | Records grants and outcomes, dispatches attempts, accepts evidence, and records verdicts | `OSFP.GE.1` to `OSFP.GE.8`, `OSFP.AU.1` to `OSFP.AU.11`, `OSFP.OU.1` to `OSFP.OU.12`, `OSFP.EV.10` to `OSFP.EV.12`, `OSFP.PR.1`, `OSFP.PR.5` to `OSFP.PR.9`, `OSFP.PF.1` to `OSFP.PF.6` |
| Harness adapter | Reports one harness's lifecycle as outcomes and progress events | `OSFP.GE.1` to `OSFP.GE.3`, `OSFP.GE.7`, `OSFP.OU.2` to `OSFP.OU.4`, `OSFP.OU.7` to `OSFP.OU.11`, `OSFP.PR.5` to `OSFP.PR.8`, `OSFP.PF.1`, `OSFP.PF.3` to `OSFP.PF.6` |
| Verifier | Runs checks outside the attempt's reach, and records verification evidence | `OSFP.GE.1` to `OSFP.GE.3`, `OSFP.EV.1` to `OSFP.EV.9`, `OSFP.EV.13` |
| Supervisor | Enforces time limits, and reports scheduled tasks that did not start or end in time | `OSFP.GE.1` to `OSFP.GE.6`, `OSFP.GE.8`, `OSFP.PR.2` to `OSFP.PR.4`, `OSFP.PR.7`, `OSFP.PR.8` |
| Consumer | Reads OSFP records | `OSFP.GE.4` to `OSFP.GE.6`, `OSFP.GE.8`, `OSFP.EV.10`, `OSFP.EV.11` |

When a harness adapter meets a rule that names a factory, the harness adapter acts in the factory's place.

Only the Factory class needs another class: a Supervisor (`OSFP.PR.9`).

**Recommended rules.** A rule whose key word recommends, rather than requires, applies like any other rule of its class. A product that does not follow one states which, and why, in its conformance claim.

**Claims.** A product claims conformance by naming the version and each class it claims, for example "OSFP 0.1.0-draft.1, Factory and Supervisor". Conformance is a self-declaration. No body certifies OSFP conformance.

**What the checks cover.** `scripts/check-standard.mjs` checks this document against `standard.json`: rule IDs, the words of each rule at its own definition, citations, sections, and links. `scripts/check-osfp.mjs` checks `standard.json` against its JSON Schema; that each section title appears once and key words appear only in the numbered rules; the examples against the field tables and against the rules a machine can check; the conformance table against each rule's classes; and the references against the bibliography. `scripts/self-test.mjs` has a case that fails on each failure site in both scripts. VERIFICATION.md records a mutation run: what it changed, how many of the changes a case caught, and which ones no case caught. None of them tests an implementation. No conformance test suite for implementations exists in this draft.

## 13. Versioning and stability

OSFP follows Semantic Versioning 2.0.0 [semver]. A patch changes no rule's meaning, and valid records stay valid. A minor version adds only what conforming products and valid records already meet: an optional field, a rule that binds only that new field, an example, or a crosswalk. A major version removes or renames a field or a value, changes what a rule means, or adds a rule or a required field that a conforming product might not meet. Before 1.0, a minor version may break; the CHANGELOG calls out every break with a migration note.

From 1.0 on, a consumer that supports a version also supports each later version with the same major number, because those versions add only what it ignores (`OSFP.GE.4`). Before 1.0, a consumer supports only the versions it names.

Rule IDs are never renamed or reused. To change a rule's meaning, deprecate it (`deprecatedIn`, `replacedBy`) and add a new ID. The predicate type URI and the event types change with every breaking change to their records. Each release is an annotated git tag. A tagged release is never edited; fixes ship in a new version.

## 14. Crosswalks

| OSFP record | Profiled standard (version) | Relation |
|---|---|---|
| Task grant | OAuth 2.0 Rich Authorization Requests [RFC9396] | Related, not a carrier. See section 7 |
| Task grant | OAuth 2.0, section 6 [RFC6749] | Partial. A refresh request may not ask for "any scope not originally granted"; in the same way, a derived grant may not exceed its standing grant |
| Task grant | OAuth 2.0 Token Introspection [RFC7662] | Partial. Confirming a task's authority before each side effect follows the pattern of checking that a token is "currently active" at the time of use |
| Task grant | OAuth 2.0 Token Exchange [RFC8693] | Partial. A short-lived credential limits the damage of a leak, but a credential in reach of model code is still in reach (`OSFP.AU.10`) |
| Task grant | UHP 2026-10-19, harnesses section 4.3 [uhp-harnesses] | Partial. UHP requires a server to enforce a disabled tool where the runtime supports per-tool restriction, and otherwise to convey it as an instruction without overstating enforcement. OSFP records which one happened, and applies the same rule to every restriction |
| Task grant | MCP 2026-07-28 [mcp-spec] | Partial. MCP asks a host to obtain "explicit user consent before invoking any tool". A grant records whose consent a task runs under |
| Outcome | A2A 1.0.1 [a2a-spec] | Mapped in section 11 |
| Outcome | UHP 2026-10-19, tasks sections 3.2 and 6 [uhp-tasks] | Partial. A UHP task, with the continuations that answer its questions, is one OSFP attempt; while a question stands, the attempt is `waiting`. A UHP idempotency key is the identity of a re-send |
| Outcome | AG-UI 1.0, runs [ag-ui] | Different on purpose. In AG-UI, a run that did not fail closes with `RUN_FINISHED`, and "an absent outcome means success", so a stripped outcome reads as a completed run. OSFP never reads a missing or unrecognized state as success (`OSFP.GE.5`, `OSFP.PF.4`) |
| Outcome | MCP Tasks extension [mcp-tasks] | Partial. An MCP task handle is a tool server's identity for one long-running request; the `attemptId` is the factory's |
| Outcome | Kubernetes Jobs [k8s-job] | Different on purpose. A Job that passes its deadline becomes "Failed with reason: DeadlineExceeded". OSFP records what the factory can establish, often `unknown`, because a stopped attempt may already have changed things |
| Verification evidence | in-toto Statement v1, framework 1.2.0 [in-toto-statement] | Carries the evidence. OSFP defines the predicate |
| Verification evidence | SLSA 1.2 Build Provenance [slsa-provenance] | Distinct. Provenance describes "how an artifact or set of artifacts was produced"; OSFP evidence says what was checked and whether it passed |
| Verification evidence | SLSA 1.2 build requirements [slsa-build] | Same principle. SLSA keeps provenance out of reach of the build steps; OSFP keeps evidence out of reach of the attempt (`OSFP.EV.10`, `OSFP.EV.13`) |
| Verification evidence | SLSA 1.2 Verification Summary [slsa-vsa] | Related. A verification summary records a verifier's result with the digests of the attestations it read. An OSFP verdict references the evidence a person reviewed |
| Verification evidence | in-toto Test Result v0.1 [in-toto-test-result] | Different on purpose. Test Result requires `result`, which is `PASSED`, `WARNED`, or `FAILED`, and the `configuration` used. Its lists of the tests that passed, warned, or failed are optional, and no field counts skipped tests. So although one of its uses is to verify "that all tests were in fact run", its `result` can be `PASSED` for a run that examined no test. OSFP's `passed` needs an examined unit (`OSFP.EV.3`), and its evidence counts skipped units and says whether the attempt could change the check or read its answers |
| Verification evidence | SARIF 2.1.0 [sarif] | Uses it for static-analysis findings |
| Progress | CloudEvents 1.0.2 [cloudevents] | Uses it as the envelope. CloudEvents makes `time` optional, so the progress record carries its own `occurredAt` |
| Progress | Kubernetes CronJob [k8s-cronjob] | Partial. A CronJob skips a Job that misses its starting deadline and counts it as failed. OSFP reports that task as `missed` |
| Progress | OpenTelemetry GenAI agent spans [otel-genai] | Complementary. Those conventions carry "Status: Development" at the cited commit, so OSFP does not depend on their attribute names |

## 15. Privacy and security considerations

- **Grants reveal intent and reach.** A grant lists resources, disclosures, and their destinations. Store grants where only the factory's operators can read them. Share them across a trust boundary only when the receiver needs them.
- **Untrusted input cannot grant authority.** Events, messages, web pages, issue text, and tool descriptions that reach an attempt may contain instructions. They are requests at most, never grants. A factory that obeys them uses its own authority for someone else's purpose, which is the confused deputy problem [confused-deputy] (`OSFP.AU.3`).
- **Credentials stay outside the model.** A credential in a model's input can leak through normal output. A credential in an environment variable or a workspace file can be read by code the model writes, however short its life. `OSFP.AU.10` is only a recommendation in this draft, because common harnesses read credentials from environment variables today.
- **The attempt cannot vouch for itself.** Evidence that the attempt could write, or sign with a key it could reach, proves nothing (`OSFP.EV.10`, `OSFP.EV.13`). Run verifiers apart from the attempt, and keep their signing keys out of its reach.
- **Evidence can leak.** Check output may contain secrets or personal data. Record output by digest, and keep the full output where the operator controls it.
- **Model reasoning stays out.** Do not copy a model's reasoning into OSFP records. It can hold secrets, and a model's claim that it succeeded is not evidence (`OSFP.EV.10`).
- **Checks can be gamed.** Models have raised their scores by changing tests or scoring code, by reading the answers a check uses, and by exploiting loopholes in the task environment [metr-reward-hacking]. Evidence records the first two (`OSFP.EV.6`, `OSFP.EV.7`). A loophole that leaves no trace in the change is not covered. A `dirHash` digest covers regular files only, so a changed symbolic link or file mode does not show in it [in-toto-digest-set]; prefer `gitTree` when the tree is in git.
- **Records outlive personal data.** Records never change (`OSFP.GE.3`), so keep personal data out of them: name each person by an identifier that a separate directory resolves, so the directory entry can be erased. Never copy a credential, or raw output from a harness or a model, into a record.
- **Signing.** Unsigned evidence can be forged by anyone who can write to its store. Sign evidence (`OSFP.EV.9`), and verify the signature before trusting it.

## 16. Terminology

- **Acknowledgment**: a harness's message to the factory that it accepted an attempt. An acknowledged attempt is `started`.
- **Attempt**: one execution of a task by one harness. A task can have several attempts.
- **Authority**: what a task may do at a given moment: what its latest grant permits and, for a scheduled task, only what its schedule's latest standing grant also permits. An expired grant permits nothing.
- **Check**: one executed verification step, such as a test suite, a build, or a linter.
- **Command**: a message that asks a harness to act, such as to run an attempt or to stop one.
- **Consumer**: any product that reads OSFP records. A factory that reads evidence is a consumer of it.
- **Credential**: a secret that gives access, such as a token, a key, or a password.
- **Derived grant**: a task grant for a scheduled task that takes its approval from the schedule's standing grant, through `derivedFrom`.
- **Disclosure**: an item of information the factory sends to a harness, such as a document or an issue.
- **Dispatch**: to send an attempt to a harness.
- **Establish**: to show a fact from evidence that the factory or the verifier controls. A harness's or an attempt's own report does not establish anything by itself.
- **Enforced**: a restriction that the harness or the factory makes impossible to break, such as a hard block on a tool. A restriction that only tells the model is an instruction.
- **Factory**: the product that authorizes tasks, dispatches attempts, and records their outcomes.
- **Harness**: the program that runs an attempt, for example a coding agent.
- **Harness adapter**: a product that reports one harness's lifecycle as OSFP outcomes and progress events.
- **Inspection task**: a task whose purpose is to inspect something and report findings, such as a nightly audit. Its grant marks it with `inspection`.
- **Model input**: everything a model receives in one call, including instructions, messages, files, and tool results.
- **Outcome**: the record of an attempt's state at one moment.
- **Producer**: any product that writes OSFP records.
- **Progress event**: an event that shows an attempt is moving, or reports a limit that expired or a scheduled task that did not start or end in time.
- **Reach**: what an attempt, its harness, and the code they run can read, change, or stop. A product, a key, or a file outside the attempt's reach is one that none of them can change or stop.
- **Re-send**: the same command sent again under its original identity, such as its idempotency key.
- **Request**: work that someone asks a factory to do. A request carries no authority. A stop is a command, not a request; a stop is "requested" when a factory or a supervisor sends that command, and `stopRequestedAt` records when.
- **Resources an attempt could change**: those its grant gives `write` access to, and any that its harness can change without passing through the factory. Two URIs that might name one resource count as one unless the factory has established that they differ.
- **Retry**: a new attempt of a task, with a new `attemptId`.
- **Schedule**: a standing request that creates a new task each time it fires.
- **Scheduled task**: a task that a schedule created.
- **Side effect**: an action that changes something outside the attempt's own workspace, such as a write to a repository, a message, a publication, or a payment.
- **Standing grant**: a task grant that a person approves for a schedule. It covers the schedule's tasks through their derived grants.
- **Stop confirmed**: the harness reported that the attempt stopped, for example a UHP task that ends with the status `cancelled` [uhp-sessions]. The reply to a stop command does not confirm the stop. A UHP server replies to a cancel within a second, "even if the harness takes longer to wind down" [uhp-sessions], and in A2A, "success is not guaranteed" [a2a-spec].
- **Supervisor**: a product that enforces an attempt's time limits and reports scheduled tasks that did not start or end in time.
- **Task**: one request with a fixed scope, covered by its grants. Each request becomes one task, and a schedule creates a new task each time it fires.
- **Task grant**, or **grant**: a record of the authority that a person approved, for one task or, as a standing grant, for a schedule's tasks. A grant that permits nothing revokes authority, and needs no person.
- **Terminal state**: `completed`, `failed`, `canceled`, or `rejected`. An attempt that reaches one leaves it only for `unknown` (`OSFP.GE.7`).
- **Tool**: an MCP tool that a factory provides to a harness under a grant. A harness's built-in tools are part of the harness; a grant restricts them through `restrictions`.
- **Unit**: one thing a check examines and counts: a test, a file, or a build target. Skipped, deselected, and expected-failure units are not examined. A unit that could not be built, collected, or loaded, and that the tool did not report as skipped, is examined, and it failed.
- **Unknown**: the outcome state that means the factory cannot establish what happened.
- **Verdict**: a person's decision about a change: accept, needs changes, or reject.
- **Verification evidence**: the record of what a verifier checked, on which tree, and what happened.
- **Verifier**: a product that runs checks outside the attempt's reach and records verification evidence.

## 17. Known limitations

- No outside review yet. Four AI reviews, two of them with a re-check of the fixes, read this draft before its release. VERIFICATION.md records them, and `reviews/` records what each found and what happened.
- No implementation exists yet. The maintainer plans two private ones, and they will not count as independent.
- No conformance test suite for implementations exists. The checks cover this document and its examples only.
- The record field tables are informative in this draft. JSON Schemas for the four records are planned for 0.2.
- Restriction targets and rules are free text, so two factories can describe the same restriction differently.
- The operation vocabulary is small. No grant in this version can permit a deploy or a payment.
- A verdict has no record type of its own. One rule covers it (`OSFP.EV.12`). The decision that `OSFP.EV.11` lets a person record has no record type either, so neither travels between products.
- No rule covers a supervisor that stops. Attempts that run while it is down are not reported.
- The predicate type, the event types, the A2A metadata key, and the OpenTelemetry attributes use the namespace of the osfp-spec organization on GitHub. They stay the same if a foundation takes over that organization, and change only if OSFP moves to another namespace.
- No rule ties a publish or a merge to the tree that the evidence names, so a factory can merge a tree other than the one it checked. Appendix A records the record that would close this gap.
- No record names the inputs that decide a check, or the tree a check took them from, so `inputsChanged` and `answersReachable` rest on the verifier's word.
- A check's runs are not numbered, so a verifier can run a check again after it fails and report only the run that passed.
- An attempt can become `unknown` after its A2A task reached a terminal state (`OSFP.GE.7`). This draft does not say how to report that over A2A.
- The A2A metadata key is not declared as an A2A extension, so a client cannot discover it from an Agent Card.
- The UHP and A2A mappings have not been reviewed by those projects' maintainers. Sending `unknown` as `TASK_STATE_INPUT_REQUIRED` is OSFP's choice, not A2A's.
- A full review record, inbound event triggers, skill distribution receipts, routing decision records, and tool definition digests are deferred to the parking lot in appendix A.

## 18. References

Each source a rule cites is also in the `bibliography` of `standard.json`, with the same URL.

### Normative

- [a2a-proto] "A2A Protocol 1.0.1: a2a.proto, the Protocol Buffers definition". https://github.com/a2aproject/A2A/blob/3303592588e388e62e0f69f701af531d2f4e3991/specification/a2a.proto
- [a2a-spec] "Agent2Agent (A2A) Protocol Specification, version 1.0.1". https://a2a-protocol.org/v1.0.1/specification/
- [cloudevents] "CloudEvents Specification 1.0.2". https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
- [dsse] "Dead Simple Signing Envelope (DSSE) 1.0.0: Envelope". https://github.com/dsse-lf/dsse/blob/v1.0.0/envelope.md
- [in-toto-digest-set] "in-toto Attestation Framework 1.2.0: DigestSet". https://github.com/in-toto/attestation/blob/v1.2.0/spec/v1/digest_set.md
- [in-toto-statement] "in-toto Attestation Framework 1.2.0: Statement". https://github.com/in-toto/attestation/blob/v1.2.0/spec/v1/statement.md
- [mcp-tools] "Model Context Protocol Specification, revision 2026-07-28: Tools". https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- [otel] "OpenTelemetry Specification". https://opentelemetry.io/docs/specs/otel/
- [RFC2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels, BCP 14, RFC 2119", 1997. https://www.rfc-editor.org/rfc/rfc2119
- [RFC3339] "RFC 3339: Date and Time on the Internet: Timestamps", 2002. https://www.rfc-editor.org/rfc/rfc3339
- [RFC8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words, BCP 14, RFC 8174", 2017. https://www.rfc-editor.org/rfc/rfc8174
- [sarif] "Static Analysis Results Interchange Format (SARIF) Version 2.1.0, OASIS Standard". https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html
- [uhp] "Unified Harness Protocol, version 2026-10-19". https://github.com/HarnessRouter/harnessrouter/tree/8a898e95f5c1/protocol/versions/2026-10-19

### Informative

- [ag-ui] "AG-UI 1.0: Runs and Steps". https://docs.ag-ui.com/spec/1.0/events/lifecycle
- [agent-plugins] "Agent Plugins Specification 1.0.0". https://agent-plugins.org/
- [agent-skills] "Agent Skills Specification". https://agentskills.io/specification
- [agents-md] "AGENTS.md". https://agents.md/
- [anthropic-managed-agents] Anthropic, "Scaling Managed Agents: Decoupling the brain from the hands", 2026. https://www.anthropic.com/engineering/managed-agents
- [bash-pipelines] "GNU Bash Reference Manual: Pipelines". https://www.gnu.org/software/bash/manual/html_node/Pipelines.html
- [confused-deputy] Hardy, N., "The Confused Deputy (or why capabilities might have been invented)", 1988. DOI 10.1145/54289.871709. http://www.cap-lore.com/CapTheory/ConfusedDeputy.html
- [idempotency-key] "The Idempotency-Key HTTP Header Field, draft-ietf-httpapi-idempotency-key-header-08 (IETF Internet-Draft)". https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-08
- [in-toto-test-result] "in-toto Attestation Framework: Test Result predicate, v0.1". https://github.com/in-toto/attestation/blob/b654af7719398a85877db4c57281d239324c3e8e/spec/predicates/test-result.md
- [k8s-cronjob] "Kubernetes Documentation: CronJob". https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/
- [k8s-job] "Kubernetes Documentation: Jobs". https://kubernetes.io/docs/concepts/workloads/controllers/job/
- [k8s-pod-lifecycle] "Kubernetes Documentation: Pod Lifecycle, Termination of Pods". https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
- [linux-cgroup-v2] "Linux Kernel Documentation: Control Group v2". https://docs.kernel.org/admin-guide/cgroup-v2.html
- [linux-watchdog] "Linux Kernel Documentation: The Linux Watchdog driver API". https://docs.kernel.org/watchdog/watchdog-api.html
- [mcp-spec] "Model Context Protocol Specification, revision 2026-07-28: Security and Trust & Safety". https://modelcontextprotocol.io/specification/2026-07-28
- [mcp-tasks] "Model Context Protocol: Tasks extension (io.modelcontextprotocol/tasks)". https://modelcontextprotocol.io/extensions/tasks/overview
- [metr-reward-hacking] METR, "Recent Frontier Models Are Reward Hacking", 2025. https://metr.org/blog/2025-06-05-recent-reward-hacking/
- [otel-genai] "OpenTelemetry Semantic Conventions for Generative AI: Agent spans (Status: Development)". https://github.com/open-telemetry/semantic-conventions-genai/blob/da2b5736d7a3533fd7d324872b77e4c2eabbe392/docs/gen-ai/gen-ai-agent-spans.md
- [protobuf-json] "Protocol Buffers Documentation: ProtoJSON Format". https://protobuf.dev/programming-guides/json/
- [protobuf-presence] "Protocol Buffers Documentation: Application Note: Field Presence". https://protobuf.dev/programming-guides/field_presence/
- [pytest-exit-codes] "pytest 9.0 Documentation: Exit codes". https://docs.pytest.org/en/9.0.x/reference/exit-codes.html
- [pytest-skipping] "pytest 9.0 Documentation: How to use skip and xfail to deal with tests that cannot succeed". https://docs.pytest.org/en/9.0.x/how-to/skipping.html
- [RFC6749] "RFC 6749: The OAuth 2.0 Authorization Framework", 2012. https://www.rfc-editor.org/rfc/rfc6749
- [RFC7662] "RFC 7662: OAuth 2.0 Token Introspection", 2015. https://www.rfc-editor.org/rfc/rfc7662
- [RFC8693] "RFC 8693: OAuth 2.0 Token Exchange", 2020. https://www.rfc-editor.org/rfc/rfc8693
- [RFC9396] Lodderstedt, T., Richer, J., and Campbell, B., "OAuth 2.0 Rich Authorization Requests, RFC 9396", 2023. https://www.rfc-editor.org/rfc/rfc9396
- [saltzer-schroeder] Saltzer, J. H., and Schroeder, M. D., "The Protection of Information in Computer Systems", 1975. DOI 10.1109/PROC.1975.9939. https://web.mit.edu/Saltzer/www/publications/protection/Basic.html
- [semver] "Semantic Versioning 2.0.0". https://semver.org/spec/v2.0.0.html
- [slsa-build] "SLSA 1.2: Build, Requirements for producing artifacts". https://slsa.dev/spec/v1.2/build-requirements
- [slsa-provenance] "SLSA 1.2: Build Provenance". https://slsa.dev/spec/v1.2/build-provenance
- [slsa-vsa] "SLSA 1.2: Verification Summary Attestation (VSA)". https://slsa.dev/spec/v1.2/verification_summary
- [uhp-harnesses] "Unified Harness Protocol 2026-10-19: Harnesses, section 4.3 Disabled tools". https://github.com/HarnessRouter/harnessrouter/blob/8a898e95f5c1/protocol/versions/2026-10-19/harnesses.md#43-disabled-tools
- [uhp-sessions] "Unified Harness Protocol 2026-10-19: Sessions, section 4 Cancelling". https://github.com/HarnessRouter/harnessrouter/blob/8a898e95f5c1/protocol/versions/2026-10-19/sessions.md#4-cancelling
- [uhp-tasks] "Unified Harness Protocol 2026-10-19: Tasks". https://github.com/HarnessRouter/harnessrouter/blob/8a898e95f5c1/protocol/versions/2026-10-19/tasks.md
- [w3c-prov-dm] "PROV-DM: The PROV Data Model, W3C Recommendation", 2013. https://www.w3.org/TR/prov-dm/
- [w3c-qa] "QA Framework: Specification Guidelines, W3C Recommendation", 2005. https://www.w3.org/TR/qaframe-spec/
- [ws-i-bp] "Basic Profile Version 1.0, WS-I", 2004. https://www.ws-i.org/Profiles/BasicProfile-1.0-2004-04-16.html

## Appendix A. Parking lot

Not commitments. Recorded so they are not argued again from scratch.

- **Inbound event triggers.** Events from chat, code review, CI, and email that start work, with threads and subscriptions. CloudEvents covers the envelope; the meaning of a thread does not exist yet.
- **A full review record.** A verdict with reviewer identity, scope, and the evidence digests reviewed.
- **A publish and merge record.** The tree a factory published or merged, with the evidence and the verdict it relied on, so a reader can tell that what shipped is what was checked.
- **Skill distribution receipts.** What each harness actually installed from a shared skill source, by digest.
- **Routing decision records.** Why a factory chose a harness or a model for an attempt.
- **Tool definition digests.** MCP defines no digest for a tool. A digest of the tool's definition, taken when a grant is approved, would show when a server changes a tool after approval.
- **A larger operation vocabulary**, for deploys and payments.
- **Record JSON Schemas and a conformance test suite** for implementations.
