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
  "../../../docs/specs/2026-11-16-agentic-os-team-design.md",
  import.meta.url,
);
const REQUEST = new URL(
  "../../../docs/requests/2026-11-16-agentic-os-team-definition.md",
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
  "Agents and subagents",
  "Tools for agents",
  "Prompts",
  "Orchestration",
  "Evaluation",
  "Frameworks, SDKs, runtimes and models",
  "Skills",
  "Plugins and distribution",
  "MCP servers",
  "Memory",
  "Knowledge",
  "Learning and improvement",
  "Prompt injection and excessive agency",
  "Permissions and hooks",
  "Context and cost",
  "Unattended work",
  "Proactivity and responsiveness",
  "Keeping current",
  "The reference assistants' engineering",
];

const KINDS = [
  "Measurement",
  "Skills and plugins",
  "MCP",
  "Frameworks and SDKs",
  "Memory",
  "Knowledge",
  "Observability and improvement",
  "Proactivity, execution and current documentation",
];

const OWN_SKILLS = [
  "Agentic",
  "Routing and measurement",
  "Agents, tools and prompts",
  "Skills and plugins",
  "MCP servers",
  "Memory",
  "Knowledge",
  "Improvement loop",
  "Proactivity and unattended work",
  "Watch",
];

/** The tables of four cells of section 5, by the heading each stands under. */
const TABLES = [
  "Installed, in reading mode",
  "Held until the building item shows the reading",
  "In the project's own local or test environment",
  "Left out",
  "Outside skills",
];
/** The table of what is left out: the second cell of each of its rows opens with the words. */
const LEFT_OUT = "Left out";
const NOT_INSTALLED = "Not installed";

