# Open Software Factory Profile (OSFP)

**Version:** 0.1.0-draft.1
**Status:** Draft for review. Not adopted. No outside review yet.
**License:** [Apache License 2.0](LICENSE)

A **software factory** changes a request into a verified change to software. **Harnesses**, such as coding agents, do the work. OSFP is an open standard for the records that a factory writes about this work. With OSFP, a record means the same thing in every product. A product can then read the records of a different product and know what they claim.

## Why it exists

The standards under a factory tell you how to run a harness, call a tool, and sign a statement. They do not tell you what the records of the factory mean. Thus, each factory defines them itself, and a reader cannot know what the records of a different factory claim.

Four failures show the cost. Public sources show three, and a test that the maintainer ran shows the fourth:

- **A restriction that is only an instruction.** If a harness cannot block a disabled tool, [UHP](https://github.com/HarnessRouter/harnessrouter/blob/8a898e95f5c1/protocol/versions/2026-10-19/harnesses.md#43-disabled-tools) tells the server to give the agent an instruction instead. The records of the factory do not show which of the two occurred.
- **An agent that changes its own test.** Frontier models changed the tests or the scoring code to get higher scores, often with success ([METR, 2025](https://metr.org/blog/2025-06-05-recent-reward-hacking/)).
- **A timeout that hides the result.** After a timeout, a client "does not know if it can safely retry the request" ([Idempotency-Key draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-08)).
- **A pass when no test ran.** In the maintainer's test, pytest 9.0.2 exited with status 0 when it skipped all the tests. A factory that reads only the exit status then reports a pass.

The [need statement](NEED.md) gives the full case.

## What it defines

OSFP defines four records:

| Record | What it tells you |
|---|---|
| Task grant | What a task can read, change, and use. Its authority comes only from the approval of a person. A request, an instruction, a skill, or a tool listing never gives authority |
| Outcome | The state of an attempt. If the factory cannot know what the attempt did, the state is `unknown`. Then a new attempt needs a new grant that a person approves |
| Verification evidence | What a verifier checked, on which tree, and the result. A check passes only if its command succeeded and it examined one or more units, all of which passed. Text that a model wrote, or that the attempt could change, is never evidence |
| Progress | Events that show that work moves, or that report work that stopped or did not start. A timer outside the reach of the attempt enforces the time limits |

OSFP is a **profile**: it makes standards that exist work together. It uses [UHP](https://github.com/HarnessRouter/harnessrouter/tree/8a898e95f5c1/protocol/versions/2026-10-19), [MCP](https://modelcontextprotocol.io/specification/2026-07-28), [A2A](https://a2a-protocol.org/v1.0.1/specification/), [in-toto](https://github.com/in-toto/attestation/blob/v1.2.0/spec/v1/statement.md), [CloudEvents](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md), and [OpenTelemetry](https://opentelemetry.io/docs/specs/otel/), and adds only these four records. The standard has 53 rules, and each rule cites a primary source.

OSFP is not a harness, a runtime, a product, or a certification. It does not tell you how to build a factory. It tells you what the records of a factory mean.

## When to use it

Use OSFP if your product writes or reads the records of a software factory. Find your product in this table. Section 12 of the standard gives the rules for each class.

| Your product | Its class |
|---|---|
| Records grants and outcomes, dispatches attempts, accepts evidence, and records verdicts | Factory |
| Reports the lifecycle of one harness as outcomes and progress events | Harness adapter |
| Runs checks outside the reach of the attempt, and records verification evidence | Verifier |
| Enforces time limits, and reports scheduled tasks that did not start or end in time | Supervisor |
| Reads OSFP records | Consumer |

A product can be in more than one class. It must then obey the rules of each of its classes.

Do not use OSFP to run a harness, call a tool, or send messages between agents. UHP, MCP, and A2A do those jobs, and OSFP refers to them. Section 3 of the standard lists each topic that is out of scope, and where it belongs.

This version is a draft. Its rules can change before version 1.0. The [changelog](CHANGELOG.md) names each incompatible change and tells you how to migrate.

## How to use it

### Build a product

1. Read section 5 of [the standard](spec/STANDARD.md). It shows how the parts of a factory connect.
2. Find your class in section 12. Read each rule of that class.
3. Use the [examples](examples/) as models for your records.
4. Write your conformance claim. Name the version and each class, for example "OSFP 0.1.0-draft.1, Factory and Supervisor".

Your claim is your own statement. No organization certifies conformance. If your product does not obey a "SHOULD" rule, your claim must name the rule and give the reason.

### Review the draft

The draft needs outside readers. It stays a draft until two outside readers review it, and one outside implementer commits in public to build it. [GOVERNANCE.md](GOVERNANCE.md) gives this condition.

1. Read the standard, or only the part that you know.
2. Open an issue with the [review form](https://github.com/sunnypatneedi/OSFP/issues/new?template=review.yml).
3. Give your name. Also give any interest that you have in the result, such as your employer, your product, or a funder.
4. For each problem, give the rule ID, the problem, and a source if you have one.

An outside reader is a named person who is not the maintainer, has no direct interest in the result, and says so. An AI review does not count.

### Run the checks

The checks need Node.js 22 or later, and nothing else. Run them from the root of the repository:

```
node scripts/check-standard.mjs   # the standard against its data
node scripts/check-osfp.mjs       # the schema, the examples, the classes, and the references
node scripts/self-test.mjs        # proof that each condition in the checks can fail
```

Exit status 0 is a pass. Status 1 means one or more violations. Status 2 means that the check could not run. Read the summary lines, not only the exit status. CI runs all three checks on each pull request.

To change the standard, read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## Files

| File | What it contains |
|---|---|
| [spec/STANDARD.md](spec/STANDARD.md) | The standard |
| [spec/standard.json](spec/standard.json) | The 53 rules as data, with their classes and sources |
| [schema/](schema/) | The JSON Schema for `standard.json` |
| [examples/](examples/) | Twelve examples that tell two stories. They are informative, not normative |
| [predicates/](predicates/) | The page that the predicate type of verification evidence names |
| [proposals/](proposals/) | The template for a proposal to change the standard |
| [NEED.md](NEED.md) | The case for a standard |
| [DESIGN-LESSONS.md](DESIGN-LESSONS.md) | What earlier standards did well and badly, and what OSFP took from them |
| [GOVERNANCE.md](GOVERNANCE.md) | Who decides, and when a draft becomes a release |
| [CONTRIBUTING.md](CONTRIBUTING.md), [EDITING.md](EDITING.md), [AGENTS.md](AGENTS.md) | How to propose a change, and how to write it |
| [CHANGELOG.md](CHANGELOG.md) | The changes in each version |
| [VERIFICATION.md](VERIFICATION.md), [reviews/](reviews/) | Each verification run, and each problem that a review found, with what happened to it |
| [scripts/](scripts/) | The three checks |

## Cite

Open Software Factory Profile (OSFP), version 0.1.0-draft.1, 2026. Give the git tag of the release that you used.

## License

The [Apache License 2.0](LICENSE) applies to the full repository: the prose, the schemas, the examples, and the code. Under section 5 of the license, a contribution comes in under the same terms.
