# Quickstart: a verifier for GitHub Actions

This quickstart is a Verifier, one of the five classes in section 12 of [the standard](../spec/STANDARD.md). On each pull request, it runs the checks of your project, and writes one verification-evidence record about them. It is not a conformance claim. A person or an AI assistant can follow these steps. An assistant starts at [GET-STARTED.md](../GET-STARTED.md).

What you get:

- A check that examined no test is `not-run`, and it fails the job. pytest exits 0 when it skips every test, but this job does not pass.
- The record names the exact tree that it checked. It also says whether the pull request changed a test, the test configuration, or CI.
- In CI, the OSFP checker reads each record before the job keeps it.

## Install

Copy three files:

| Copy | To |
|---|---|
| [osfp-verify.yml](osfp-verify.yml) | `.github/workflows/osfp-verify.yml` |
| [osfp-evidence.mjs](osfp-evidence.mjs) | `.github/osfp/osfp-evidence.mjs` |
| [osfp-verify.json](osfp-verify.json) | `.github/osfp/osfp-verify.json` |

Add these lines to `.github/CODEOWNERS`. Put the GitHub user or team that protects the verifier in place of `@owner`. GitHub requests a review only from a code owner with write access to the repository:

```
/.github/workflows/osfp-verify.yml @owner
/.github/osfp/ @owner
/.github/CODEOWNERS @owner
```

Then change two parts to fit the project: the "Set up the project" step of the workflow, and the checks in `osfp-verify.json`. Do not change `osfp-evidence.mjs`.

## Configure the checks

`osfp-verify.json` has three fields:

| Field | What it holds |
|---|---|
| `checks` | One entry for each check: its `name`, the `command` that runs it, and its `inputs`. The inputs are the paths that decide the result of the check, other than the code that it judges, such as the tests, the test configuration, and CI. Add `successStatus` only if the tool documents an exit status other than 0 for success |
| `ignore` | The paths to leave out of the tree digests, such as `.venv/**`: the files that the setup or the checks write. The `.gitignore` files of the tree do not count, because a pull request can change them (`OSFP.EV.13`) |
| `withheldAnswers` | An empty list says that no check compares against answers that were kept from the attempt. Then the record says `answersReachable: false`. Remove the field if that is not true |

Paths are git pathspecs with glob patterns. `tests/**` is everything under `tests/`, and `**/conftest.py` is a `conftest.py` file in any directory. The script always counts itself and its config as inputs.

Each command must:

- Write a JUnit XML report to the path in `$OSFP_JUNIT`. With pytest, add `--junitxml="$OSFP_JUNIT"`. Most test runners can write one, for example Vitest with `--reporter=junit --outputFile="$OSFP_JUNIT"`, Jest with the `jest-junit` reporter and `JEST_JUNIT_OUTPUT_FILE="$OSFP_JUNIT"`, and Go with `gotestsum --junitfile "$OSFP_JUNIT"`. Only pytest was tested with this script.
- Run the check itself. Do not pipe its output into another command, and do not add `|| true`. The record keeps the exit status of the command (`OSFP.EV.4`).
- Run every test. A filter such as `-k` leaves tests out of the report, so the record cannot count them.
- Keep its writes out of the tree, or in `ignore`. With pytest, `-p no:cacheprovider` and `PYTHONDONTWRITEBYTECODE=1` do this. If a file in the tree changes during a check, the check is `incomplete` (`OSFP.EV.5`).

With pytest, also set `xfail_strict = true`. pytest reports an unexpected pass of an `xfail` test as a pass in its JUnit XML, so the script counts that test as examined.

## Run it once

Clone OSFP outside the project. The commands of the checks use the tools on your PATH; in CI, the setup step puts them there. Then, from the root of the project:

```
node .github/osfp/osfp-evidence.mjs --config .github/osfp/osfp-verify.json --out <tmp>/records
node <tmp>/OSFP/scripts/check-osfp.mjs --root <tmp>/OSFP --records <tmp>/records
```

The first command runs each check, prints its output, and writes the record in `<tmp>/records`. It exits with 0 if every check passed, 1 if a check did not pass, and 2 if it could not run. The second command checks the record, and it must print `Result: 0 violation(s)`. Without `--root`, the checker looks for the standard in the current directory, and stops with exit status 2.

Outside a pull request, the record has no `taskId` or `attemptId`, and it does not say whether the attempt changed what decides each check. Add `--base` with the branch that the pull request will merge into, such as `--base origin/main`, to compare the tree with it. On a pull request, the script reads all three from the pull request: the task is the pull request, the attempt is its head commit, and the verifier is the workflow run.

The script also says whether the checked tree is the tree of the current commit. Files on disk that are not in the commit make the two trees differ.

## What a person must do

An AI assistant can install the files, but it cannot protect them from itself. On a pull request, GitHub runs the workflow from the pull request. So a pull request that changes the verifier runs its changed copy, and its record is not evidence (`OSFP.EV.10`). Only a review by a person before the merge keeps the verifier out of the reach of the attempt (`OSFP.EV.13`).

After the pull request that adds the quickstart merges, a person with admin access sets two rules for the default branch, in a branch protection rule or a ruleset:

1. **Require the `verify` status check.** Then no pull request merges while a check is `failed`, `not-run`, or `incomplete`.
2. **Require a review from Code Owners.** Then no change to the verifier merges without a review by the owner in CODEOWNERS.

While a check cannot pass, for example because all its tests skip, rule 1 blocks every merge. Decide when to turn rule 1 on.

When a record says `inputsChanged: true`, the pull request changed what decides that check. The job still passes, and it shows a warning. Read those changes before you count the pass (`OSFP.EV.11`).

## The Verifier rules

| Rule | What this quickstart does |
|---|---|
| `OSFP.GE.1` to `OSFP.GE.3` | Each record has `osfpVersion`, `recordType`, and a new `urn:uuid` ID, and its time is in UTC. The script never writes over a record |
| `OSFP.EV.1` | The subject names the checked tree by its `gitTree` digest |
| `OSFP.EV.2`, `OSFP.EV.3` | Each check has one status, from its JUnit report and its exit status, as section 9 defines it |
| `OSFP.EV.4` | The record keeps the exit status of the command. bash runs the command with `pipefail` |
| `OSFP.EV.5` | The script digests the tree before and after each check. A change, or a signal that ends the check, makes it `incomplete` |
| `OSFP.EV.6` | On a pull request, the record lists each input that the pull request changed. Without a base, the record says nothing about inputs |
| `OSFP.EV.7` | `answersReachable` is false only when `withheldAnswers` is an empty list |
| `OSFP.EV.8` | Not followed: the quickstart records no SARIF findings |
| `OSFP.EV.9` | Not followed: the quickstart does not sign its records |
| `OSFP.EV.13` | Met only after a person sets the two rules above |

## Limits

- The workflow has not run on GitHub Actions yet. The script ran on macOS on 2026-11-16, with git, pytest 9.0.2 on Python 3.14.5, and Node.js 22 and 25.
- The script counts the units that the JUnit report lists. The report does not list the tests that a filter deselected.
- The tests run in the same job as the script. So a test that sets out to change its own report can do so. The record shows a change to a test, but not a change to the code under test that alters the test run.
- The script digests the whole tree twice for each check. In a large tree, this takes time.