/** A row of section 5: its table, words of its second cell, the whole text of its "Read at" cell. */
const SERVERS: [string, string, string][] = [
  ["Installed, in reading mode", "Upstash's server, the", "https://github.com/upstash/context7"],
  [
    "Installed, in reading mode",
    "Google's own server",
    "https://developers.google.com/knowledge/mcp",
  ],
  [
    "Installed, in reading mode",
    "OpenAI's own server",
    "https://developers.openai.com/learn/docs-mcp",
  ],
  [
    "Installed, in reading mode",
    "LangChain's own two",
    "https://docs.langchain.com/use-these-docs.md",
  ],
  [
    "Installed, in reading mode",
    "Zep's own documentation",
    "https://help.getzep.com/docs-mcp-server.md",
  ],
  [
    "Installed, in reading mode",
    "W&B's server, \"The",
    "https://github.com/wandb/wandb-mcp-server",
  ],
  [
    "Installed, in reading mode",
    "LangChain's LangSmith Remote",
    "https://docs.langchain.com/langsmith/langsmith-remote-mcp.md",
  ],
  [
    "Installed, in reading mode",
    "Qdrant's server, \"An",
    "https://github.com/qdrant/mcp-server-qdrant",
  ],
  [
    "Installed, in reading mode",
    "Weaviate's server, inside",
    "https://docs.weaviate.io/weaviate/configuration/mcp-server.md",
  ],
  [
    "Installed, in reading mode",
    "Meilisearch's server, built",
    "https://www.meilisearch.com/docs/getting_started/integrations/mcp.md",
  ],
  [
    "Installed, in reading mode",
    "MongoDB's server, Apache-2.0",
    "https://github.com/mongodb-js/mongodb-mcp-server",
  ],
  [
    "Installed, in reading mode",
    "Supabase's server, Apache-2.0",
    "https://supabase.com/docs/guides/getting-started/mcp.md",
  ],
  ["Installed, in reading mode", "Laravel's server, MIT", "https://github.com/laravel/boost"],
  [
    "Held until the building item shows the reading",
    "Anthropic's two documentation",
    "https://platform.claude.com/docs/mcp",
  ],
  [
    "Held until the building item shows the reading",
    "Mastra's own documentation",
    "https://mastra.ai/reference/build-with-ai/llms.txt",
  ],
  [
    "Held until the building item shows the reading",
    "Langfuse's \"Langfuse Docs",
    "https://mcp.reference.langfuse.com",
  ],
  [
    "Held until the building item shows the reading",
    "The OpenSearch project's",
    "https://github.com/opensearch-project/opensearch-mcp-server-py",
  ],
  [
    "Held until the building item shows the reading",
    "Zep's Context MCP",
    "https://help.getzep.com/context-mcp-server.md",
  ],
  [
    "Held until the building item shows the reading",
    "Typesense's own server",
    "https://typesense.org/docs/guide/typesense-cloud/mcp-server.md",
  ],
  [
    "In the project's own local or test environment",
    "The Model Context",
    "https://github.com/modelcontextprotocol/inspector",
  ],
  [
    "In the project's own local or test environment",
    "Langfuse's server, inside",
    "https://langfuse.com/docs/api-and-data-platform/features/mcp-server.md",
  ],
  [
    "In the project's own local or test environment",
    "Comet's server, Apache-2.0",
    "https://github.com/comet-ml/opik-mcp",
  ],
  [
    "In the project's own local or test environment",
    "Arize's server, built",
    "https://arize.com/docs/phoenix/integrations/mcp.md",
  ],
  [
    "In the project's own local or test environment",
    "promptfoo's server, MIT",
    "https://github.com/promptfoo/promptfoo",
  ],
  [
    "In the project's own local or test environment",
    "Zep's server for",
    "https://github.com/getzep/graphiti",
  ],
  [
    "In the project's own local or test environment",
    "Cognee's server, by",
    "https://github.com/topoteretes/cognee",
  ],
  [
    "In the project's own local or test environment",
    "Vectorize's server, MIT",
    "https://github.com/vectorize-io/hindsight",
  ],
  [
    "In the project's own local or test environment",
    "Chroma's server, Apache-2.0",
    "https://github.com/chroma-core/chroma-mcp",
  ],
  [
    "In the project's own local or test environment",
    "Zilliz's server for",
    "https://github.com/zilliztech/mcp-server-milvus",
  ],
  [
    "In the project's own local or test environment",
    "Redis's server, \"The",
    "https://github.com/redis/mcp-redis",
  ],
  [
    "In the project's own local or test environment",
    "Elastic's Agent Builder",
    "https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/mcp-server.md",
  ],
  ["Left out", "Not installed, under rule 1", "https://github.com/crystaldba/postgres-mcp"],
  ["Left out", "Not installed: the", "https://github.com/langchain-ai/langsmith-mcp-server"],
  ["Left out", "Not installed: `mem0ai/mem0-mcp`", "https://github.com/mem0ai/mem0-mcp"],
  ["Left out", "Not installed: Mem0's", "https://github.com/mem0ai/mem0"],
  [
    "Left out",
    "Not installed: `@arizeai/phoenix-mcp`",
    "https://github.com/Arize-ai/phoenix/commit/747b518d1231fc5a8547028025dc3b0b08f1ce5a",
  ],
  [
    "Left out",
    "Not installed: `weaviate/mcp-server-weaviate`",
    "https://github.com/weaviate/mcp-server-weaviate",
  ],
  [
    "Left out",
    "Not installed: `meilisearch/meilisearch-mcp`",
    "https://github.com/meilisearch/meilisearch-mcp",
  ],
  [
    "Left out",
    "Not installed: `elastic/mcp-server-elasticsearch`",
    "https://github.com/elastic/mcp-server-elasticsearch",
  ],
  [
    "Left out",
    "Not installed: `supermemoryai/supermemory-mcp`",
    "https://github.com/supermemoryai/supermemory-mcp",
  ],
  [
    "Left out",
    "Not installed: `langfuse/mcp-server-langfuse`",
    "https://github.com/langfuse/mcp-server-langfuse",
  ],
  ["Left out", "Not installed: LanceDB's", "https://github.com/lancedb/lancedb-mcp-server"],
  [
    "Left out",
    "Not installed, under rules 3 and 4: Mem0's",
    "https://docs.mem0.ai/platform/mem0-mcp.md",
  ],
  [
    "Left out",
    "Not installed, under rules 3 and 4: Braintrust's",
    "https://braintrust.dev/docs/integrations/developer-tools/mcp.md",
  ],
  [
    "Left out",
    "Not installed, under rules 3 and 4: Supermemory's",
    "https://supermemory.ai/docs/supermemory-mcp/mcp.md",
  ],
  [
    "Left out",
    "Not installed, under rules 3 and 4: Pinecone's",
    "https://github.com/pinecone-io/pinecone-mcp",
  ],
  [
    "Left out",
    "Not installed, under rules 3 and 4: Helicone's",
    "https://docs.helicone.ai/integrations/tools/mcp.md",
  ],
  ["Left out", "Not installed: Vercel's", "https://vercel.com/docs/agent-resources/vercel-mcp.md"],
  ["Left out", "Not installed: no", "https://github.com/letta-ai/letta"],
  ["Left out", "Not installed as a server: `laravel/mcp`", "https://github.com/laravel/mcp"],
  [
    "Left out",
    "Not installed as a server: `vercel-labs/mcp-handler`",
    "https://github.com/vercel-labs/mcp-handler",
  ],
  [
    "Outside skills",
    "Anthropic's skill-creator, Apache-2.0",
    "https://github.com/anthropics/claude-plugins-official",
  ],
  ["Outside skills", "Anthropic's claude-api, Apache-2.0", "https://github.com/anthropics/skills"],
  [
    "Outside skills",
    "Anthropic's plugin-dev, version",
    "https://github.com/anthropics/claude-plugins-official",
  ],
  [
    "Outside skills",
    "Anthropic's mcp-server-dev, Apache-2.0",
    "https://github.com/anthropics/claude-plugins-official",
  ],
  [
    "Outside skills",
    "Anthropic's agent-sdk-dev, version",
    "https://github.com/anthropics/claude-plugins-official",
  ],
  ["Outside skills", "Langfuse's skills, in", "https://github.com/langfuse/skills"],
  ["Outside skills", "Arize's skills for", "https://github.com/Arize-ai/arize-skills"],
  ["Outside skills", "Phoenix's skills, in", "https://github.com/Arize-ai/phoenix"],
  [
    "Outside skills",
    "Braintrust's skills, in",
    "https://github.com/braintrustdata/braintrust-skills",
  ],
  ["Outside skills", "Comet's skills for", "https://github.com/comet-ml/opik-skills"],
  ["Outside skills", "W&B's skills, in", "https://github.com/wandb/skills"],
  ["Outside skills", "Pydantic's skills for", "https://github.com/pydantic/skills"],
  [
    "Outside skills",
    "LangChain's skills for LangSmith",
    "https://github.com/langchain-ai/langsmith-skills",
  ],
  [
    "Outside skills",
    "LangChain's skills for LangChain",
    "https://github.com/langchain-ai/langchain-skills",
  ],
  ["Outside skills", "promptfoo's plugin, in", "https://github.com/promptfoo/promptfoo"],
  ["Outside skills", "Vercel's skills for", "https://github.com/vercel/ai"],
  ["Outside skills", "Mastra's skills, in", "https://github.com/mastra-ai/skills"],
  ["Outside skills", "OpenAI's skills, in", "https://github.com/openai/skills"],
  ["Outside skills", "Google's skills for", "https://github.com/google-gemini/gemini-skills"],
  ["Outside skills", "Google's skills, in", "https://github.com/google/skills"],
  ["Outside skills", "Laravel's two skills", "https://github.com/laravel/boost"],
  ["Outside skills", "Qdrant's skills, in", "https://github.com/qdrant/skills"],
  ["Outside skills", "Weaviate's skills, in", "https://github.com/weaviate/agent-skills"],
  ["Outside skills", "Pinecone's skills, in", "https://github.com/pinecone-io/skills"],
  ["Outside skills", "Supabase's skills, in", "https://github.com/supabase/agent-skills"],
  ["Outside skills", "MongoDB's skills, in", "https://github.com/mongodb/agent-skills"],
  ["Outside skills", "Mem0's skills, in", "https://github.com/mem0ai/mem0"],
  ["Outside skills", "Zep's skills, in", "https://github.com/getzep/building-with-zep-plugin"],
  [
    "Outside skills",
    "Meridian Labs' inspect-skills",
    "https://github.com/meridianlabs-ai/inspect-skills",
  ],
];

/** What a row's second cell holds, by the clause that names its loss. */
const PIN_CLAUSES = [
  "reading mode",
  "not until",
  "local or test",
  "condition",
  "acting",
  "owed",
  "out",
  "caution",
];
/**
 * The kind of each table, pinned on its rows: the clause, the row's words, what its second cell
 * holds. A reading mode is how the row reads alone; "not until" holds a server back; "local or
 * test" keeps it off the client's real data; a set of skills has the condition it enters by, what
 * is still owed before it enters, where a skill of it acts on an account the words that say so, and
 * what of the set stays out; a caution is what a row says the agent never does with the server.
 */
