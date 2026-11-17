# Changelog

All notable changes to OSFP are recorded here. The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html), as section 13 of the standard defines them.

<!--
For every entry:
- Say what changed in plain words, and name each affected ID.
- Call out every break, with who it affects and how to migrate.
- If a comment window closed early, or a review did not happen, say so in those words.
- Keep a "Known limitations" list for each version.
-->

## [Unreleased]

### Added
- `GET-STARTED.md`: the steps for an AI assistant that a person asks to get started with OSFP. The assistant adds the Verifier class only, asks the person what only a person can decide, and is done when `check-osfp.mjs --records` reports 0 violations. No rule changes.
- `quickstart/`: a Verifier to copy, for GitHub Actions. On each pull request, it runs the checks of a project, reads the JUnit XML report of each check, and writes one verification-evidence record. It does not sign its records (`OSFP.EV.9`), and it is not a conformance claim.

### Changed
- README.md opens with the one line to give an AI assistant, and says how to run `check-osfp.mjs --records` from another directory. AGENTS.md sends an assistant that adds OSFP to a project to GET-STARTED.md.
- README.md follows most of the writing rules of ASD-STE100 (Simplified Technical English): one topic in each sentence, short sentences, active verbs, and conditions before commands. The terms of the standard stay as the standard writes them. The Files table now says that the `predicates/` page names the predicate type of verification evidence. Before, it said the reverse. No rule changes.

## [0.1.0-draft.1] - 2026-11-16

First public draft. Before this release, four AI reviews read earlier texts. The first three recorded 22, 22, and 35 numbered findings. The fourth used six lenses and made 53 recommendations, which `reviews/2026-11-15.md` groups into 14 rows. Re-checks of the fixes found 11 more findings after the third review and 32 more after the fourth. `reviews/` records what each review found and what happened: fixed, listed as a known limitation, or left to the owner. No outside reader has reviewed this draft.

### Added
- 59 rules in six areas: general (GE), task grant (AU), outcome (OU), verification evidence (EV), progress (PR), and rules for the standards OSFP profiles (PF). Every rule cites a primary source, and names the classes of product it applies to.
- Four records: task grant, outcome, verification evidence (an in-toto predicate), and progress (CloudEvents). Records are never changed; a change is a new record.
- A two-way mapping between OSFP outcome states and A2A task states, and crosswalks to OAuth 2.0, UHP, MCP, AG-UI, in-toto, SLSA, SARIF, CloudEvents, Kubernetes, and OpenTelemetry.
- Five conformance classes (factory, harness adapter, verifier, supervisor, consumer), each with its own list of rules.
- Informative examples that tell two stories: a task whose first attempt went unknown, and a nightly task that never started.
- A predicate type page under `predicates/`.
- Two zero-dependency checks; a self-test with a case for each failure site in them; and a CI workflow that runs all three on every pull request and every push to main.
- `check-osfp.mjs --records <dir>`, which checks a directory of an implementer's records, and its subdirectories, against the rules a machine can check, and names each rule it could not check. It is not a conformance test.
- Issue forms for a review and for a problem report, and a pull request template that asks for the change class, interests, and check results.
- A need statement, design lessons, a verification record, and the review records.
- The Apache License 2.0, for the whole repository: prose, schemas, examples, and code.

### Known limitations
- No outside review yet.
- No implementation exists yet. The maintainer plans two private ones, and they will not count as independent.
- No conformance test suite for implementations. Record JSON Schemas are planned for 0.2.
- No rule ties a publish or a merge to the tree that the evidence names.
- An attempt that becomes `unknown` after its A2A task reached a terminal state has no A2A mapping.
- No record names the inputs that decide a check, and a check's runs are not numbered.
