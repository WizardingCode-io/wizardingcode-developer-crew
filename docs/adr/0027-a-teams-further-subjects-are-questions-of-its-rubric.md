# 0027. A team's further subjects are questions of its rubric

- Status: accepted (the crew, 2026-11-27, on the user's answer of 2026-11-27, "Só rubricas", to the one question put: how far the item on the teams' own entries goes)
- Date: 2026-11-27

## Context

Each team definition leaves open what the team is in the engine beyond its declaration and its skills.

- Five definitions name subjects the team's gate does not ask about: security's four (`docs/specs/2026-11-15-security-team-design.md:146`), ETL's eight (`docs/specs/2026-11-15-etl-team-design.md:251`), QA's seven (`docs/specs/2026-11-15-qa-team-design.md:23` and `:273`), DevOps's eight (`docs/specs/2026-11-15-devops-team-design.md:313`) and the architects' six (that definition's section 3).
- Four ask about the team's members, its lead's validation and a gate of its own: backend (`docs/specs/2026-11-14-backend-team-stacks-design.md:109`), researchers (`docs/specs/2026-11-15-researchers-team-design.md:442`), agentic-os (`docs/specs/2026-11-16-agentic-os-team-design.md:411`) and frontend (`docs/specs/2026-11-16-frontend-team-design.md:328`).

The user was offered three scopes: questions in the rubrics the teams already have; the same and three more validating leads; a reviewer, a rubric and a gate per group. Each step up adds roles that run on every item where the team sits.

## Decision

The further subjects enter the rubric the team already has, as numbered questions after the gate's own (item 2026-11-27-001):

- `rubrics/security.md`, questions 9 to 12: dependencies and supply chain, secrets, cryptography, AI and agents. Question 2 is unchanged: the Secrets subject has its own question, 10.
- `rubrics/data.md`, questions 7 to 14: the ETL definition's eight.
- `rubrics/test-quality.md`, questions 9 to 15: the QA definition's seven.
- `rubrics/infra.md`, questions 7 to 14: the DevOps definition's eight.
- `rubrics/architecture.md`, questions 7 to 12: the architects definition's six.

Each question is answered only when the diff touches its subject, by the trigger it names. Each ends with its reference. Where a crew skill holds the subject's rule, the reference is that skill. Where none does, the reference is the subject's row of the team's shipped declaration, `${CLAUDE_PLUGIN_ROOT}/teams/<team>.md`, the file an installed project's reviewer can open. A subject whose reference is a row alone has advisories only: a row lists sources and holds no rule. The questions that need a written estimate (data 13, infra 11 and 12, architecture 7) read the item's spec.

The tech lead validates the same subjects on a spec, in a paragraph after its spec line (`plugins/core/agents/tech-lead.md`). The frontend's spec sentence gains the project's kind, its metric and its playbook, by `wizardingcode-frontend-strategy`.

Nothing else changes: no reviewer agent, gate or risk area is added, and `TEAMS` (`packages/engine/src/team.ts`) keeps its members, gates and `validates` flags. Backend, researchers and agentic-os keep no validating lead. The frontend's groups stay in its skills and the design review. The four security subjects are not risk areas: a risk area is raised from paths and answers (`classify.ts`), and cryptography and AI have no paths of their own.

The definitions' open bullets named in Context are answered by this decision and stay as written.

One clause of security question 10, the secret named in the project's example environment file without its value, rests on the DevOps declaration's tool "the comparison of .env.example with what the code reads" (`plugins/core/teams/devops.md`, the row "Secrets and identities"), for which that declaration says the research gives no page, and not on the skill the question names. It is an advisory only.

## Consequences

- A reviewer of a change that touches one of the new subjects can return a defect it did not return before. The defects rest on the crew's own skills only.
- The cost of an item stays the same: the same reviewers read longer rubrics, and no role is added.
- Two QA skill sentences on what the crew's files hold no rule on now name the rubric's questions that ask about it (`wizardingcode-qa-measuring`, `wizardingcode-qa-test-design`).
- A later item that writes a security skill, or a rule into a declaration's row, can turn an advisory of a row-only subject into a defect, by changing the question's reference.