const PINS: [string, string, string][] = [
  ["reading mode", "Upstash's server, the", "It reads alone, with nothing to switch"],
  ["reading mode", "Google's own server", "Its three tools all read"],
  ["reading mode", "OpenAI's own server", "Read-only by the page's own words"],
  ["reading mode", "LangChain's own two", "is not read-only: it sends a report"],
  [
    "reading mode",
    "Zep's own documentation",
    "documentation search, and whole-page reads as MCP resources",
  ],
  [
    "reading mode",
    "W&B's server, \"The",
    "Set `WANDB_MCP_ACCESS_MODE=read-only` to omit every tool classified as a write",
  ],
  ["reading mode", "LangChain's LangSmith Remote", "It has no write tool"],
  ["reading mode", "Qdrant's server, \"An", "Read-only with `QDRANT_READ_ONLY=true`"],
  ["reading mode", "Weaviate's server, inside", "Self-hosted, it reads by default"],
  ["reading mode", "Meilisearch's server, built", "It has nothing to write with"],
  [
    "reading mode",
    "MongoDB's server, Apache-2.0",
    "Read-only with `--readOnly` or `MDB_MCP_READ_ONLY`",
  ],
  [
    "reading mode",
    "Supabase's server, Apache-2.0",
    "Reading alone is by three parameters of the address",
  ],
  [
    "reading mode",
    "Laravel's server, MIT",
    "It reads by default by its source and not by its documentation",
  ],
  ["not until", "Anthropic's two documentation", "not installed until the building item shows"],
  ["not until", "Mastra's own documentation", "not installed until the building item shows"],
  ["not until", "Langfuse's \"Langfuse Docs", "not installed until the building item shows"],
  ["not until", "The OpenSearch project's", "not installed until the building item shows"],
  ["not until", "Zep's Context MCP", "not installed until the building item shows"],
  ["not until", "Typesense's own server", "not installed until the building item shows"],
  ["not until", "Elastic's Agent Builder", "not installed until the building item shows"],
  ["local or test", "W&B's server, \"The", "in the local or test environment only"],
  ["local or test", "Qdrant's server, \"An", "in the local or test environment only"],
  ["local or test", "Weaviate's server, inside", "in the local or test environment only"],
  ["local or test", "MongoDB's server, Apache-2.0", "in the local or test environment only"],
  ["local or test", "Supabase's server, Apache-2.0", "in the local or test environment only"],
  ["local or test", "The OpenSearch project's", "in the local or test environment only"],
  ["local or test", "The Model Context", "in the local or test environment only"],
  ["local or test", "Langfuse's server, inside", "in the local or test environment only"],
  ["local or test", "Comet's server, Apache-2.0", "in the local or test environment only"],
  ["local or test", "Arize's server, built", "in the local or test environment only"],
  ["local or test", "promptfoo's server, MIT", "in the local or test environment only"],
  ["local or test", "Zep's server for", "in the local or test environment only"],
  ["local or test", "Cognee's server, by", "in the local or test environment only"],
  ["local or test", "Vectorize's server, MIT", "in the local or test environment only"],
  ["local or test", "Chroma's server, Apache-2.0", "in the local or test environment only"],
  ["local or test", "Zilliz's server for", "in the local or test environment only"],
  ["local or test", "Redis's server, \"The", "in the local or test environment only"],
  ["local or test", "Elastic's Agent Builder", "in the local or test environment only"],
  ["condition", "Anthropic's skill-creator, Apache-2.0", "installed always under rule 7"],
  ["condition", "Anthropic's claude-api, Apache-2.0", "installed always under rule 7"],
  ["condition", "Anthropic's plugin-dev, version", "installed always under rule 7"],
  ["condition", "Anthropic's mcp-server-dev, Apache-2.0", "installed always under rule 7"],
  ["condition", "Anthropic's agent-sdk-dev, version", "installed always under rule 7"],
  ["condition", "Langfuse's skills, in", "only where the project uses Langfuse"],
  ["condition", "Arize's skills for", "only where the project already uses Arize AX"],
  ["condition", "Phoenix's skills, in", "only where the project already uses Phoenix"],
  ["condition", "Braintrust's skills, in", "only where the project already uses Braintrust"],
  ["condition", "Comet's skills for", "only where the project uses Opik"],
  ["condition", "W&B's skills, in", "only where the project uses W&B or Weave"],
  ["condition", "Pydantic's skills for", "only where the project uses Logfire or Pydantic AI"],
  ["condition", "LangChain's skills for LangSmith", "only where the project uses LangSmith"],
  ["condition", "LangChain's skills for LangChain", "only where the project uses one of the three"],
  ["condition", "promptfoo's plugin, in", "only where the project uses promptfoo"],
  ["condition", "Vercel's skills for", "only where the project uses the AI SDK"],
  ["condition", "Mastra's skills, in", "only where the project uses Mastra"],
  ["condition", "OpenAI's skills, in", "only where the project uses the OpenAI API"],
  ["condition", "Google's skills for", "only where the project uses the Gemini API"],
  [
    "condition",
    "Google's skills, in",
    "only where the project uses Google Cloud's Agent Platform or Gemini on it",
  ],
  ["condition", "Laravel's two skills", "only on a Laravel application with Boost"],
  ["condition", "Qdrant's skills, in", "only where the project uses Qdrant"],
  ["condition", "Weaviate's skills, in", "only where the project uses Weaviate"],
  ["condition", "Pinecone's skills, in", "only where the project uses Pinecone"],
  ["condition", "Supabase's skills, in", "only where the project uses Supabase"],
  ["condition", "MongoDB's skills, in", "only where the project uses MongoDB"],
  ["condition", "Mem0's skills, in", "only where the project uses Mem0"],
  ["condition", "Zep's skills, in", "only where the project uses Zep"],
  ["condition", "Meridian Labs' inspect-skills", "only where the project uses Inspect"],
  ["acting", "Langfuse's skills, in", "entering with the set under rule 6"],
  ["acting", "Arize's skills for", "entering with the set under rule 6"],
  ["acting", "Phoenix's skills, in", "entering with the set under rule 6"],
  ["acting", "Braintrust's skills, in", "entering with the set under rule 6"],
  ["acting", "Comet's skills for", "entering with the set under rule 6"],
  ["acting", "W&B's skills, in", "entering with the set under rule 6"],
  ["acting", "Pydantic's skills for", "entering with the set under rule 6"],
  ["acting", "LangChain's skills for LangSmith", "entering with the set under rule 6"],
  ["acting", "Mastra's skills, in", "entering with the set under rule 6"],
  ["acting", "Google's skills for", "entering with the set under rule 6"],
  ["acting", "Google's skills, in", "entering with the set under rule 6"],
  ["acting", "Weaviate's skills, in", "entering with the set under rule 6"],
  ["acting", "Pinecone's skills, in", "entering with the set under rule 6"],
  ["acting", "Supabase's skills, in", "entering with the set under rule 6"],
  ["acting", "MongoDB's skills, in", "entering with the set under rule 6"],
  ["acting", "Mem0's skills, in", "entering with the set under rule 6"],
  ["acting", "Zep's skills, in", "entering with the set under rule 6"],
  ["acting", "Meridian Labs' inspect-skills", "entering with the set under rule 6"],
  ["owed", "Anthropic's skill-creator, Apache-2.0", "Still owed"],
  ["owed", "Anthropic's claude-api, Apache-2.0", "Still owed"],
  ["owed", "Anthropic's plugin-dev, version", "Still owed"],
  ["owed", "Anthropic's mcp-server-dev, Apache-2.0", "Still owed"],
  ["owed", "Anthropic's agent-sdk-dev, version", "Still owed"],
  ["owed", "Langfuse's skills, in", "Still owed"],
  ["owed", "Arize's skills for", "Still owed"],
  ["owed", "Phoenix's skills, in", "Still owed"],
  ["owed", "Braintrust's skills, in", "Still owed"],
  ["owed", "Comet's skills for", "Still owed"],
  ["owed", "W&B's skills, in", "Still owed"],
  ["owed", "Pydantic's skills for", "Still owed"],
  ["owed", "LangChain's skills for LangSmith", "Still owed"],
  ["owed", "LangChain's skills for LangChain", "Still owed"],
  ["owed", "promptfoo's plugin, in", "Still owed"],
  ["owed", "Vercel's skills for", "Still owed"],
  ["owed", "Mastra's skills, in", "Still owed"],
  ["owed", "OpenAI's skills, in", "Still owed"],
  ["owed", "Google's skills for", "Still owed"],
  ["owed", "Google's skills, in", "Still owed"],
  ["owed", "Laravel's two skills", "Still owed"],
  ["owed", "Qdrant's skills, in", "Still owed"],
  ["owed", "Weaviate's skills, in", "Still owed"],
  ["owed", "Pinecone's skills, in", "Still owed"],
  ["owed", "Supabase's skills, in", "Still owed"],
  ["owed", "MongoDB's skills, in", "Still owed"],
  ["owed", "Mem0's skills, in", "Still owed"],
  ["owed", "Zep's skills, in", "Still owed"],
  ["owed", "Meridian Labs' inspect-skills", "Still owed"],
  ["out", "Arize's skills for", "`mcp_config.json`"],
  ["out", "Phoenix's skills, in", "the Claude plugin's `.mcp.json`"],
  ["out", "Braintrust's skills, in", "`install.sh`"],
  ["out", "Comet's skills for", "`uvx opik mcp configure`"],
  ["out", "W&B's skills, in", "`install.sh`"],
  ["out", "Pydantic's skills for", "`plugins/logfire-exporter` whole"],
  ["out", "LangChain's skills for LangSmith", "`install.sh`"],
  ["out", "LangChain's skills for LangChain", "`install.sh` and `install.ps1`"],
  ["out", "Vercel's skills for", "Left out: the ten maintenance skills of the repository"],
  ["out", "OpenAI's skills, in", "the rest of the catalogue"],
  ["out", "Google's skills, in", "`developers/finding-google-skills`"],
  ["out", "Laravel's two skills", "`deploying-to-cloud`"],
  ["out", "Qdrant's skills, in", "`meta/qdrant-advisor`"],
  ["out", "Pinecone's skills, in", "`pinecone-mcp` and `pinecone-query`"],
  ["out", "MongoDB's skills, in", "both plugins"],
  ["out", "Mem0's skills, in", "the Claude Code plugin whole"],
  ["out", "Zep's skills, in", "`getzep/zep-context-plugin`"],
  ["out", "Meridian Labs' inspect-skills", "Left out: `.mcp.json`"],
  ["caution", "LangChain's own two", "use it only with the user's agreement"],
  ["caution", "Typesense's own server", "no path hands the agent a key's value"],
  ["caution", "Comet's server, Apache-2.0", "prints the `env` block, API key included"],
  ["caution", "Comet's server, Apache-2.0", "It is installed with telemetry off"],
  ["caution", "promptfoo's server, MIT", "the tool `share_evaluation` is never called"],
  [
    "caution",
    "Zep's server for",
    "no authentication, no authorization, and no prompt-injection protection",
  ],
  ["caution", "Zep's server for", "it is installed with telemetry off"],
];

