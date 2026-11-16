import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  bullets,
  cells,
  hasText,
  hasUrl,
  isRow,
  LISTED_HEADER,
  listedGaps,
  markGaps,
  NOT_OPENED_MARK,
  namedRowGaps,
  numberedLine,
  rows,
  section,
  withChangedLine,
} from "./definition-document.ts";

const DEFINITION = new URL(
  "../../../docs/specs/2026-11-16-frontend-team-design.md",
  import.meta.url,
);
const REQUEST = new URL(
  "../../../docs/requests/2026-11-16-frontend-team-definition.md",
  import.meta.url,
);

/** The six sections, each heading once; the last is the last of the document. */
const HEADINGS = [
  "## 1. Why",
  "## 2. What exists today",
  "## 3. Subjects and where their information comes from",
  "## 4. Tools the team runs",
  "## 5. MCP servers and skills",
  "## 6. What the code needs, not decided here",
];
const LAST_HEADING = "## 6. What the code needs, not decided here";

const SUBJECTS = [
  "Kind of project, metric and playbook",
  "Brief, positioning and direction",
  "Decision record with a proof label",
  "Evidence of perception and behaviour",
  "Consumer law and deceptive patterns",
  "Typography",
  "Spacing, proportion and grids",
  "Colour",
  "Design contract and tokens",
  "Retina and pixel precision",
  "Motion",
  "Interface copy",
  "Signs of generic design",
  "Screens and states",
  "Keyboard and focus",
  "Measured accessibility",
  "Responsive",
  "Forms",
  "Frameworks per stack",
  "CSS and Tailwind",
  "Components and state",
  "Data and rendering",
  "Performance and web vitals",
  "Internationalisation, SEO and security in the browser",
  "Mobile",
  "Desktop",
  "Component library, visual tests and enforcement",
  "New sites",
];

const KINDS = [
  "Frameworks per stack and platform",
  "CSS and component libraries",
  "Motion libraries",
  "Design tokens",
  "Measurement and verification",
  "Performance",
  "Mobile and desktop toolchains",
  "Reference study",
];

const OWN_SKILLS = [
  "Strategy",
  "Visual craft",
  "Screens",
  "Engineering",
  "Platforms",
  "Verification",
  "Info-product sales page",
  "E-commerce",
  "SaaS marketing and pricing site",
  "Product UI",
  "Institutional and public sector",
  "Donations and non-profit",
  "Brand, portfolio, agency and campaign",
  "Content and media",
  "Mobile app",
  "B2B lead generation",
];

/** The tables of four cells of section 5, by the heading each stands under. */
const TABLES = [
  "Installed, in reading mode or reading by construction",
  "Held until the building item shows the reading",
  "In the project's test and development environments",
  "Left out",
  "Own-team skills",
  "Design skills distilled, not installed",
];
/** The tables of what is left out: the second cell of each of their rows opens with the words. */
const LEFT_OUT = ["Left out"];
const NOT_INSTALLED = "Not installed";

/** A row of section 5: its table, words of its second cell, the whole text of its "Read at" cell. */
const SERVERS: [string, string, string][] = [
  [
    "Installed, in reading mode or reading by construction",
    "Nuxt's own server, hosted at",
    "https://github.com/nuxt/ui",
  ],
  [
    "Installed, in reading mode or reading by construction",
    "Upstash's server, as the researchers",
    "https://github.com/upstash/context7",
  ],
  [
    "Installed, in reading mode or reading by construction",
    "Magic UI's own server",
    "https://github.com/magicuidesign/mcp",
  ],
  [
    "Installed, in reading mode or reading by construction",
    "Motion's free server, hosted",
    "https://motion.dev/docs/ai-kit-install.md",
  ],
  [
    "Installed, in reading mode or reading by construction",
    "Storybook's addon server",
    "https://github.com/storybookjs/storybook",
  ],
  [
    "Installed, in reading mode or reading by construction",
    "Chromatic's server, as the QA",
    "https://chromatic.com/docs/llms/mcp.txt",
  ],
  [
    "Installed, in reading mode or reading by construction",
    "shadcn's own server, inside",
    "https://github.com/shadcn-ui/ui",
  ],
  [
    "Installed, in reading mode or reading by construction",
    "Laravel's server, as the backend",
    "https://github.com/laravel/boost",
  ],
  [
    "Held until the building item shows the reading",
    "Figma's two servers: the remote",
    "https://developers.figma.com/docs/figma-mcp-server/",
  ],
  [
    "Held until the building item shows the reading",
    "Framer's own server, hosted",
    "https://www.framer.com/help/articles/getting-started-with-framer-mcp/",
  ],
  [
    "Held until the building item shows the reading",
    "Webflow's local server, the package",
    "https://github.com/webflow/mcp-server",
  ],
  [
    "Held until the building item shows the reading",
    "Rive's own server, built into",
    "https://rive.app/docs/editor/ai/mcp.md",
  ],
  [
    "Held until the building item shows the reading",
    "LottieFiles' two Creator servers",
    "https://docs.lottiefiles.com/en/creator-mcp/reference.md",
  ],
  [
    "Held until the building item shows the reading",
    "Expo's own server, hosted",
    "https://docs.expo.dev/mcp.md",
  ],
  [
    "Held until the building item shows the reading",
    "Apple's own server, the bridge",
    "https://developer.apple.com/tutorials/data/documentation/xcode/giving-external-agents-access-to-xcode.json",
  ],
  [
    "Held until the building item shows the reading",
    "The Dart team's server, in",
    "https://github.com/dart-lang/ai",
  ],
  [
    "In the project's test and development environments",
    "Installed and always run, Playwright's server",
    "https://github.com/microsoft/playwright-mcp",
  ],
  [
    "In the project's test and development environments",
    "Installed and always run, Chrome DevTools' server",
    "https://github.com/ChromeDevTools/chrome-devtools-mcp",
  ],
  [
    "Left out",
    "MobileBuildMCP, formerly XcodeBuildMCP",
    "https://github.com/getsentry/MobileBuildMCP",
  ],
  ["Left out", "Motion's paid server, hosted", "https://motion.dev/docs/ai-kit.md"],
  [
    "Left out",
    "Webflow's hosted server (2.0)",
    "https://developers.webflow.com/mcp/tools/data-tools.md",
  ],
  ["Left out", "Penpot's own server, `@penpot/mcp`", "https://github.com/penpot/penpot"],
  [
    "Left out",
    "LottieFiles' platform server, hosted",
    "https://docs.lottiefiles.com/en/platform/mcp/security.md",
  ],
  [
    "Own-team skills",
    "Vercel's general set of skills",
    "https://github.com/vercel-labs/agent-skills",
  ],
  [
    "Own-team skills",
    "The Next.js skills, six",
    "https://github.com/vercel/next.js/tree/canary/skills",
  ],
  [
    "Own-team skills",
    "Vercel's plugin, `vercel/vercel-plugin`",
    "https://github.com/vercel/vercel-plugin",
  ],
  ["Own-team skills", "shadcn's two skills", "https://github.com/shadcn-ui/ui"],
  ["Own-team skills", "Motion's one skill, `motion`", "https://github.com/motiondivision/ai-kit"],
  ["Own-team skills", "GreenSock's eight skills", "https://github.com/greensock/gsap-skills"],
  [
    "Own-team skills",
    "Figma's skills, 35 in three trees",
    "https://github.com/figma/mcp-server-guide",
  ],
  ["Own-team skills", "Storybook's seven skills", "https://github.com/storybookjs/storybook"],
  [
    "Own-team skills",
    "The Chrome DevTools team's eight skills",
    "https://github.com/ChromeDevTools/chrome-devtools-mcp",
  ],
  ["Own-team skills", "Expo's 24 skills", "https://github.com/expo/skills"],
  ["Own-team skills", "The Flutter team's 25 skills", "https://github.com/flutter/agent-plugins"],
  ["Own-team skills", "Google's 37 Android skills", "https://github.com/android/skills"],
  ["Own-team skills", "Laravel Boost's frontend skills", "https://github.com/laravel/boost"],
  ["Own-team skills", "Nuxt's one skill, `nuxt-ui`", "https://github.com/nuxt/ui"],
  ["Own-team skills", "Webflow's 33 skills", "https://github.com/webflow/webflow-skills"],
  [
    "Own-team skills",
    "Google Labs' 16 Stitch skills",
    "https://github.com/google-labs-code/stitch-skills",
  ],
  [
    "Design skills distilled, not installed",
    "Paul Bakaus's impeccable",
    "https://github.com/pbakaus/impeccable",
  ],
  [
    "Design skills distilled, not installed",
    "Leonxlnx's taste-skill, a user's repository",
    "https://github.com/Leonxlnx/taste-skill",
  ],
  [
    "Design skills distilled, not installed",
    "Next Level Builder's set",
    "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill",
  ],
  [
    "Design skills distilled, not installed",
    "Anthropic's frontend-design, of",
    "https://github.com/anthropics/skills",
  ],
  [
    "Design skills distilled, not installed",
    "Vercel Labs' guidelines",
    "https://github.com/vercel-labs/web-interface-guidelines",
  ],
  [
    "Design skills distilled, not installed",
    "Addy Osmani's engineering set",
    "https://github.com/addyosmani/agent-skills",
  ],
  [
    "Design skills distilled, not installed",
    "Superdesign's own skill",
    "https://github.com/superdesigndev/superdesign-skill",
  ],
  [
    "Design skills distilled, not installed",
    "Emil Kowalski's set, a user's",
    "https://github.com/emilkowalski/skills",
  ],
  [
    "Design skills distilled, not installed",
    "Hallmark, of Nutlope's",
    "https://github.com/Nutlope/hallmark",
  ],
  [
    "Design skills distilled, not installed",
    "alchaincyf's huashu-design",
    "https://github.com/alchaincyf/huashu-design",
  ],
  [
    "Design skills distilled, not installed",
    "Damir Sokolovsky's unslop",
    "https://github.com/heydamir/unslop",
  ],
  [
    "Design skills distilled, not installed",
    "Elaya's ai-design-skills",
    "https://github.com/elayadesign/ai-design-skills",
  ],
  [
    "Design skills distilled, not installed",
    "ConardLi's garden-skills",
    "https://github.com/ConardLi/garden-skills",
  ],
  [
    "Design skills distilled, not installed",
    "Julien Thibeaut's ui-skills",
    "https://github.com/ibelick/ui-skills",
  ],
  [
    "Design skills distilled, not installed",
    "Miqdad Badjuber's anti-slop",
    "https://github.com/miqdadbadjuber/anti-slop",
  ],
];

