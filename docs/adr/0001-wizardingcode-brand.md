# ADR 0001 — The shibaox brand is retired: WizardingCode Developer Crew

Date: 2026-10-12 · Status: accepted.

## Context

WizardingCode is retiring the shibaox brand. Its tools for coding agents now carry the WizardingCode name and its brand system: tokens, type, logo and voice, kept with the brand. This product was designed (`docs/specs/2026-10-06-sp1-engine-and-base-method-design.md`) and planned (`docs/plans/2026-10-07-*`) as the Shibaox Developer Crew. Nothing was published under that name: no release, no npm package, no marketplace entry, and no user data in `~/.shibaox/crew`.

The names were changed in commit 68c1fc4 (2026-10-10); this record says what was decided and why.

## Decisions

| Topic | As designed | From commit 68c1fc4 |
|---|---|---|
| Plugin | `shibaox-developer-crew` | `wizardingcode-developer-crew` |
| Engine package | `@shibaox/crew-engine` | `@wizardingcode/crew-engine` |
| User state | `~/.shibaox/crew` (`SHIBAOX_HOME`) | `~/.wizardingcode/crew` (`WIZARDINGCODE_HOME`) |
| Repository | `WizardingCode-io/shibaox-developer-crew` | `WizardingCode-io/wizardingcode-developer-crew` |
| Marketplace | `WizardingCode-io/shibaox-plugins` | `WizardingCode-io/wizardingcode-plugins` |
| The `crew` command and `.crew/` | unchanged | unchanged |

- Since nothing was published, there is no compatibility code: no variable aliases, no data migration, no plugin takeover. This is where it differs from wizardingcode-mem (its ADR 0011), which had 0.3.0 installs to carry over.
- The convention for the brand's products: `wizardingcode-<thing>` for the name, `WIZARDINGCODE_<THING>_*` for variables, `~/.wizardingcode/<thing>` for data. Data never lives inside an agent's plugin directory.
- The README carries the brand's lockup and mark (`docs/brand/`). They identify WizardingCode and are not covered by the repository's MIT licence.

## Consequences

- The design document and the plans in `docs/plans/` keep the names they were written with: they record what was decided at the time. The old names must not come back anywhere else.
- The local working copy's folder is renamed by hand (`mv ~/AIProjects/shibaox-developer-crew ~/AIProjects/wizardingcode-developer-crew`); git does not depend on it.