/** The command or the switch a row is installed with: the row's words, what its fourth cell holds. */
const COMMANDS: [string, string][] = [
  ["W&B's server, \"The", "WANDB_MCP_ACCESS_MODE=read-only"],
  ["Qdrant's server, \"An", "QDRANT_READ_ONLY=true"],
  ["Weaviate's server, inside", "`MCP_SERVER_WRITE_ACCESS_ENABLED` left unset"],
  ["MongoDB's server, Apache-2.0", "--readOnly"],
  ["Supabase's server, Apache-2.0", "read_only=true"],
  ["Supabase's server, Apache-2.0", "features=database,docs"],
  ["Laravel's server, MIT", "boost.mcp.tools.exclude"],
  ["Langfuse's server, inside", "http://localhost:3000/api/public/mcp"],
  ["Comet's server, Apache-2.0", "OPIK_URL=http://localhost:5173/api"],
  ["Arize's server, built", "phoenix http://localhost:6006/mcp --header"],
  ["promptfoo's server, MIT", "--transport stdio"],
  ["Zep's server for", "http://localhost:8000/mcp/"],
  ["Cognee's server, by", "http://localhost:8000/mcp"],
  ["Vectorize's server, MIT", "http://localhost:8888/mcp"],
  ["Zilliz's server for", "--milvus-uri http://localhost:19530"],
  ["Redis's server, \"The", "redis://localhost:6379/0"],
];