/** What a row's second cell holds, by the clause that names its loss. */
const PIN_CLAUSES = [
  "reading mode",
  "not until",
  "test and development",
  "condition",
  "distilled",
  "owed",
  "acting",
  "out",
  "caution",
];
/**
 * The kind of each table, pinned on its rows: the clause, the row's words, what its second cell
 * holds. The first clauses are the tables' kinds, one for the rows of each table; the others are
 * what a row says besides: what holds it back, what is still owed before it enters, what of it acts
 * on an account, what of it stays out and what the row cautions against.
 */
const PINS: [string, string, string][] = [
  [
    "reading mode",
    "Nuxt's own server, hosted at",
    "It reads by construction, by the documented tool list",
  ],
  [
    "reading mode",
    "Upstash's server, as the researchers",
    "For those two it reads by construction",
  ],
  [
    "reading mode",
    "Magic UI's own server",
    "It reads by construction, with no option and none needed",
  ],
  [
    "reading mode",
    "Motion's free server, hosted",
    "By the publisher's files it reads by construction",
  ],
  ["reading mode", "Storybook's addon server", "it is installed with the `docs` toolset alone"],
  [
    "reading mode",
    "Chromatic's server, as the QA",
    "It is installed in read-only mode as that definition decides",
  ],
  [
    "reading mode",
    "shadcn's own server, inside",
    "It reads by construction, only where the project uses shadcn",
  ],
  [
    "reading mode",
    "Laravel's server, as the backend",
    "the reading mode is the default set without `record-rule`",
  ],
  ["not until", "Figma's two servers: the remote", "not installed until the building item shows"],
  ["not until", "Framer's own server, hosted", "not installed until the building item shows"],
  [
    "not until",
    "Webflow's local server, the package",
    "not installed until the building item shows",
  ],
  ["not until", "Rive's own server, built into", "not installed until the building item shows"],
  ["not until", "LottieFiles' two Creator servers", "not installed until the building item shows"],
  ["not until", "Expo's own server, hosted", "not installed until the building item shows"],
  ["not until", "Apple's own server, the bridge", "not installed until the building item shows"],
  [
    "not until",
    "The Dart team's server, in",
    "not installed until the building item writes the list of tools to disable and shows the command",
  ],
  [
    "test and development",
    "Installed and always run, Playwright's server",
    "on the project's test and development environments, by the user's decision of 2026-11-16 (rule 3)",
  ],
  [
    "test and development",
    "Installed and always run, Chrome DevTools' server",
    "on the project's test and development environments, by the user's decision of 2026-11-16 (rule 3)",
  ],
  ["condition", "Vercel's general set of skills", "left out by rule 4's licence clause"],
  ["condition", "The Next.js skills, six", "only where the project already uses Next.js"],
  [
    "condition",
    "Vercel's plugin, `vercel/vercel-plugin`",
    "only where the project already uses Vercel",
  ],
  ["condition", "shadcn's two skills", "only where the project already uses shadcn/ui"],
  ["condition", "Motion's one skill, `motion`", "left out by rule 4's licence clause"],
  ["condition", "GreenSock's eight skills", "only where the project already uses GSAP"],
  ["condition", "Figma's skills, 35 in three trees", "left out by rule 4's licence clause"],
  [
    "condition",
    "Storybook's seven skills",
    "would enter only where the project already uses Storybook",
  ],
  [
    "condition",
    "The Chrome DevTools team's eight skills",
    "only where the project already uses the Chrome DevTools server or its CLI",
  ],
  ["condition", "Expo's 24 skills", "only where the project already uses Expo"],
  ["condition", "The Flutter team's 25 skills", "only where the project already uses Flutter"],
  ["condition", "Google's 37 Android skills", "only where the project already builds for Android"],
  [
    "condition",
    "Laravel Boost's frontend skills",
    "none of the frontend skills enters, under rules 4 and 13",
  ],
  ["condition", "Nuxt's one skill, `nuxt-ui`", "only where the project already uses Nuxt UI"],
  ["condition", "Webflow's 33 skills", "not among the twelve tools the user named in rule 4"],
  [
    "condition",
    "Google Labs' 16 Stitch skills",
    "not among the twelve tools the user named in rule 4",
  ],
  ["distilled", "Paul Bakaus's impeccable", "distilled under rule 5 and not installed"],
  [
    "distilled",
    "Leonxlnx's taste-skill, a user's repository",
    "distilled under rule 5 and not installed",
  ],
  ["distilled", "Next Level Builder's set", "distilled under rule 5 and not installed"],
  ["distilled", "Anthropic's frontend-design, of", "distilled under rule 5 and not installed"],
  ["distilled", "Vercel Labs' guidelines", "distilled under rule 5 and not installed"],
  ["distilled", "Addy Osmani's engineering set", "distilled under rule 5 and not installed"],
  ["distilled", "Superdesign's own skill", "distilled under rule 5 and not installed"],
  ["distilled", "Emil Kowalski's set, a user's", "distilled under rule 5 and not installed"],
  ["distilled", "Hallmark, of Nutlope's", "distilled under rule 5 and not installed"],
  ["distilled", "alchaincyf's huashu-design", "distilled under rule 5 and not installed"],
  ["distilled", "Damir Sokolovsky's unslop", "distilled under rule 5 and not installed"],
  ["distilled", "Elaya's ai-design-skills", "distilled under rule 5 and not installed"],
  ["distilled", "ConardLi's garden-skills", "distilled under rule 5 and not installed"],
  ["distilled", "Julien Thibeaut's ui-skills", "distilled under rule 5 and not installed"],
  ["distilled", "Miqdad Badjuber's anti-slop", "distilled under rule 5 and not installed"],
  [
    "owed",
    "Vercel's general set of skills",
    "Still owed: 89 of the 90 code files of `vercel-optimize`",
  ],
  [
    "owed",
    "The Next.js skills, six",
    "Still owed: the six SKILL.md beyond their frontmatter and command lines",
  ],
  [
    "owed",
    "Vercel's plugin, `vercel/vercel-plugin`",
    "Still owed: every SKILL.md, the hook sources",
  ],
  ["owed", "shadcn's two skills", "Still owed: the code blocks of the six rule files"],
  ["owed", "Motion's one skill, `motion`", "Still owed: nothing of the skill's folder"],
  ["owed", "GreenSock's eight skills", "Still owed: nothing of the eight SKILL.md"],
  ["owed", "Figma's skills, 35 in three trees", "Still owed: the 16 skills of `skills-figquery/`"],
  [
    "owed",
    "Storybook's seven skills",
    "Still owed: the output of `npx storybook skills` for each name",
  ],
  [
    "owed",
    "The Chrome DevTools team's eight skills",
    "Still owed: nothing of the eight SKILL.md and seven references",
  ],
  ["owed", "Expo's 24 skills", "Still owed: 9 of the 24 SKILL.md"],
  ["owed", "The Flutter team's 25 skills", "Still owed: the bodies of the fifteen `dart-*` skills"],
  ["owed", "Google's 37 Android skills", "Still owed: 33 of the 37 SKILL.md"],
  ["owed", "Laravel Boost's frontend skills", "Still owed: five Inertia skill files"],
  ["owed", "Nuxt's one skill, `nuxt-ui`", "Still owed: 9 of the 14 reference files"],
  ["owed", "Webflow's 33 skills", "Still owed: 32 of the 33 SKILL.md"],
  ["owed", "Google Labs' 16 Stitch skills", "Still owed: 12 of the 16 SKILL.md"],
  ["owed", "Paul Bakaus's impeccable", "Still owed"],
  ["owed", "Leonxlnx's taste-skill, a user's repository", "Still owed"],
  ["owed", "Next Level Builder's set", "Still owed"],
  ["owed", "Anthropic's frontend-design, of", "Still owed"],
  ["owed", "Vercel Labs' guidelines", "Still owed"],
  ["owed", "Addy Osmani's engineering set", "Still owed"],
  ["owed", "Superdesign's own skill", "Still owed"],
  ["owed", "Emil Kowalski's set, a user's", "Still owed"],
  ["owed", "Hallmark, of Nutlope's", "Still owed"],
  ["owed", "alchaincyf's huashu-design", "Still owed"],
  ["owed", "Damir Sokolovsky's unslop", "Still owed"],
  ["owed", "Elaya's ai-design-skills", "Still owed"],
  ["owed", "ConardLi's garden-skills", "Still owed"],
  ["owed", "Julien Thibeaut's ui-skills", "Still owed"],
  ["owed", "Miqdad Badjuber's anti-slop", "Still owed"],
  [
    "acting",
    "Vercel's general set of skills",
    "`deploy-to-vercel` deploys and creates a Vercel project",
  ],
  ["acting", "Figma's skills, 35 in three trees", "thirteen write to a Figma account"],
  [
    "acting",
    "Storybook's seven skills",
    "`ui-review` also publishes a review into the running Storybook",
  ],
  ["acting", "Expo's 24 skills", "`eas-hosting` deploys and writes a secret to the account"],
  ["acting", "Webflow's 33 skills", "`waf-rules` writes the live firewall"],
  ["acting", "Google Labs' 16 Stitch skills", "write to a Stitch account"],
  ["out", "Vercel's general set of skills", "would stay out under rules 4 and 13 in any case"],
  [
    "out",
    "Motion's one skill, `motion`",
    "would stay out under rules 4 and 13: the performance audit",
  ],
  [
    "out",
    "Figma's skills, 35 in three trees",
    "takes its steps from each tool response and would stay out",
  ],
  ["out", "Storybook's seven skills", "none of the seven enters"],
  ["out", "Expo's 24 skills", "Out as skills that publish: `eas-update`"],
  [
    "out",
    "Expo's 24 skills",
    "Out as loading at run time as well, under rules 4 and 13: `eas-simulator`",
  ],
  ["out", "Google's 37 Android skills", "Out under rules 4 and 13: `android-cli`"],
  ["out", "Laravel Boost's frontend skills", "Out by the same rules: `deploying-to-cloud`"],
  ["out", "Webflow's 33 skills", "which is instructions loaded at run time"],
  ["caution", "Upstash's server, as the researchers", "which the project does not control"],
  ["caution", "Motion's free server, hosted", "the hosted server's live tool list was not opened"],
  ["caution", "Storybook's addon server", "which is instructions loaded at run time"],
  ["caution", "Storybook's addon server", "the agent does not follow that instruction"],
  ["caution", "Chromatic's server, as the QA", "enforced by the client and not by the server"],
  [
    "caution",
    "shadcn's own server, inside",
    "The earlier note listed it as writing with no switch",
  ],
  ["caution", "Laravel's server, as the backend", "any row of any configured connection"],
  [
    "caution",
    "Laravel's server, as the backend",
    "`search-docs` sends the names and major versions of the project's packages and the query to `boost.laravel.com`",
  ],
  [
    "caution",
    "Installed and always run, Playwright's server",
    "Playwright MCP is **not** a security boundary",
  ],
  [
    "caution",
    "Installed and always run, Playwright's server",
    "Never with `--extension`, `--cdp-endpoint` or `--user-data-dir`",
  ],
  [
    "caution",
    "Installed and always run, Playwright's server",
    "Returns full details (headers and body) of a single network request",
  ],
  [
    "caution",
    "Installed and always run, Chrome DevTools' server",
    "reach the user's running Chrome",
  ],
  [
    "caution",
    "Installed and always run, Chrome DevTools' server",
    "request headers (including 'Cookie')",
  ],
  [
    "caution",
    "Installed and always run, Chrome DevTools' server",
    "Never with `--browser-url` or `--autoConnect`",
  ],
  [
    "caution",
    "The Next.js skills, six",
    "whether any loads its instructions at run time, and whether any acts, is not established",
  ],
  [
    "caution",
    "Vercel's plugin, `vercel/vercel-plugin`",
    "which of them act, publish or load their instructions at run time is not established",
  ],
  [
    "caution",
    "shadcn's two skills",
    "can pull code from third-party registries, GitHub addresses and URLs",
  ],
  [
    "caution",
    "GreenSock's eight skills",
    'tell the agent to "recommend GSAP" as the default choice',
  ],
  ["caution", "The Chrome DevTools team's eight skills", "reads the values of `HttpOnly` cookies"],
  ["caution", "The Chrome DevTools team's eight skills", "The team runs the CLI narrowed"],
  ["caution", "The Chrome DevTools team's eight skills", "`cookie-debugging` enters with the set"],
  [
    "caution",
    "Expo's 24 skills",
    "the submission credentials of `eas-app-stores` and `expo-dev-client` stay with a person",
  ],
  ["caution", "The Flutter team's 25 skills", "a licence outside the two ADR 0017 was written for"],
  ["caution", "Google's 37 Android skills", "a script the agent never runs"],
  [
    "caution",
    "Google's 37 Android skills",
    "only where a person has installed Google's Android CLI",
  ],
  [
    "caution",
    "Google's 37 Android skills",
    "signing keys and store credentials never reach the model and stay with a person",
  ],
  ["caution", "Nuxt's one skill, `nuxt-ui`", "recommends a paid third party's gateway"],
  [
    "caution",
    "Google Labs' 16 Stitch skills",
    "take the API key out of the agent's own configuration file",
  ],
];

