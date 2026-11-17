# Get started

This page is for an AI assistant. A person asked you to get started with OSFP, or to add OSFP to their project. Do these steps in order. People can read the [README](README.md) instead.

**The goal.** Each pull request in the person's project gets a record of what its checks examined. A check that ran no test is `not-run`, never `passed`. You add one OSFP class, the Verifier, and nothing more.

## 1. Find the project

Work in the project that you are in. If you are in a clone of OSFP, or in no project, ask the person which project to change, and wait for the answer.

If the person wants to review or change the standard, and not use it, stop here and read [AGENTS.md](AGENTS.md).

## 2. Get OSFP

Clone OSFP into a temporary directory outside the project:

```
git clone --depth 1 https://github.com/osfp-spec/OSFP.git <tmp>/OSFP
```

Do not put the clone inside the project. Read only these parts:

- [quickstart/README.md](quickstart/README.md), which you will follow.
- Section 9 of [spec/STANDARD.md](spec/STANDARD.md), on verification evidence.
- The Verifier row of section 12.

Do not write your own verifier. Copy the quickstart. A verifier that you write yourself is code that nobody else has tested, and it sits where you can change it.

## 3. Learn how the project checks itself

Find each command that runs the tests, and find the CI, if there is one. Run each command once. Note how many tests each command ran, and how many it skipped.

The quickstart is for a project on GitHub, and it needs a test runner that can write JUnit XML. If you know that the project is not on GitHub, or that its test runner cannot write JUnit XML, tell the person, and stop.

## 4. Ask the person, and wait

You edit this project, so you cannot protect its verifier. A pull request that changes the verifier runs its changed copy, so you could weaken the verifier later (`OSFP.EV.13`). A person must decide two things. Send a message like this one, with your findings in it, and wait for the answer:

> I can add OSFP verification evidence to this project. On each pull request, CI will run your checks and record what each check examined. A check that runs no test will show `not-run` and fail the job. It will not show a green pass.
>
> 1. **The checks.** I found these: `<command>`, which ran N tests and skipped M. Are these the checks to record?
> 2. **Who protects the verifier.** I will name an owner for the verifier's files in CODEOWNERS. Which GitHub user or team must review changes to them?
>
> After my pull request merges, you must change two repository settings that I cannot change. The pull request lists them.

If a command skipped all its tests, say so in question 1. That check will be `not-run`, and it will fail the job until the person decides what to do. Do not decide for them.

## 5. Install the quickstart

Follow [quickstart/README.md](quickstart/README.md):

1. Copy the three files to the paths that it gives.
2. Change only the "Set up the project" step of the workflow, and `osfp-verify.json`, to fit the project. Do not change `osfp-evidence.mjs`.
3. Add the CODEOWNERS lines, with the owner that the person named.

Do not change the tests or the code of the project. If a check fails, or is `not-run`, the verifier is doing its job. Report it.

## 6. Check your work

Run the verifier once, and put its record in an empty directory outside the project. Then run the OSFP checker on that directory:

```
node .github/osfp/osfp-evidence.mjs --config .github/osfp/osfp-verify.json --out <tmp>/records
node <tmp>/OSFP/scripts/check-osfp.mjs --root <tmp>/OSFP --records <tmp>/records
```

You are done when the checker prints `Result: 0 violation(s)`. The verifier can exit with 1: that only says that a check did not pass.

If the checker reports a violation, fix the config, and run both commands again. Never change the checker, and never change a record by hand.

## 7. Open one pull request

Put all the changes in one pull request. In its description, give:

- Each check, with its status from your run.
- The summary lines of the checker.
- The two settings that the person must change, from "What a person must do" in [quickstart/README.md](quickstart/README.md).
- This sentence: "This records OSFP verification evidence. It is not a conformance claim."

## 8. Stop

Do not merge. Do not change the settings or the branch protection of the repository. Do not claim conformance to OSFP: that claim belongs to the person. Do not add the other OSFP classes unless the person asks for them.