/** A sentence a section holds once: the section and the words. */
const STATED: [number, string][] = [
  [1, 'The team never says "accuracy" without those four things'],
  [
    1,
    "Per project: a set of the client's real cases; a closed set of tools and flows; the assistant choosing the right tool or flow in more than 90% of the cases; and each case run several times and counted right only if right every time.",
  ],
  [1, "The task's final outcome is measured apart."],
  [
    1,
    "So \"above 90%\" is said of a set of the client's real cases, a closed set of tools and flows, the first decision counted apart from the task's outcome, and each case run several times and counted right only if right every time.",
  ],
];

/** The twelve rules of section 5, each whole line, which the request holds whole too. */
const RULE_LINES: [string, string][] = [
  [
    "1. ",
    "1. The other teams' rule: only an MCP server or skills made by a tool's own team. A tool with no server of its own runs from the command line. Postgres MCP Pro is left out by this rule: it is Crystal DBA's and not the PostgreSQL project's.",
  ],
  [
    "2. ",
    "2. What the team builds into the client's product is not limited by the rules on servers: memory, vector stores, observability and the product's own MCP servers and skills are components of the product, chosen in section 4, under the product's own access control. The user confirmed the split on 2026-11-16.",
  ],
  [
    "3. ",
    "3. What the crew's agent connects to while it works follows the standing rule of the other definitions: a server that writes or acts enters only with a reading mode and is installed with it, a server that can return a secret's value to the model is left out, and a server admitted whose reading alone the readings did not confirm is not installed until the building item shows that it only reads. The documentation servers and the MCP Inspector enter by the same rule. The server of a tool of section 4 enters only where the project uses the tool: Weights & Biases', LangSmith's, Qdrant's, Weaviate's, Meilisearch's, MongoDB's, Supabase's and Laravel Boost's. Held until the building item shows the reading: the two Claude documentation servers, Mastra's and Langfuse's documentation servers, OpenSearch's, Zep's Context server and Typesense Cloud's.",
  ],
  [
    "4. ",
    "4. For this team alone, the user's answer of 2026-11-16 being \"Sim, mas B mais aberto\": in the project's own local or test environment the agent may also connect to the servers of the components it is building (memory, vector store, observability and evaluation), even where they write, because testing the write is part of the work, and never against the client's real data. Evaluation counts as a component the team builds by the user's decision of 2026-11-16 on promptfoo's server, \"Entra em local\", which was not the option recommended. By this opening, each only where the project uses the tool: Langfuse's, Opik's, Phoenix's, promptfoo's, Graphiti's, Cognee's, Hindsight's, Chroma's, Milvus's, Redis's and the Elastic Agent Builder endpoint, with the MCP Inspector pointed at the server under test. Chroma's server is stalled, with no change since 2025-09-17, and stays only where the project already uses Chroma, never proposed on a new project: the user's decision of 2026-11-16, \"Só onde já se usa\", the rule already given for stopped tools. A server that writes with no reading mode on its page, and that no page read shows how to point at a local or self-hosted instance, is left out: Mem0's, Braintrust's, Supermemory's, Pinecone's, Helicone's and Vercel's.",
  ],
  [
    "5. ",
    "5. promptfoo's skills enter only where the project uses promptfoo, and its server enters there under rule 4, in the local or test environment, as on the QA team's and the architects' definitions (section 5 of each), the user's choice and not the option recommended; the security team's definition leaves the server out. The team never runs a command with `--remote` nor calls `share_evaluation`: nothing of the client leaves for Promptfoo's service. Red team runs stay the security team's.",
  ],
  [
    "6. ",
    "6. Outside skills follow the rule of the DevOps team's definition (`docs/specs/2026-11-15-devops-team-design.md`, section 5, rule 5), the option recommended: each set only where the project already uses the tool, the skills alone, with no hook that approves by itself and no server that acts on an account. A set with no licence is left out: `vercel-labs/agent-skills` and `laravel/agent-skills`. A skill inside an admitted set that acts on an account (it deploys, writes, deletes, creates a rule or a key, or spends) enters with its set, and its row names it as acting; when one of them is used, the rule applies that a deploy to production, and any command that deletes or changes a real resource, is a person's decision. What stays out of a set: its hooks, the servers that act on an account, the vendor's install scripts, and a skill that loads its instructions at run time and so cannot be read before it enters, by rule 10: `qdrant-advisor` and Google's `finding-google-skills`. Where this rule departs from the rule it cites: skills that publish or approve stay out, as there, and the kinds of acting are wider here than there, a skill that writes, deletes or creates a rule or a key entering too, by the user's choice of that rule on 2026-11-16.",
  ],
  [
    "7. ",
    "7. Anthropic's five sets enter whole, always, being the team's trade: skill-creator, claude-api, plugin-dev, mcp-server-dev and agent-sdk-dev. Publishing a server (`wrangler deploy`) or creating a managed agent on an account is a deploy, a person's decision, never the agent's, and skill-creator's evals run with a cost bound said first.",
  ],
  [
    "8. ",
    "8. A documentation-only server that comes inside a set of skills enters only where the reading of 2026-11-16 confirmed it on its own page as reading documentation alone: LangChain's and Zep's documentation servers. The others are held until the building item shows them: the documentation server of Supabase's plugin and the server of Google's `google-cloud-developer` plugin.",
  ],
  [
    "9. ",
    "9. Phoenix's skills enter where the project already uses Phoenix, the user's choice and not the option recommended, which held them: they enter by the licence each skill declares, Apache-2.0, the repository being under the Elastic License 2.0 with no Apache file.",
  ],
  [
    "10. ",
    "10. No set enters unread, a condition of the building item: the reading of 2026-11-16 read no SKILL.md body and no script from top to bottom, so each set is read whole, scripts included, at the commit that is installed, before it enters a solution.",
  ],
  [
    "11. ",
    "11. What the system learns enters use with provenance, version and a person's approval, and no agent rewrites its own instructions without that.",
  ],
  [
    "12. ",
    "12. The team's own skills, ten, defined here and written in a later item: agentic (the nineteen subjects as references; the entry); routing and measurement (the right decision, repeated, and the task's outcome measured apart); agents, tools and prompts (one purpose, tools named, results shaped for the model, instructions apart from data); skills and plugins (the format, a description that triggers, progressive loading, the manifest, the marketplace and the pin); MCP servers (build, expose, confine, test locally); memory (what is kept, where, how it is corrected and forgotten); knowledge (ingestion, retrieval, access control at retrieval time, evaluation); improvement loop (traces, error analysis, the eval suite, what enters use and by whose approval); proactivity and unattended work (triggers, bounds, a silent outcome, approval of what cannot be undone); watch (what to read, how often, and how a novelty becomes a rule through the ledger). The words in brackets after the eight skills between the entry and watch are this document's reading of their names: the user's decision gives a content for agentic and for watch alone.",
  ],
];
/** The twelve rules of section 5: how the rule's line opens and a whole sentence of it. */
const RULE_SENTENCES: [string, string][] = [
  [
    "1. ",
    "Postgres MCP Pro is left out by this rule: it is Crystal DBA's and not the PostgreSQL project's.",
  ],
  [
    "2. ",
    "What the team builds into the client's product is not limited by the rules on servers: memory, vector stores, observability and the product's own MCP servers and skills are components of the product, chosen in section 4, under the product's own access control.",
  ],
  ["3. ", "The documentation servers and the MCP Inspector enter by the same rule."],
  [
    "4. ",
    "A server that writes with no reading mode on its page, and that no page read shows how to point at a local or self-hosted instance, is left out: Mem0's, Braintrust's, Supermemory's, Pinecone's, Helicone's and Vercel's.",
  ],
  ["5. ", "Red team runs stay the security team's."],
  [
    "6. ",
    "A set with no licence is left out: `vercel-labs/agent-skills` and `laravel/agent-skills`.",
  ],
  [
    "7. ",
    "Publishing a server (`wrangler deploy`) or creating a managed agent on an account is a deploy, a person's decision, never the agent's, and skill-creator's evals run with a cost bound said first.",
  ],
  [
    "8. ",
    "The others are held until the building item shows them: the documentation server of Supabase's plugin and the server of Google's `google-cloud-developer` plugin.",
  ],
  [
    "9. ",
    "Phoenix's skills enter where the project already uses Phoenix, the user's choice and not the option recommended, which held them: they enter by the licence each skill declares, Apache-2.0, the repository being under the Elastic License 2.0 with no Apache file.",
  ],
  [
    "10. ",
    "No set enters unread, a condition of the building item: the reading of 2026-11-16 read no SKILL.md body and no script from top to bottom, so each set is read whole, scripts included, at the commit that is installed, before it enters a solution.",
  ],
  [
    "11. ",
    "What the system learns enters use with provenance, version and a person's approval, and no agent rewrites its own instructions without that.",
  ],
  [
    "12. ",
    "The team's own skills, ten, defined here and written in a later item: agentic (the nineteen subjects as references; the entry); routing and measurement (the right decision, repeated, and the task's outcome measured apart); agents, tools and prompts (one purpose, tools named, results shaped for the model, instructions apart from data); skills and plugins (the format, a description that triggers, progressive loading, the manifest, the marketplace and the pin); MCP servers (build, expose, confine, test locally); memory (what is kept, where, how it is corrected and forgotten); knowledge (ingestion, retrieval, access control at retrieval time, evaluation); improvement loop (traces, error analysis, the eval suite, what enters use and by whose approval); proactivity and unattended work (triggers, bounds, a silent outcome, approval of what cannot be undone); watch (what to read, how often, and how a novelty becomes a rule through the ledger). The words in brackets after the eight skills between the entry and watch are this document's reading of their names: the user's decision gives a content for agentic and for watch alone.",
  ],
];
/** The user's further decisions on the rules: how the rule's line opens, what it holds. */
const RULE_PHRASES: [string, string][] = [
  ["3. ", "a server that writes or acts enters only with a reading mode and is installed with it"],
  ["3. ", "is not installed until the building item shows that it only reads"],
  [
    "4. ",
    "even where they write, because testing the write is part of the work, and never against the client's real data",
  ],
  ["4. ", "stays only where the project already uses Chroma, never proposed on a new project"],
  ["4. ", "which was not the option recommended"],
  ["5. ", "its server enters there under rule 4, in the local or test environment"],
  ["6. ", "skills that publish or approve stay out, as there"],
  ["5. ", "never runs a command with `--remote` nor calls `share_evaluation`"],
  [
    "6. ",
    "the skills alone, with no hook that approves by itself and no server that acts on an account",
  ],
  ["6. ", "enters with its set, and its row names it as acting"],
  [
    "6. ",
    "a deploy to production, and any command that deletes or changes a real resource, is a person's decision",
  ],
  ["6. ", "a skill that loads its instructions at run time and so cannot be read before it enters"],
  ["7. ", "Anthropic's five sets enter whole, always, being the team's trade"],
  ["8. ", "LangChain's and Zep's documentation servers"],
];
const RULES = [...RULE_SENTENCES, ...RULE_PHRASES];