/** The command or the switch a row is installed with: the row's words, what its fourth cell holds. */
const COMMANDS: [string, string][] = [
  [
    "Nuxt's own server, hosted at",
    "claude mcp add --transport http nuxt-ui https://ui.nuxt.com/mcp",
  ],
  ["Upstash's server, as the researchers", "npx -y @upstash/context7-mcp"],
  ["Upstash's server, as the researchers", "never with `--experimental`"],
  ["Magic UI's own server", "@magicuidesign/mcp@latest"],
  ["Motion's free server, hosted", "of type `http` at https://mcp.motion.dev"],
  ["Storybook's addon server", "npx storybook add @storybook/addon-mcp"],
  ["Storybook's addon server", "toolsets: { dev: false, test: false }"],
  [
    "Chromatic's server, as the QA",
    "claude mcp add --transport http --scope user chromatic https://mcp.chromatic.com/mcp",
  ],
  [
    "Chromatic's server, as the QA",
    "with `chromatic_mutate` blocked by the owner or left out of the client's allowed tools",
  ],
  ["shadcn's own server, inside", "npx shadcn@latest mcp init --client claude"],
  ["Laravel's server, as the backend", "php artisan boost:mcp"],
  ["Laravel's server, as the backend", "BOOST_RULES_ENABLED=false"],
  [
    "Figma's two servers: the remote",
    "claude mcp add --transport http figma https://mcp.figma.com/mcp",
  ],
  [
    "Framer's own server, hosted",
    "claude mcp add --transport http --scope user framer https://mcp.framer.com/mcp",
  ],
  ["Webflow's local server, the package", "webflow-mcp-server@latest"],
  [
    "Rive's own server, built into",
    "claude mcp add --transport http rive http://127.0.0.1:9791/mcp",
  ],
  [
    "LottieFiles' two Creator servers",
    "claude mcp add --transport http --scope user creator-mcp https://creator.mcp.lottiefiles.com/mcp",
  ],
  ["Expo's own server, hosted", "claude mcp add --transport http expo https://mcp.expo.dev/mcp"],
  ["Apple's own server, the bridge", "claude mcp add --transport stdio xcode -- xcrun mcpbridge"],
  [
    "Installed and always run, Playwright's server",
    "claude mcp add playwright npx @playwright/mcp@latest",
  ],
  [
    "Installed and always run, Playwright's server",
    "`--isolated`, `--no-webmcp` and `--allowed-origins`",
  ],
  ["Installed and always run, Chrome DevTools' server", "`chrome-devtools-mcp@latest`"],
  [
    "Installed and always run, Chrome DevTools' server",
    "`--isolated`, `--redact-network-headers`, `--no-usage-statistics` and `--no-performance-crux`",
  ],
  [
    "Vercel's general set of skills",
    "npx skills add vercel-labs/agent-skills --skill {skill-name}",
  ],
  ["The Next.js skills, six", "npx skills add vercel/next.js"],
  ["shadcn's two skills", "npx skills add shadcn/ui"],
  ["GreenSock's eight skills", "npx skills add https://github.com/greensock/gsap-skills"],
  ["Storybook's seven skills", "npx storybook automigrate skills"],
  ["The Chrome DevTools team's eight skills", "npm i chrome-devtools-mcp@latest -g"],
  ["Expo's 24 skills", "npx skills@latest add expo/skills --skill '*'"],
  ["Google's 37 Android skills", "android skills add --all"],
  ["Laravel Boost's frontend skills", "php artisan boost:install --skills"],
  ["Nuxt's one skill, `nuxt-ui`", "npx skills add nuxt/ui"],
  ["Webflow's 33 skills", "npx skills add https://github.com/webflow/webflow-skills"],
  ["Google Labs' 16 Stitch skills", "npx skills add google-labs-code/stitch-skills"],
  ["Paul Bakaus's impeccable", "npx impeccable detect --json"],
];

/** A sentence a section holds once: the section and the words. */
const STATED: [number, string][] = [
  [
    1,
    "The definition covers the three; the building goes web first with the playbooks per kind of project, then mobile (native, Expo, Flutter), then desktop, and each phase is proven on a real project.",
  ],
  [1, "A project that fits none declares a new kind with its metric."],
  [
    1,
    "The five labels are the user's decision of 2026-11-16; these two points are the session's reading from the research, told to the user the same day with the points taken under the standing rules.",
  ],
  [1, "The team never invokes dopamine, neuroscience or addiction."],
  [1, "It never builds a deceptive pattern."],
  [1, "Until that run the team is not called consolidated."],
  [
    1,
    "After the definition and the building, the new team runs on a real project of the user's, of one of the ten kinds, with real photographs, and the result is judged blind against today's crew by the user and other people the user names, besides the gates.",
  ],
  [5, 'in rule 5 the first sentence is the user\'s choice, "Destiladas, e impeccable instalado"'],
  [6, "The QA team's definition carries the same order"],
  [6, "How a session tells a test or development environment from production"],
  [6, "what is done where a development database was restored from production data"],
  [6, "The architects team's definition carries it too"],
];

/** The numbered rules of section 5, each whole line, which the request holds whole too. */
const RULE_LINES: [string, string][] = [
  [
    "1. ",
    "1. The other teams' rule: only an MCP server or skills made by a tool's own team. A tool with no server of its own runs from the command line. MobileBuildMCP is left out by this rule: it is Sentry's and not Apple's.",
  ],
  [
    "2. ",
    "2. The standing rule of the other definitions on servers, taken by the session under the standing rules and told to the user on 2026-11-16, not asked: a server that writes or acts enters only with a reading mode and is installed with it, a server that can return a secret's value to the model is left out, and a server admitted whose reading alone the readings did not confirm is not installed until the building item shows that it only reads. A server that reads by construction enters: Nuxt UI's, Context7, shadcn's, Magic UI's and Motion's free server, shadcn's by the reading of 2026-11-16 of its source, which corrects the earlier note that listed it as writing. Figma's, Penpot's, Rive's, LottieFiles', Framer's and Webflow's were taken as writing with no switch: they are left out or held, and their tools are used from the command line. Each server enters only where the project uses its tool.",
  ],
  [
    "3. ",
    "3. Playwright's and Chrome DevTools' servers are installed and always run, on the project's test and development environments, the user's decision of 2026-11-16: \"é para ignorar esta regra eu nao quero mais erros de e2e ok quero que corra isto sempre caso contrario como é que testam o frontend ??? [...] indicaçõa clara é para correr ambientes de teste e desenvolvimento nao tem dados que sejam sensiveis\". The rule on a server that can return a secret's value (rule 2) does not hold them back there, those environments holding no sensitive data by the user's word, though neither server has a reading mode, both run script in the page and both return request headers with their cookies. The team tests every frontend change in a real browser through them. Never against a production environment or a real user's session: this last clause is the session's reading of \"test and development\", told to the user.",
  ],
  [
    "4. ",
    "4. Own-team skills follow the rule of the DevOps team's definition (`docs/specs/2026-11-15-devops-team-design.md`, section 5, rule 5), the user's decision of 2026-11-16: each set only where the project already uses the tool, the skills alone, without the hooks that approve by themselves and without the servers that act on an account. The tools the user named: Motion, GSAP, shadcn, Figma, Storybook, Chrome DevTools, Expo, Flutter, Android, Laravel Boost, Nuxt UI and Vercel. Skills that publish or approve stay out, and a skill inside an admitted set that deploys, triggers a pipeline, installs on a host or spends enters with its set, its row naming it as acting; when one of them is used, the rule applies that a deploy to production, and any command that deletes or changes a real resource, is a person's decision. A skill that loads its instructions at run time cannot be read before it enters and stays out, by rule 13. By the rule cited a set with no licence is left out: the reading of 2026-11-16 found no licence file in Motion's set (`motiondivision/ai-kit`), in Figma's (`figma/mcp-server-guide`) and in `vercel-labs/agent-skills`, which the DevOps team's definition already leaves out.",
  ],
  [
    "5. ",
    "5. Third-party design skills are not installed: they are distilled into the crew's own skills, each rule with a row in the sources ledger (`docs/sources/ledger.json`, ADR 0017) and a proof label, each set read whole first, the user's choice of 2026-11-16 being \"Destiladas, e impeccable instalado\". The base for the craft rules is the most-starred, maintained design and frontend skills on GitHub, which is the session's reading of the user's words \"repara existem as skills no github mais estrladas porque é que é sempre tao dificil tudo contigo\": impeccable, taste-skill, ui-ux-pro-max, Anthropic's frontend-design and the other sets the table under this rule names. A distilled rule keeps what its set's licence asks: unslop is CC BY 4.0, so a skill derived from it credits the author, links the repository and the licence and says it was modified.",
  ],
  [
    "6. ",
    "6. impeccable's detector is installed as a command-line tool the crew's gate runs, without its hooks, the user's choice with rule 5: 62 rules, no model, Apache-2.0. By the reading of 2026-11-16 at commit `d41d986`: `npx impeccable detect --json` with its targets prints a JSON array of findings and exits 0 with none, 2 with findings and 1 when a target could not be scanned; source files get the pattern rules only, and the rules that need a rendered page run when a URL is scanned, through an installed Chrome, Chromium or Edge; npm downloads the launcher and the platform's engine package, and the launcher downloads the engine from the repository's releases, checked by SHA-256, only when that package and the cache hold none; a signed-in machine uploads counts after a full scan of a repository and may run a separately downloaded Pro build with other rules. So the machine that runs the gate never signs in, and the gate runs the detector with `DO_NOT_TRACK=1` and `IMPECCABLE_PRO=off`. The set's hooks and its skill, which loads instructions at run time, are not installed.",
  ],
  [
    "7. ",
    "7. Paid sources enter by name and are not opened, and no rule cites a number of theirs: Refactoring UI and animations.dev. This is the session's reading of the same words of the user, who picked no option.",
  ],
  [
    "8. ",
    "8. Galleries are studied through written observations of the crew's own, each with the original site's link: no copied capture, no scraping, and nothing used to train or score a model. The crew's design library (`plugins/core/design/library/`) is checked against this in the building item.",
  ],
  [
    "9. ",
    "9. What can be measured is enforced by a gate; taste is judged against the client's direction. One model's verdict counts as one juror's: the session's reading from the research. Taken by the session under the standing rules and told to the user on 2026-11-16.",
  ],
  [
    "10. ",
    "10. Before the first file, the project declares its kind, its primary metric and its direction. The ten kinds, each with its playbook, its metric and its evidence: info-product sales page; e-commerce; SaaS marketing and pricing site; product UI (web apps, dashboards); institutional and public sector; donations and non-profit; brand, portfolio, agency and campaign; content and media; mobile app; B2B lead generation. A project that fits none declares a new kind with its metric.",
  ],
  [
    "11. ",
    "11. Every design decision carries its label: norm, platform guidance, published study with its replication note, measured on this site, or hypothesis. A label never upgrades without a measurement, and a vendor's benchmark or case study gets no label of its own: it is said as the vendor's figure and carries the label \"hypothesis\" until measured on this site. The five labels are the user's decision of 2026-11-16; these two points are the session's reading from the research, told to the user the same day with the points taken under the standing rules.",
  ],
  [
    "12. ",
    "12. The team never invokes dopamine, neuroscience or addiction. It uses what works and is lawful: social proof, scarcity and urgency only when true, and defaults that serve the user. It never builds a deceptive pattern.",
  ],
  [
    "13. ",
    "13. No set enters unread, a condition of the building item: each own-team set is read whole, scripts included, at the commit that is installed, and each third-party set is read whole at the commit it is distilled from. The rows say what the reading of 2026-11-16 read whole and what it did not.",
  ],
  [
    "14. ",
    "14. The team's own skills, sixteen, defined here and written in a later item, taken by the session under the standing rules and told to the user on 2026-11-16: one per group of subjects (strategy; visual craft; screens; engineering; platforms; verification) and one per kind of project, its playbook (info-product sales page; e-commerce; SaaS marketing and pricing site; product UI; institutional and public sector; donations and non-profit; brand, portfolio, agency and campaign; content and media; mobile app; B2B lead generation).",
  ],
];
/** The rules of section 5: how the rule's line opens and a whole sentence of it. */
const RULE_SENTENCES: [string, string][] = [
  ["1. ", "MobileBuildMCP is left out by this rule: it is Sentry's and not Apple's."],
  [
    "2. ",
    "A server that reads by construction enters: Nuxt UI's, Context7, shadcn's, Magic UI's and Motion's free server, shadcn's by the reading of 2026-11-16 of its source, which corrects the earlier note that listed it as writing.",
  ],
  ["3. ", "The team tests every frontend change in a real browser through them."],
  [
    "4. ",
    "A skill that loads its instructions at run time cannot be read before it enters and stays out, by rule 13.",
  ],
  [
    "5. ",
    "A distilled rule keeps what its set's licence asks: unslop is CC BY 4.0, so a skill derived from it credits the author, links the repository and the licence and says it was modified.",
  ],
  [
    "6. ",
    "So the machine that runs the gate never signs in, and the gate runs the detector with `DO_NOT_TRACK=1` and `IMPECCABLE_PRO=off`.",
  ],
  [
    "7. ",
    "Paid sources enter by name and are not opened, and no rule cites a number of theirs: Refactoring UI and animations.dev.",
  ],
  [
    "8. ",
    "The crew's design library (`plugins/core/design/library/`) is checked against this in the building item.",
  ],
  [
    "9. ",
    "What can be measured is enforced by a gate; taste is judged against the client's direction.",
  ],
  ["10. ", "A project that fits none declares a new kind with its metric."],
  [
    "11. ",
    "The five labels are the user's decision of 2026-11-16; these two points are the session's reading from the research, told to the user the same day with the points taken under the standing rules.",
  ],
  ["12. ", "It never builds a deceptive pattern."],
  ["13. ", "The rows say what the reading of 2026-11-16 read whole and what it did not."],
  [
    "14. ",
    "one per group of subjects (strategy; visual craft; screens; engineering; platforms; verification) and one per kind of project, its playbook",
  ],
];
/** The user's further decisions on the rules: how the rule's line opens, what it holds. */
const RULE_PHRASES: [string, string][] = [
  ["2. ", "left out or held"],
  ["4. ", "the skills alone"],
  ["5. ", "Destiladas, e impeccable instalado"],
  ["6. ", "without its hooks"],
  ["8. ", "no copied capture, no scraping"],
  ["12. ", "only when true"],
  ["3. ", "quero que corra isto sempre"],
  ["3. ", "Never against a production environment or a real user's session"],
  ["9. ", "One model's verdict counts as one juror's"],
];
const RULES = [...RULE_SENTENCES, ...RULE_PHRASES];