/** The words a row of section 3 or 4 holds, which limit what the team does: section, row, words. */
const PHRASES: [number, string, string][] = [
  [3, "Evaluation", "counted right only if right every time"],
  [3, "Evaluation", "the task's final outcome is measured apart"],
  [3, "Evaluation", "a closed set of tools and flows"],
  [3, "Frameworks, SDKs, runtimes and models", "always first what the project's framework brings"],
  [3, "Orchestration", "the simplest that does the work"],
  [3, "Evaluation", "client's real cases"],
  [3, "Evaluation", "more than 90%"],
  [
    3,
    "Skills",
    '"This library is intended for demonstration purposes only. It is not meant to be used in production."',
  ],
  [3, "Skills", "Read them before enabling."],
  [3, "Plugins and distribution", "places to watch and not install sources"],
  [3, "Plugins and distribution", "the three readings state no sha256 pin"],
  [3, "MCP servers", "a beta and not a final list"],
  [3, "MCP servers", "so the team cites MCP06 by its number"],
  [3, "MCP servers", "a place to watch and not an install source"],
  [3, "Memory", "a legal question for the client's data protection officer"],
  [3, "Memory", "Articles 5(1)(e), 5(2) and 17"],
  [3, "Knowledge", "figures as Anthropic's own"],
  [3, "Knowledge", "no benchmark for European Portuguese being found"],
  [3, "Learning and improvement", "figures as the authors' own, on their benchmarks"],
  [3, "Learning and improvement", "no new fine-tuning job can be created from 2027-01-06"],
  [3, "Keeping current", "only through the sources ledger"],
  [
    3,
    "The reference assistants' engineering",
    "Studied for their engineering, never installed, never a measure of precision",
  ],
  [3, "The reference assistants' engineering", "read to learn and not copied"],
  [4, "Measurement", "each case run several times, with a cost bound said first"],
  [4, "Measurement", "never with `--remote` nor `share_evaluation`"],
  [4, "Measurement", "red team stays the security team's"],
  [4, "Skills and plugins", "to list and pin only, never to install from a public registry unread"],
  [
    4,
    "Skills and plugins",
    "A third-party skill is read whole, scripts included, before it enters a solution",
  ],
  [4, "Skills and plugins", "This library is intended for demonstration purposes only"],
  [4, "Skills and plugins", "once what each does and sends is read"],
  [4, "MCP", "Built and tested in the project's own local or test environment"],
  [4, "MCP", "never a server that acts on a real account to try it"],
  [4, "Frameworks and SDKs", "First-party first"],
  [4, "Frameworks and SDKs", "only by the case measured or estimated in writing"],
  [4, "Frameworks and SDKs", "not an open-source licence, only where the project already uses it"],
  [4, "Memory", "with no preference for file memory"],
  [4, "Memory", "the user's choice and not the option recommended, which put file memory first"],
  [4, "Memory", "the measured case decides between candidates"],
  [
    4,
    "Knowledge",
    "the user's choice and not the option recommended, which put the project's database first",
  ],
  [4, "Knowledge", "the measured case decides between candidates"],
  [4, "Observability and improvement", "message content out of traces by default"],
  [4, "Observability and improvement", "the GenAI conventions' version pinned"],
  [4, "Observability and improvement", "only against the project's eval suite"],
  [
    4,
    "Observability and improvement",
    "enters use with provenance, version and a person's approval",
  ],
  [4, "Observability and improvement", "no agent rewrites its own instructions without that"],
  [
    4,
    "Observability and improvement",
    "Fine-tuning is out, save the user's decision on a concrete case",
  ],
  [4, "Observability and improvement", "enter only where already used"],
  [
    4,
    "Proactivity, execution and current documentation",
    "with a rate limit, active hours and a silent outcome",
  ],
  [
    4,
    "Proactivity, execution and current documentation",
    "What sends, buys, deletes or publishes goes through a person's approval",
  ],
  [
    4,
    "Proactivity, execution and current documentation",
    "A durable engine only by the measured case",
  ],
  [4, "Proactivity, execution and current documentation", "Current documentation, read-only"],
];