/** The words a row of section 3 or 4 holds, which limit what the team does: section, row, words. */
const PHRASES: [number, string, string][] = [
  [
    3,
    "Kind of project, metric and playbook",
    "a benchmark's figure states a typical range and never a predicted lift",
  ],
  [
    3,
    "Kind of project, metric and playbook",
    "awards, time on site and scroll depth are not outcomes",
  ],
  [
    3,
    "Kind of project, metric and playbook",
    "no published experiment on pricing-page layout was found in two rounds",
  ],
  [
    3,
    "Brief, positioning and direction",
    "is vocabulary for talking with the client and never evidence",
  ],
  [3, "Brief, positioning and direction", "so no table of theirs is cited"],
  [3, "Decision record with a proof label", "a label never upgrades without a measurement"],
  [3, "Decision record with a proof label", "labels the decision a hypothesis"],
  [
    3,
    "Evidence of perception and behaviour",
    "the team never says a design is based on neuroscience, releases dopamine, forms a habit by design or will go viral",
  ],
  [
    3,
    "Evidence of perception and behaviour",
    "which measured ratings of visual appeal and not purchase",
  ],
  [
    3,
    "Evidence of perception and behaviour",
    "so the building item reads them before a rule cites them",
  ],
  [3, "Consumer law and deceptive patterns", "treats a proposal as a proposal"],
  [3, "Consumer law and deceptive patterns", "and no rule of 90 days"],
  [3, "Consumer law and deceptive patterns", "are not merged"],
  [
    3,
    "Consumer law and deceptive patterns",
    "On consent banners, one study, read in its abstract and confirmed by the register",
  ],
  [3, "Typography", "they bound what a user may override, not the default design"],
  [3, "Typography", "The 45 to 75 characters rule is a convention"],
  [
    3,
    "Typography",
    "Refactoring UI enters by name under rule 7, not opened, with no number of its own",
  ],
  [3, "Spacing, proportion and grids", "Platform guidance, which is not that norm"],
  [3, "Spacing, proportion and grids", "The 8-point grid is a convention"],
  [3, "Spacing, proportion and grids", "The golden ratio is a convention too"],
  [3, "Spacing, proportion and grids", "Refactoring UI's spacing scale stays out under rule 7"],
  [3, "Colour", "APCA is not a norm"],
  [3, "Colour", "the team measures the WCAG ratio first"],
  [3, "Colour", "The 60-30-10 rule is a convention of interior decorating"],
  [
    3,
    "Colour",
    "no study that ties a specific colour to conversion, so the team makes no such claim",
  ],
  [3, "Design contract and tokens", "the team cites it as a community format and not as a norm"],
  [
    3,
    "Design contract and tokens",
    "So the team tests the built output and not the token source alone",
  ],
  [3, "Design contract and tokens", "labelled a hypothesis under rule 11"],
  [3, "Retina and pixel precision", "The research names no norm for it"],
  [
    3,
    "Retina and pixel precision",
    "so the team claims it only as a visual regression against a baseline made on the same operating system, browser and device scale",
  ],
  [3, "Retina and pixel precision", "a practitioners' convention of low confidence"],
  [3, "Motion", "Motion durations are convention"],
  [3, "Motion", "animations.dev enters by name under rule 7, not opened"],
  [3, "Motion", "no study that links UI animation to conversion, and the team claims none"],
  [
    3,
    "Interface copy",
    "No norm and no platform page on writing was opened by the research for this subject",
  ],
  [3, "Interface copy", "is never applied to Portuguese copy as measured"],
  [3, "Interface copy", "A vendor's observational benchmark, not an experiment"],
  [
    3,
    "Signs of generic design",
    "So a ban list alone moves the model to its next default, and the team pairs every exclusion with a stated direction",
  ],
  [
    3,
    "Signs of generic design",
    "passing the detectors is a floor and is never reported as proof that a page is preferred",
  ],
  [3, "Signs of generic design", "No study opened measures how alike generated sites are"],
  [3, "Screens and states", "carries the label hypothesis under rule 11"],
  [3, "Screens and states", "a result does not transfer between sites"],
  [
    3,
    "Keyboard and focus",
    "The 2px perimeter is a norm at level AAA alone and the 3px ring is one design system's value",
  ],
  [3, "Keyboard and focus", "takes no fact from them"],
  [3, "Measured accessibility", "Of touch targets, 24 CSS px is the norm"],
  [3, "Measured accessibility", "the team never calls it proof of accessibility"],
  [3, "Measured accessibility", "EN 301 549 itself was not opened"],
  [3, "Responsive", "Design systems' breakpoints differ and none is a norm"],
  [3, "Responsive", "The team never disables zoom"],
  [3, "Forms", "its figures are never quoted as a promise"],
  [3, "Forms", "it is not monotonic"],
  [3, "Component library, visual tests and enforcement", "impeccable's hooks are not installed"],
  [
    3,
    "Component library, visual tests and enforcement",
    "the team compares with a fixed tolerance whose value the building item sets",
  ],
  [
    3,
    "Component library, visual tests and enforcement",
    "The defaults are not comparable across tools",
  ],
  [3, "New sites", "one model's verdict counts as one juror's"],
  [3, "New sites", "a preprint with no replication in the research"],
  [3, "New sites", "for Godly no terms page was found"],
  [3, "Frameworks per stack", "read from the lock file before any code is written"],
  [3, "Frameworks per stack", "a vendor's figure, the article being Vercel's"],
  [3, "Frameworks per stack", "new Laravel work does not start on Volt"],
  [3, "CSS and Tailwind", "a widely available feature is used with no fallback"],
  [3, "CSS and Tailwind", "a limited one as progressive enhancement only"],
  [3, "CSS and Tailwind", "projects that need older browsers stay on v3.4"],
  [
    3,
    "Components and state",
    "the research opened no first-party page of practice on components or on state",
  ],
  [3, "Components and state", "it is used only where the project already holds it"],
  [
    3,
    "Components and state",
    "an agent that installs the old name gets a frozen release candidate",
  ],
  [3, "Data and rendering", "the words SSR, SSG and ISR describe outcomes of that one model"],
  [3, "Data and rendering", "Nuxt's own guidance on rendering modes was not opened"],
  [3, "Data and rendering", "No source on the cost of hydration was opened"],
  [3, "Performance and web vitals", "The thresholds are Google's guidance and no norm"],
  [3, "Performance and web vitals", "INP is said to be unproven until field data exists"],
  [3, "Performance and web vitals", "so they never carry correctness"],
  [
    3,
    "Internationalisation, SEO and security in the browser",
    "has no row that names XSS or Content Security Policy",
  ],
  [
    3,
    "Internationalisation, SEO and security in the browser",
    "takes its XSS and CSP rules from the security team and writes none of its own",
  ],
  [
    3,
    "Internationalisation, SEO and security in the browser",
    "the row holds what was read and section 6 holds the rest",
  ],
  [3, "Mobile", "Every size on this row is platform guidance and none is a norm"],
  [
    3,
    "Mobile",
    "the amount that will be billed must be the most prominent pricing element in the layout",
  ],
  [3, "Mobile", "Nothing of the crew's own covers native mobile today"],
  [3, "Desktop", "Every size on this row is platform guidance and none is a norm"],
  [3, "Desktop", "one component cannot carry a single hit size across platforms"],
  [3, "Desktop", "names who holds them"],
  [3, "Mobile", "Signing keys and store credentials never reach the model"],
  [
    4,
    "Frameworks per stack and platform",
    "the team reads the installed version and the framework's documentation for that version before it writes",
  ],
  [
    4,
    "Frameworks per stack and platform",
    "the building item reads those pages before a rule cites them",
  ],
  [4, "CSS and component libraries", "limited, so never without a feature test"],
  [
    4,
    "CSS and component libraries",
    "is proprietary by its Packagist record and enters only where the project already has it",
  ],
  [4, "CSS and component libraries", "a project that needs older browsers stays on 3.4"],
  [
    4,
    "Motion libraries",
    "it enters only where the project already uses it, by the sentence that opens this section",
  ],
  [
    4,
    "Motion libraries",
    "so a rule reads the installed version's source and cites no remembered default",
  ],
  [4, "Motion libraries", "so it is no gate here"],
  [
    4,
    "Design tokens",
    "The team writes tokens against the published 2025.10 and never against the editor's draft",
  ],
  [
    4,
    "Design tokens",
    "so a token type the build does not carry through is found by a test and not assumed",
  ],
  [4, "Measurement and verification", "run from the command line and never through its hooks"],
  [
    4,
    "Measurement and verification",
    "A run with no violation is a floor and never said to prove accessibility",
  ],
  [
    4,
    "Measurement and verification",
    "so the tolerance is fixed in the project's configuration and not left to the default",
  ],
  [4, "Performance", "so the team never reports a lab figure as a field result"],
  [4, "Performance", "so five runs and their median are where the building item starts"],
  [
    4,
    "Performance",
    "a budget for one of these is the project's own measure or a hypothesis by rule 11",
  ],
  [
    4,
    "Mobile and desktop toolchains",
    "a build, a store submission or an update is a deploy, a person's decision",
  ],
  [4, "Mobile and desktop toolchains", "Signing keys and store credentials never reach the model"],
  [4, "Mobile and desktop toolchains", "so a Tauri app feature-tests what the row"],
  [
    4,
    "Reference study",
    "and what the team keeps is a written observation of its own with the original site's link",
  ],
  [4, "Reference study", "which the team does not read as permission"],
  [4, "Reference study", "so the team takes nothing from them beyond a link"],
];