const NOT_OPENED_SENTENCE =
  'Nineteen addresses in this document are marked "(not opened)", each wherever it stands; what was not read and has no address here is in the list above:';
/** The pages that were not read on 2026-11-16, each listed in section 6. */
const NOT_OPENED = [
  "https://atlas.mitre.org/",
  "https://benchlm.ai/md/benchmarks/bfcl-v4.md",
  "https://benchmarklist.com/benchmarks/bfcl_v4/",
  "https://blog.arcade.dev/anthropic-tool-search-4000-tools-test",
  "https://code.claude.com/docs/en/desktop-scheduled-tasks",
  "https://docs.rig.rs/",
  "https://dspy.ai/learn/optimization/optimizers/",
  "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng",
  "https://help.getzep.com/implement-zep-with-agents",
  "https://help.openai.com/articles/12293630-chatgpt-pulse",
  "https://help.openai.com/en/articles/8590148-memory-faq",
  "https://laravel.com/docs/boost",
  "https://modelcontextprotocol.io/development/roadmap",
  "https://modelcontextprotocol.io/seps/index",
  "https://opencode.ai/docs/skills/",
  "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompt-improver",
  "https://stacklok.com/blog/stackloks-mcp-optimizer-vs-anthropics-tool-search-tool-a-head-to-head-comparison/",
  "https://www.layer3labs.io/guides/tau-bench-explained",
  "https://www.usefini.com/guides/good-ai-support-resolution-rate-vendors-tested",
];

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
 * Every clause of the agentic-os team's definition the text fails, by name; empty when it holds
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
    if (!rowsOf(words)[0]?.[1]?.includes(holds)) gaps.push(`${clause}: ${words}`);
  for (const [table, words] of SERVERS)
    if (table === LEFT_OUT && !rowsOf(words)[0]?.[1]?.startsWith(NOT_INSTALLED))
      gaps.push(`not installed: ${words}`);
  for (const [words, command] of COMMANDS)
    if (!rowsOf(words)[0]?.[3]?.includes(command)) gaps.push(`command: ${words}`);
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
const FIRST: [number, string][] = [
  [3, "Agents and subagents"],
  [4, "Measurement"],
  [5, "Agentic"],
];
const NAMED: [number, string[], string][] = [
  [3, SUBJECTS, "subject row"],
  [4, KINDS, "kind row"],
  [5, OWN_SKILLS, "own skill"],
];

test("2026-11-16-003 AC-1: the agentic-os team's definition holds every clause", () => {
  expect(definitionGaps(text)).toEqual([]);
});

test("2026-11-16-003 AC-1: a section whose heading changes, or a section after the last, is named", () => {
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

test("2026-11-16-003 AC-1: a subject, a kind or an own skill whose row leaves its table is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names) {
      expect(rowCount(number, name), name).toBe(1);
      expect(definitionGaps(withRow(number, name, () => "")), name).toContain(`${clause}: ${name}`);
    }
});

test("2026-11-16-003 AC-1: a subject, a kind or an own skill whose row stands twice is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names) {
      expect(rowCount(number, name), name).toBe(1);
      expect(definitionGaps(withRow(number, name, twice)), name).toContain(`${clause}: ${name}`);
    }
});

test("2026-11-16-003 AC-1: a name left only inside a longer first cell has no row", () => {
  const longer = (number: number, name: string) =>
    withRow(number, name, (line) => line.replace(`| ${name} |`, `| ${name} and more |`));
  for (const [number, name] of FIRST) expect(rowCount(number, name), name).toBe(1);
  expect(definitionGaps(longer(3, "Agents and subagents"))).toEqual([
    `subject row: ${"Agents and subagents"}`,
    `no source: ${"Agents and subagents"}`,
  ]);
  expect(definitionGaps(longer(4, "Measurement"))).toContain(`kind row: ${"Measurement"}`);
  expect(definitionGaps(longer(5, "Agentic"))).toEqual([`own skill: ${"Agentic"}`]);
});