const NOT_OPENED_SENTENCE =
  'Sixteen addresses in this document are marked "(not opened)", each wherever it stands; each is listed here once, with what the document rests on in its place:';
/** The pages that were not read on 2026-11-16, each listed in section 6. */
const NOT_OPENED = [
  "https://blog.hubspot.com/blog/tabid/6307/bid/6746/which-types-of-form-fields-lower-landing-page-conversions.aspx",
  "https://bugzilla.mozilla.org/show_bug.cgi?id=1741689",
  "https://docs.flutter.dev/ai/get-started",
  "https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_23_418/IP_23_418_EN.pdf",
  "https://m3.material.io/",
  "https://openviewpartners.com/2022-product-benchmarks/",
  "https://piano.io/?p=12245",
  "https://researchr.org/publication/RelloPM16",
  "https://score.motion.dev/",
  "https://stanford.edu/~knutson/nfc/venkatraman15.pdf",
  "https://www.apartmenttherapy.com/interior-design-rule-60-30-10-explained-37504313",
  "https://www.cambridge.org/core/journals/behavioral-and-brain-sciences/article/magical-number-4-in-shortterm-memory-a-reconsideration-of-mental-storage-capacity/44023F1147D4A1D44BDC0AD226838496",
  "https://www.deque.com/automated-accessibility-coverage-report/",
  "https://www.doi.org/10.1027/1864-9335/A000178",
  "https://www.yorku.ca/mack/hci1992.html",
  "https://www2.webkit.org/show_bug.cgi?id=154437",
];

/** The gap of a pin: by its clause and its row, and by its words where the row has two of the clause. */
const pinGap = (clause: string, words: string, holds: string) =>
  PINS.filter(([name, row]) => name === clause && row === words).length > 1
    ? `${clause}: ${words}: ${holds}`
    : `${clause}: ${words}`;
/** The gap of a command: by its row, and by its words where the row has two. */
const commandGap = (words: string, command: string) =>
  COMMANDS.filter(([row]) => row === words).length > 1
    ? `command: ${words}: ${command}`
    : `command: ${words}`;

/** An absent document reads as empty text, so every test is registered and fails by name. */
const text = existsSync(DEFINITION) ? readFileSync(DEFINITION, "utf8") : "";
const request = existsSync(REQUEST) ? readFileSync(REQUEST, "utf8") : "";

/** The line of section 5 that states a numbered rule; empty when the section has none. */
const ruleOf = (document: string, opens: string) => numberedLine(document, 5, opens);

/** The rows of four cells under each `### ` heading of section 5, the header rows left out. */
function tablesOf(document: string): Map<string, string[][]> {
  const tables = new Map<string, string[][]>();
  for (const part of section(document, 5).split(/\n(?=### )/)) {
    const heading = part.split("\n")[0]?.replace(/^### /, "") ?? "";
    const four = rows(part).filter((row) => row.length === 4 && row[0] !== LISTED_HEADER);
    tables.set(heading, four);
  }
  return tables;
}

/**
 * Every clause of the frontend team's definition the text fails, by name; empty when it holds
 * all. It reads the document by section, by table and by table row, so a name inside a longer
 * cell, a URL on another row, a row under another table's heading or a row written twice does not
 * pass. Section 5 holds tables of two shapes: a row of four cells is a server or a set of skills,
 * a row of two is one of the team's own skills. `asked` is the request the definition answers,
 * which holds each rule's whole line.
 */
function definitionGaps(document: string, asked: string = request): string[] {
  const gaps: string[] = [];
  const headings = document.split("\n").filter((line) => line.startsWith("## "));
  for (const heading of HEADINGS)
    if (headings.filter((line) => line === heading).length !== 1) gaps.push(`section: ${heading}`);
  if (headings.at(-1) !== LAST_HEADING) gaps.push("last section");
  const sources = rows(section(document, 3));
  const tools = rows(section(document, 4));
  const five = rows(section(document, 5));
  const servers = five.filter((row) => row.length === 4);
  const own = five.filter((row) => row.length === 2);
  gaps.push(...namedRowGaps(sources, SUBJECTS, "subject row", "no source", hasUrl));
  gaps.push(...namedRowGaps(tools, KINDS, "kind row", "empty row", hasText));
  for (const skill of OWN_SKILLS)
    if (own.filter((row) => row[0] === skill).length !== 1) gaps.push(`own skill: ${skill}`);
  if (sources.length !== SUBJECTS.length + 1) gaps.push("row count: section 3");
  if (tools.length !== KINDS.length + 1) gaps.push("row count: section 4");
  if (own.length !== OWN_SKILLS.length + 1) gaps.push("row count: own skills");
  const tables = tablesOf(document);
  const rowsOf = (words: string) => servers.filter((row) => row[1]?.includes(words));
  for (const [table, words, readAt] of SERVERS) {
    const found = (tables.get(table) ?? []).filter((row) => row[1]?.includes(words));
    if (found.length !== 1 || rowsOf(words).length !== 1 || found[0]?.[2] !== readAt)
      gaps.push(`server url: ${words}`);
  }
  for (const table of TABLES)
    if (tables.get(table)?.length !== SERVERS.filter(([name]) => name === table).length)
      gaps.push(`row count: ${table}`);
  gaps.push(...listedGaps(five, LISTED_HEADER, SERVERS.length));
  for (const [clause, words, holds] of PINS)
    if (!rowsOf(words)[0]?.[1]?.includes(holds)) gaps.push(pinGap(clause, words, holds));
  for (const [table, words] of SERVERS)
    if (LEFT_OUT.includes(table) && !rowsOf(words)[0]?.[1]?.startsWith(NOT_INSTALLED))
      gaps.push(`not installed: ${words}`);
  for (const [words, command] of COMMANDS)
    if (!rowsOf(words)[0]?.[3]?.includes(command)) gaps.push(commandGap(words, command));
  for (const row of servers)
    if (row[0] !== LISTED_HEADER && row[3] === "") gaps.push(`install cell: ${row[0]}`);
  const numbered = section(document, 5)
    .split("\n")
    .filter((line) => /^\d+\. /.test(line));
  if (numbered.length !== RULE_LINES.length) gaps.push("rule count");
  for (const [opens, line] of RULE_LINES)
    if (ruleOf(document, opens) !== line) gaps.push(`rule ${opens.trim()} line`);
  for (const [opens, words] of RULES)
    if (!ruleOf(document, opens).includes(words)) gaps.push(`rule ${opens.trim()} ${words}`);
  const askedLines = asked.split("\n");
  for (const [opens, line] of RULE_LINES)
    if (askedLines.filter((asks) => asks === line).length !== 1)
      gaps.push(`request: rule ${opens.trim()} line`);
  for (const [number, words] of STATED)
    if (section(document, number).split(words).length !== 2) gaps.push(`sentence: ${words}`);
  for (const [number, name, words] of PHRASES) {
    const table = number === 3 ? sources : tools;
    if (!table.find((row) => row[0] === name)?.[1]?.includes(words))
      gaps.push(`limit: ${name}: ${words}`);
  }
  gaps.push(...markGaps(document, NOT_OPENED, NOT_OPENED_MARK, "not opened"));
  const six = section(document, 6);
  if (!six.includes(NOT_OPENED_SENTENCE)) gaps.push("not opened sentence");
  const listed = bullets(six);
  for (const url of NOT_OPENED)
    if (listed.filter((line) => line.startsWith(`${url}${NOT_OPENED_MARK}`)).length !== 1)
      gaps.push(`not listed: ${url}`);
  return gaps;
}

/** `document` with the one table row of section `number` that `picks` chooses changed. */
const withLineOf = (
  document: string,
  number: number,
  what: string,
  picks: (line: string) => boolean,
  change: (line: string) => string,
) => withChangedLine(document, number, what, (line) => isRow(line) && picks(line), change);

/** The row of section `number` whose first cell is `name`, changed. */
const withRow = (number: number, name: string, change: (line: string) => string) =>
  withLineOf(text, number, name, (line) => cells(line)[0] === name, change);

/** The four-cell row of section 5 of `document` whose second cell holds `words`, changed. */
const withServerOf = (document: string, words: string, change: (line: string) => string) =>
  withLineOf(
    document,
    5,
    words,
    (line) => cells(line).length === 4 && (cells(line)[1] ?? "").includes(words),
    change,
  );
const withServer = (words: string, change: (line: string) => string) =>
  withServerOf(text, words, change);

/** The four-cell row of section 5 that `words` pick in its second cell; no cell when none does. */
const serverOf = (words: string) =>
  rows(section(text, 5)).find((row) => row.length === 4 && row[1]?.includes(words)) ?? [];
const secondCellOf = (words: string) => serverOf(words)[1] ?? "";

/** A row of section 5 with `words` taken off its cell `index` alone, at every place. */
const withoutInCell = (picks: string, index: number, words: string) =>
  withServer(picks, (line) =>
    line
      .split(" | ")
      .map((cell, at) => (at === index ? cell.replaceAll(words, "other words") : cell))
      .join(" | "),
  );
const withoutInSecond = (picks: string, words: string) => withoutInCell(picks, 1, words);

/** How many rows of section `number` have `name` as their first cell. */
const rowCount = (number: number, name: string) =>
  rows(section(text, number)).filter((row) => row[0] === name).length;
/** The second cell of the row of section `number` whose first cell is `name`. */
const secondOf = (number: number, name: string) =>
  rows(section(text, number)).find((row) => row[0] === name)?.[1] ?? "";

const twice = (line: string) => `${line}\n${line}`;
/** One row of each table read by its first cell: the section and the name. */
const [SUBJECT = ""] = SUBJECTS;
const [KIND = ""] = KINDS;
const [OWN = ""] = OWN_SKILLS;
const FIRST: [number, string][] = [
  [3, SUBJECT],
  [4, KIND],
  [5, OWN],
];
const NAMED: [number, string[], string][] = [
  [3, SUBJECTS, "subject row"],
  [4, KINDS, "kind row"],
  [5, OWN_SKILLS, "own skill"],
];

test("2026-11-16-005 AC-1: the frontend team's definition holds every clause", () => {
  expect(definitionGaps(text)).toEqual([]);
});

test("2026-11-16-005 AC-1: a section whose heading changes, or a section after the last, is named", () => {
  for (const heading of HEADINGS) {
    expect(text, heading).toContain(`\n${heading}\n`);
    const changed = text.replace(`\n${heading}\n`, `\n${heading} and more\n`);
    const gap = `section: ${heading}`;
    expect(definitionGaps(changed), heading).toEqual(
      heading === LAST_HEADING ? [gap, "last section"] : [gap],
    );
  }
  expect(definitionGaps(`${text}\n## 7. More\n\nMore.\n`)).toEqual(["last section"]);
});

test("2026-11-16-005 AC-1: a subject, a kind or an own skill whose row leaves its table is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names) {
      expect(rowCount(number, name), name).toBe(1);
      expect(definitionGaps(withRow(number, name, () => "")), name).toContain(`${clause}: ${name}`);
    }
});

test("2026-11-16-005 AC-1: a subject, a kind or an own skill whose row stands twice is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names) {
      expect(rowCount(number, name), name).toBe(1);
      expect(definitionGaps(withRow(number, name, twice)), name).toContain(`${clause}: ${name}`);
    }
});

test("2026-11-16-005 AC-1: a name left only inside a longer first cell has no row", () => {
  const longer = (number: number, name: string) =>
    withRow(number, name, (line) => line.replace(`| ${name} |`, `| ${name} and more |`));
  for (const [number, name] of FIRST) expect(rowCount(number, name), name).toBe(1);
  const limits = PHRASES.filter(([number, name]) => number === 3 && name === SUBJECT).map(
    ([, name, words]) => `limit: ${name}: ${words}`,
  );
  expect(definitionGaps(longer(3, SUBJECT))).toEqual([
    `subject row: ${SUBJECT}`,
    `no source: ${SUBJECT}`,
    ...limits,
  ]);
  expect(definitionGaps(longer(4, KIND))).toContain(`kind row: ${KIND}`);
  expect(definitionGaps(longer(5, OWN))).toEqual([`own skill: ${OWN}`]);
});

test("2026-11-16-005 AC-1: a subject's row with no URL, or a kind's row with nothing in it, is named", () => {
  const emptied = (line: string) => `${line.split(" | ")[0]} | |`;
  for (const subject of SUBJECTS) {
    expect(secondOf(3, subject), subject).toContain("https://");
    expect(definitionGaps(withRow(3, subject, emptied)), subject).toContain(
      `no source: ${subject}`,
    );
  }
  for (const kind of KINDS) {
    expect(secondOf(4, kind), kind).not.toBe("");
    expect(definitionGaps(withRow(4, kind, emptied)), kind).toContain(`empty row: ${kind}`);
  }
});

test("2026-11-16-005 AC-1: a row more in a table read by its first cell is named", () => {
  const more = (number: number, name: string) =>
    withRow(number, name, (line) => `${line}\n| One more | https://example.com/ |`);
  for (const [number, name] of FIRST) expect(rowCount(number, name), name).toBe(1);
  expect(rowCount(3, "One more") + rowCount(4, "One more") + rowCount(5, "One more")).toBe(0);
  expect(definitionGaps(more(3, SUBJECT))).toEqual(["row count: section 3"]);
  expect(definitionGaps(more(4, KIND))).toEqual(["row count: section 4"]);
  expect(definitionGaps(more(5, OWN))).toEqual(["row count: own skills"]);
});

test("2026-11-16-005 AC-1: a server or a set of skills whose URL leaves its own row is named, also when the URL stands on another row", () => {
  for (const [, words, readAt] of SERVERS) {
    const gap = `server url: ${words}`;
    expect(serverOf(words)[2], words).toBe(readAt);
    const gone = withServer(words, (line) => line.replace(`| ${readAt} |`, "| |"));
    expect(definitionGaps(gone), words).toContain(gap);
    const moved = withServer(
      words,
      (line) => `${line.replace(`| ${readAt} |`, "| |")}\n| x | another row | ${readAt} | |`,
    );
    expect(definitionGaps(moved), `${words} moved`).toContain(gap);
  }
});

test("2026-11-16-005 AC-1: a server or a set of skills whose cell of the address holds more than the address is named", () => {
  for (const [, words, readAt] of SERVERS) {
    expect(serverOf(words)[2], words).toBe(readAt);
    const longer = withServer(words, (line) =>
      line.replace(`| ${readAt} |`, `| ${readAt} and more |`),
    );
    expect(definitionGaps(longer), words).toEqual([`server url: ${words}`]);
  }
});

test("2026-11-16-005 AC-1: a server or a set of skills whose words pick two rows is named", () => {
  for (const [, words] of SERVERS) {
    expect(serverOf(words)[1], words).toContain(words);
    expect(definitionGaps(withServer(words, twice)), words).toContain(`server url: ${words}`);
  }
});

test("2026-11-16-005 AC-1: a row that stands under another table's heading is named, with the two tables it changes", () => {
  const [to = "", anchor = ""] = SERVERS[0] ?? [];
  const [from = "", words = ""] = SERVERS.find(([table]) => table !== to) ?? [];
  const holders = (table: string) =>
    (tablesOf(text).get(table) ?? []).filter((cell) => cell[1]?.includes(words));
  expect(holders(from)).toHaveLength(1);
  expect(holders(to)).toHaveLength(0);
  let row = "";
  const taken = withServer(words, (line) => {
    row = line;
    return "";
  });
  expect(row).toContain(words);
  const moved = withServerOf(taken, anchor, (line) => `${line}\n${row}`);
  expect(definitionGaps(moved)).toEqual([
    `server url: ${words}`,
    `row count: ${to}`,
    `row count: ${from}`,
  ]);
});