test("2026-11-16-003 AC-1: a subject's row with no URL, or a kind's row with nothing in it, is named", () => {
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

test("2026-11-16-003 AC-1: a row more in a table read by its first cell is named", () => {
  const more = (number: number, name: string) =>
    withRow(number, name, (line) => `${line}\n| One more | https://example.com/ |`);
  for (const [number, name] of FIRST) expect(rowCount(number, name), name).toBe(1);
  expect(rowCount(3, "One more") + rowCount(4, "One more") + rowCount(5, "One more")).toBe(0);
  expect(definitionGaps(more(3, "Agents and subagents"))).toEqual(["row count: section 3"]);
  expect(definitionGaps(more(4, "Measurement"))).toEqual(["row count: section 4"]);
  expect(definitionGaps(more(5, "Agentic"))).toEqual(["row count: own skills"]);
});

test("2026-11-16-003 AC-1: a server or a set of skills whose URL leaves its own row is named, also when the URL stands on another row", () => {
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

test("2026-11-16-003 AC-1: a server or a set of skills whose cell of the address holds more than the address is named", () => {
  for (const [, words, readAt] of SERVERS) {
    expect(serverOf(words)[2], words).toBe(readAt);
    const longer = withServer(words, (line) =>
      line.replace(`| ${readAt} |`, `| ${readAt} and more |`),
    );
    expect(definitionGaps(longer), words).toEqual([`server url: ${words}`]);
  }
});

test("2026-11-16-003 AC-1: a server or a set of skills whose words pick two rows is named", () => {
  for (const [, words] of SERVERS) {
    expect(serverOf(words)[1], words).toContain(words);
    expect(definitionGaps(withServer(words, twice)), words).toContain(`server url: ${words}`);
  }
});

test("2026-11-16-003 AC-1: a row that stands under another table's heading is named, with the two tables it changes", () => {
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

test("2026-11-16-003 AC-1: a four-cell row the list does not name, with a URL or with none, or a row gone, is named", () => {
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
  test(`2026-11-16-003 AC-1: a row of section 5 whose second cell loses its "${clause}" is named`, () => {
    const pinned = PINS.filter(([name]) => name === clause);
    expect(pinned.length).toBeGreaterThan(0);
    for (const [, words, holds] of pinned) {
      expect(secondCellOf(words).split(holds), words).toHaveLength(2);
      expect(definitionGaps(withoutInSecond(words, holds)), words).toEqual([`${clause}: ${words}`]);
    }
  });

test("2026-11-16-003 AC-1: a row left out whose second cell no longer opens with the words that leave it out is named", () => {
  const out = SERVERS.filter(([table]) => table === LEFT_OUT);
  expect(out.length).toBeGreaterThan(0);
  for (const [, words] of out) {
    expect(secondCellOf(words), words).toStartWith(NOT_INSTALLED);
    const changed = withServer(words, (line) =>
      line.replace(`| ${NOT_INSTALLED}`, `| Held: ${NOT_INSTALLED}`),
    );
    expect(definitionGaps(changed), words).toEqual([`not installed: ${words}`]);
  }
});

test("2026-11-16-003 AC-1: a rule of section 5 whose line is not whole, in the definition or in the request, is named", () => {
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

test("2026-11-16-003 AC-1: a rule of section 5 that loses a whole sentence or the user's decision is named, and no other rule with it", () => {
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

test("2026-11-16-003 AC-1: a rule more, or a rule whose number changes, is named", () => {
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

test("2026-11-16-003 AC-1: a section that loses its sentence, or holds it twice, is named", () => {
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

test("2026-11-16-003 AC-1: a row whose fourth cell loses the command or the switch it is installed with is named", () => {
  expect(COMMANDS.length).toBeGreaterThan(0);
  for (const [words, command] of COMMANDS) {
    expect(serverOf(words)[3]?.split(command), words).toHaveLength(2);
    expect(definitionGaps(withoutInCell(words, 3, command)), words).toEqual([`command: ${words}`]);
  }
});

test("2026-11-16-003 AC-1: a row of four cells whose fourth cell is empty is named", () => {
  for (const [, words] of SERVERS) {
    const [name = "", , , install = ""] = serverOf(words);
    expect(install, words).not.toBe("");
    const emptied = withServer(words, (line) => `${line.split(" | ").slice(0, 3).join(" | ")} | |`);
    const commands = COMMANDS.filter(([row]) => row === words).map(([row]) => `command: ${row}`);
    expect(definitionGaps(emptied), words).toEqual([...commands, `install cell: ${name}`]);
  }
});

test("2026-11-16-003 AC-1: a row of sources or of tools that loses a limit on what the team does is named", () => {
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

test("2026-11-16-003 AC-1: a page not read that loses its mark, or leaves the document, is named", () => {
  expect(text).not.toBe("");
  for (const url of NOT_OPENED) {
    const gap = `not opened: ${url}`;
    const marked = `${url}${NOT_OPENED_MARK}`;
    expect(text, url).toContain(marked);
    expect(definitionGaps(text.replace(marked, url)), url).toContain(gap);
    expect(definitionGaps(text.replaceAll(marked, "")), `${url} gone`).toContain(gap);
  }
});

test("2026-11-16-003 AC-1: a bare copy of a page not read is named while its first place keeps its mark", () => {
  for (const url of NOT_OPENED) {
    const marked = `${url}${NOT_OPENED_MARK}`;
    const first = text.indexOf(marked);
    expect(first, url).toBeGreaterThan(0);
    const changed = `${text}\nSee also ${url} for more.\n`;
    expect(changed.indexOf(marked), url).toBe(first);
    expect(definitionGaps(changed), url).toEqual([`not opened: ${url}`]);
  }
});

test("2026-11-16-003 AC-1: a page not read that is no longer listed in section 6, or is listed twice, is named", () => {
  for (const url of NOT_OPENED) {
    const listed = (line: string) => line.startsWith(`- ${url}${NOT_OPENED_MARK}`);
    expect(section(text, 6).split("\n").filter(listed), url).toHaveLength(1);
    const unlisted = withChangedLine(text, 6, url, listed, (line) => line.slice(2));
    expect(definitionGaps(unlisted), url).toEqual([`not listed: ${url}`]);
    const again = withChangedLine(text, 6, url, listed, twice);
    expect(definitionGaps(again), `${url} twice`).toEqual([`not listed: ${url}`]);
  }
});

test("2026-11-16-003 AC-1: one more page marked as not read, or the sentence that counts them gone or out of section 6, is named", () => {
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