test("2026-11-16-005 AC-1: a four-cell row the list does not name, with a URL or with none, or a row gone, is named", () => {
  const [table = "", last = ""] = SERVERS.at(-1) ?? [];
  expect(serverOf(last)[1]).toContain(last);
  expect(rows(section(text, 5)).filter((row) => row[0] === "Another")).toHaveLength(0);
  const after = (row: string) => withServer(last, (line) => `${line}\n${row}`);
  const count = [`row count: ${table}`, "server count"];
  const named = "| Another | Another server | https://example.com/ | `install` |";
  expect(definitionGaps(after(named))).toEqual(count);
  expect(definitionGaps(after("| Another | Another server | | `install` |"))).toEqual(count);
  const gone = definitionGaps(withServer(last, () => ""));
  expect(gone).toEqual(expect.arrayContaining([`server url: ${last}`, ...count]));
});

for (const clause of PIN_CLAUSES)
  test(`2026-11-16-005 AC-1: a row of section 5 whose second cell loses its "${clause}" is named`, () => {
    const pinned = PINS.filter(([name]) => name === clause);
    expect(pinned.length).toBeGreaterThan(0);
    for (const [, words, holds] of pinned) {
      expect(secondCellOf(words).split(holds), words).toHaveLength(2);
      expect(definitionGaps(withoutInSecond(words, holds)), words).toEqual([
        pinGap(clause, words, holds),
      ]);
    }
  });

test("2026-11-16-005 AC-1: a row left out whose second cell no longer opens with the words that leave it out is named", () => {
  const out = SERVERS.filter(([table]) => LEFT_OUT.includes(table));
  expect(out.length).toBeGreaterThan(0);
  for (const [, words] of out) {
    expect(secondCellOf(words), words).toStartWith(NOT_INSTALLED);
    const changed = withServer(words, (line) =>
      line.replace(`| ${NOT_INSTALLED}`, `| Held: ${NOT_INSTALLED}`),
    );
    expect(definitionGaps(changed), words).toEqual([`not installed: ${words}`]);
  }
});

test("2026-11-16-005 AC-1: a rule of section 5 whose line is not whole, in the definition or in the request, is named", () => {
  for (const [opens, line] of RULE_LINES) {
    const gap = `rule ${opens.trim()} line`;
    expect(ruleOf(text, opens), opens).toBe(line);
    const longer = text.replace(`\n${line}\n`, () => `\n${line} And more.\n`);
    expect(definitionGaps(longer), opens).toEqual([gap]);
    const asking = request.split("\n").filter((asks) => asks === line);
    expect(asking, opens).toHaveLength(1);
    const asked = request.replace(`\n${line}\n`, () => `\n${line} And more.\n`);
    expect(definitionGaps(text, asked), opens).toEqual([`request: ${gap}`]);
    const again = request.replace(`\n${line}\n`, () => `\n${line}\n${line}\n`);
    expect(definitionGaps(text, again), `${opens} twice`).toEqual([`request: ${gap}`]);
  }
});

test("2026-11-16-005 AC-1: a rule of section 5 that loses a whole sentence or the user's decision is named, and no other rule with it", () => {
  for (const [opens, words] of RULES) {
    const rule = ruleOf(text, opens);
    expect(rule.split(words), words).toHaveLength(2);
    const changed = text.replace(rule, () => rule.replaceAll(words, "other words"));
    const gaps = definitionGaps(changed);
    expect(gaps, words).toContain(`rule ${opens.trim()} ${words}`);
    expect(
      gaps.filter((gap) => !gap.startsWith(`rule ${opens.trim()} `)),
      words,
    ).toEqual([]);
  }
});

test("2026-11-16-005 AC-1: a rule more, or a rule whose number changes, is named", () => {
  const [last = ""] = RULE_SENTENCES.at(-1) ?? [];
  const rule = ruleOf(text, last);
  expect(rule).not.toBe("");
  const more = text.replace(rule, () => `${rule}\n${RULE_SENTENCES.length + 1}. One more rule.`);
  expect(definitionGaps(more)).toEqual(["rule count"]);
  for (const [opens] of RULE_SENTENCES) {
    const line = ruleOf(text, opens);
    expect(line, opens).toStartWith(opens);
    const renumbered = text.replace(line, () => `99. ${line.slice(opens.length)}`);
    const named = RULES.filter(([rule]) => rule === opens).map(
      ([rule, words]) => `rule ${rule.trim()} ${words}`,
    );
    expect(definitionGaps(renumbered), opens).toEqual([`rule ${opens.trim()} line`, ...named]);
  }
});

test("2026-11-16-005 AC-1: a section that loses its sentence, or holds it twice, is named", () => {
  expect(STATED.length).toBeGreaterThan(0);
  for (const [number, words] of STATED) {
    expect(section(text, number).split(words), words).toHaveLength(2);
    const picks = (line: string) => line.includes(words);
    const lost = withChangedLine(text, number, words, picks, (line) =>
      line.replace(words, "Other words"),
    );
    expect(definitionGaps(lost), words).toEqual([`sentence: ${words}`]);
    const again = withChangedLine(text, number, words, picks, (line) => `${line}\n\n${words}.`);
    expect(definitionGaps(again), `${words} twice`).toEqual([`sentence: ${words}`]);
  }
});

test("2026-11-16-005 AC-1: a row whose fourth cell loses the command or the switch it is installed with is named", () => {
  expect(COMMANDS.length).toBeGreaterThan(0);
  for (const [words, command] of COMMANDS) {
    expect(serverOf(words)[3]?.split(command), words).toHaveLength(2);
    expect(definitionGaps(withoutInCell(words, 3, command)), words).toEqual([
      commandGap(words, command),
    ]);
  }
});

test("2026-11-16-005 AC-1: a row of four cells whose fourth cell is empty is named", () => {
  for (const [, words] of SERVERS) {
    const [name = "", , , install = ""] = serverOf(words);
    expect(install, words).not.toBe("");
    const emptied = withServer(words, (line) => `${line.split(" | ").slice(0, 3).join(" | ")} | |`);
    const commands = COMMANDS.filter(([row]) => row === words).map(([row, command]) =>
      commandGap(row, command),
    );
    expect(definitionGaps(emptied), words).toEqual([...commands, `install cell: ${name}`]);
  }
});

test("2026-11-16-005 AC-1: a row of sources or of tools that loses a limit on what the team does is named", () => {
  for (const [number, name, words] of PHRASES) {
    const table = rows(section(text, number));
    expect(table.find((row) => row[0] === name)?.[1]?.split(words), name).toHaveLength(2);
    const changed = withRow(number, name, (line) => line.replaceAll(words, "other words"));
    const gaps = definitionGaps(changed);
    expect(gaps, `${name}: ${words}`).toContain(`limit: ${name}: ${words}`);
    expect(
      gaps.filter((gap) => !gap.startsWith(`limit: ${name}: `)),
      `${name}: ${words}`,
    ).toEqual([]);
  }
});

test("2026-11-16-005 AC-1: a page not read that loses its mark, or leaves the document, is named", () => {
  expect(text).not.toBe("");
  for (const url of NOT_OPENED) {
    const gap = `not opened: ${url}`;
    const marked = `${url}${NOT_OPENED_MARK}`;
    expect(text, url).toContain(marked);
    expect(definitionGaps(text.replace(marked, url)), url).toContain(gap);
    expect(definitionGaps(text.replaceAll(marked, "")), `${url} gone`).toContain(gap);
  }
});

test("2026-11-16-005 AC-1: a bare copy of a page not read is named while its first place keeps its mark", () => {
  for (const url of NOT_OPENED) {
    const marked = `${url}${NOT_OPENED_MARK}`;
    const first = text.indexOf(marked);
    expect(first, url).toBeGreaterThan(0);
    const changed = `${text}\nSee also ${url} for more.\n`;
    expect(changed.indexOf(marked), url).toBe(first);
    expect(definitionGaps(changed), url).toEqual([`not opened: ${url}`]);
  }
});

test("2026-11-16-005 AC-1: a page not read that is no longer listed in section 6, or is listed twice, is named", () => {
  for (const url of NOT_OPENED) {
    const listed = (line: string) => line.startsWith(`- ${url}${NOT_OPENED_MARK}`);
    expect(section(text, 6).split("\n").filter(listed), url).toHaveLength(1);
    const unlisted = withChangedLine(text, 6, url, listed, (line) => line.slice(2));
    expect(definitionGaps(unlisted), url).toEqual([`not listed: ${url}`]);
    const again = withChangedLine(text, 6, url, listed, twice);
    expect(definitionGaps(again), `${url} twice`).toEqual([`not listed: ${url}`]);
  }
});

test("2026-11-16-005 AC-1: one more page marked as not read, or the sentence that counts them gone or out of section 6, is named", () => {
  expect(text).not.toBe("");
  const more = `${text}\nAlso https://example.com/one-more${NOT_OPENED_MARK}.\n`;
  expect(definitionGaps(more)).toEqual(["not opened count"]);
  expect(section(text, 6)).toContain(NOT_OPENED_SENTENCE);
  const recounted = text.replace(NOT_OPENED_SENTENCE, "Some pages were not read:");
  expect(definitionGaps(recounted)).toEqual(["not opened sentence"]);
  const [first = ""] = HEADINGS;
  const elsewhere = recounted.replace(first, `${first}\n\n${NOT_OPENED_SENTENCE}`);
  expect(elsewhere).toContain(NOT_OPENED_SENTENCE);
  expect(definitionGaps(elsewhere)).toEqual(["not opened sentence"]);
});
