# The backend developer team: stacks, sources, frameworks, MCP servers and skills. Design

- Status: decided by the user on 2026-11-14, point by point. A definition: no engine, plugin or pack change comes with it
- Source: the request document `docs/requests/2026-11-14-backend-team-stacks.md` (the plan the user approved that day)
- The facts about MCP servers and skills were read on the web on 2026-11-14, each at the URL beside it

## 1. Why

The engine has a `backend` team (`packages/engine/src/team.ts`, `TEAMS.backend`) with one member, `review-code-quality`, no agent file for its lead and `validates: false`. Nothing in the engine or in the packs says which stacks and frameworks that team covers, where it reads about them, or which MCP servers and skills it uses. A stack pack names its documentation in prose alone, in the section "Where the documentation is" of its knowledge file (`packs/laravel/knowledge/laravel.md`).

This document records what the user decided, so the item that builds it starts from decisions and asks none of them again.

## 2. What exists today

- The core detects PHP, Node and Python (`packages/engine/src/detect/`). The packs add Laravel with Dusk, Next and Nuxt. Go and Rust are not detected.
- The researcher (`plugins/core/agents/researcher.md`) reads the web with WebFetch and WebSearch and names no MCP server.
- A pack is data alone, with no skill, agent or hook (ADR 0010). An outside source enters rewritten in the crew's words, with its provenance (ADR 0017).

## 3. Stacks and where their information comes from

The team covers five stacks. Each has four kinds of source: the official documentation, the source code with its changelogs, the package registry, and named guides of practice and security.

| Stack | Official documentation | Source and changelogs | Packages | Practice and security |
| :- | :- | :- | :- | :- |
| PHP | https://www.php.net/manual/en/ (the manual and its migration guides); the PHP RFCs, https://wiki.php.net/rfc | `php/php-src` on GitHub (`NEWS`, `UPGRADING`); https://php.watch | https://getcomposer.org; https://packagist.org | https://www.php-fig.org/ (the PSRs); PHP: The Right Way, https://phptherightway.com; the Spatie guidelines; OWASP; Laravel News and Laracasts |
| Node / TypeScript | https://nodejs.org/docs/latest/api/; https://www.typescriptlang.org/docs/; https://bun.com/docs; https://docs.deno.com/runtime/; MDN for JavaScript and the Web APIs; TC39 | `nodejs/node` on GitHub (its changelogs); the release notes of `microsoft/TypeScript` | https://docs.npmjs.com; https://www.npmjs.com | `goldbergyoni/nodebestpractices` on GitHub; the OWASP Node.js cheat sheet |
| Python | https://docs.python.org/3/ (the reference, the standard library, What's New); the PEPs, https://peps.python.org; https://typing.python.org | `python/cpython` on GitHub | https://pypi.org; https://packaging.python.org; uv, https://docs.astral.sh/uv | the documentation of mypy, pyright, ruff (https://docs.astral.sh/ruff) and pytest (https://docs.pytest.org); The Hitchhiker's Guide to Python; OWASP; https://dominikwro.github.io/ |
| Go | https://go.dev/doc/ (the documentation, Effective Go, the release notes); https://go.dev/ref/spec; https://go.dev/learn/#tutorials; https://go.dev/wiki (Code Review Comments, common mistakes); https://go.dev/blog | `golang/go` on GitHub | https://pkg.go.dev | the Google Go Style Guide; the Uber Go Style Guide (`uber-go/guide`); https://go.dev/doc/security (govulncheck and the vulnerability database); OWASP |
| Rust | https://doc.rust-lang.org (The Book, the Reference, the standard library, the Cargo Book, the Edition Guide); Rust by Example; the Rust API Guidelines; Clippy's list of lints; the Rustonomicon; the Async Book; https://blog.rust-lang.org | `rust-lang/rust` on GitHub (`RELEASES.md`) | https://docs.rs; https://crates.io | RustSec, https://rustsec.org (with cargo-audit); OWASP |

`https://dominikwro.github.io/` is "Python: The Right Way", a community guide by Dominik Wronski under CC BY-NC 4.0. Read on 2026-11-14, some of its entries were unfinished placeholders. The user chose it as a source.

## 4. Frameworks

Each framework is listed with its documentation.

| Stack | Frameworks |
| :- | :- |
| PHP | Laravel (https://laravel.com/framework/docs); Symfony (https://symfony.com/doc, and the Fast Track, https://symfony.com/doc/8.1/the-fast-track/en/index.html); API Platform (https://api-platform.com/docs/); CakePHP (https://book.cakephp.org/5.x/); WordPress (https://wordpress.org/documentation/, https://wordpress.org/documentation/technical-guides/); CodeIgniter (https://www.codeigniter.com/user_guide/index.html); Yii (https://yiisoft.github.io/docs/guide/, https://yiisoft.github.io/docs/cookbook/); Slim (https://www.slimframework.com/docs/v4/); PHP with no framework |
| Node / TypeScript | NestJS (https://docs.nestjs.com); Express (https://expressjs.com); Fastify (https://fastify.dev/docs); Hono (https://hono.dev/docs) |
| Python | FastAPI (https://fastapi.tiangolo.com); Django, with Django REST Framework (https://docs.djangoproject.com); Flask (https://flask.palletsprojects.com); Litestar (https://docs.litestar.dev) |
| Go | the standard library's net/http (https://pkg.go.dev/net/http); Gin (https://gin-gonic.com/docs); Echo (https://echo.labstack.com/docs); Fiber (https://docs.gofiber.io); Chi (https://go-chi.io) |
| Rust | Axum (https://docs.rs/axum); Actix Web (https://actix.rs/docs); Rocket (https://rocket.rs/guide); Tokio, the runtime (https://tokio.rs) |

Laravel is the one framework with a pack today (`packs/laravel`).

## 5. MCP servers and skills

### The rules

1. An MCP server made by a framework's or a language's own team is installed at once, in the project and on our side, whenever the project is of that framework or language. Laravel Boost is the reference case.
2. Nothing from the community is installed. Where a framework has no server of its own, the team reads the sources of sections 3 and 4.
3. Skills published by a framework's or a tool's own team follow rule 1: they are installed with the framework.
4. context7 was offered and not chosen.
5. A command that takes a token or a key is written with the variable's name and no value.

### Common to every stack

| Use | Server | Read at | How it is added |
| :- | :- | :- | :- |
| Source, releases and issues | GitHub's official server, hosted at `https://api.githubcopilot.com/mcp/` or run on the machine; `--read-only` leaves the write tools out | https://github.com/github/github-mcp-server | `docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server` |
| Errors in production: Sentry | hosted at `https://mcp.sentry.dev/mcp`, or run on the machine | https://mcp.sentry.dev/ | `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp/{organizationSlug}/{projectSlug}` |
| Errors in production: Rollbar | run on the machine | https://docs.rollbar.com/docs/mcp-server-setup | `npx -y @rollbar/mcp-server@latest` |
| Errors in production: Datadog | hosted; Datadog says it is "under significant development" | https://docs.datadoghq.com/bits_ai/mcp_server/setup/ | `claude mcp add --transport http datadog-mcp <YOUR_MCP_SERVER_ENDPOINT>` |
| Errors in production: Bugsnag | SmartBear's server, hosted or run on the machine | https://developer.smartbear.com/smartbear-mcp | the page read gave no command |
| Database: PostgreSQL and MySQL | Google MCP Toolbox for Databases, run on the machine. It has no read-only switch: it connects with a SELECT-only database user | https://mcp-toolbox.dev/documentation/introduction/ | `npx -y @toolbox-sdk/server --prebuilt=postgres` |
| Database: a project hosted on Supabase | Supabase's hosted server, read-only (`?read_only=true`) | https://supabase.com/docs/guides/getting-started/mcp | `claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp"` |
| Database: a project hosted on Neon | Neon's hosted server, read-only (`?readonly=true`) | https://neon.com/docs/ai/neon-mcp-server | `npx neon@latest mcp` |

The error server used is the one of the service the project already sends its errors to. For the database, a framework's own server comes first where it gives the schema and the queries (Laravel Boost, Drizzle Kit, Prisma); Google MCP Toolbox serves the other projects, and Supabase's and Neon's serve the projects hosted there.

### Per stack, from the framework's or the tool's own team

| Stack | Server or skills | Read at | How it is installed |
| :- | :- | :- | :- |
| PHP | Laravel Boost: an MCP server in the project (application info, database schema and queries, logs, the last error, a search of the installed versions' documentation), with guidelines and skills | https://laravel.com/framework/docs/boost | `composer require laravel/boost --dev`, then `php artisan boost:install` |
| PHP | Laravel Herd's MCP server, on the developer's machine (sites, services, PHP versions). Boost installs it | https://herd.laravel.com/docs/macos/advanced-usage/ai-integrations | `claude mcp add herd php /Applications/Herd.app/Contents/Resources/herd-mcp.phar -e SITE_PATH="$(pwd)"` |
| PHP | Symfony AI Mate: Symfony's own assistant for a project. Its documentation calls it "a plain CLI" with no server to start, so it is a tool and not an MCP server. It installs its extensions' skills and a block in `AGENTS.md` | https://symfony.com/doc/current/ai/components/mate.html | `composer require --dev symfony/ai-mate`, then `vendor/bin/mate init` and `vendor/bin/mate discover` |
| PHP | API Platform's skills (15). API Platform has no MCP server for development | https://github.com/api-platform/skillset | `/plugin marketplace add api-platform/skillset`, then `/plugin install api-platform@api-platform-skillset` |
| PHP | WordPress Agent Skills (19) | https://github.com/WordPress/agent-skills | `npx skills add WordPress/agent-skills --skill wp-plugin-development` |
| PHP | WordPress MCP Adapter: a plugin that exposes a site's abilities as tools. It gives no coding context | https://github.com/WordPress/mcp-adapter | the page read gave no command |
| Node / TypeScript | Drizzle Kit's MCP server, in the project. It needs Drizzle Kit's release candidate | https://orm.drizzle.team/docs/drizzle-kit-mcp | `npm i -D drizzle-kit@rc`, then `claude mcp add --transport stdio --scope project drizzle -- npx --no-install drizzle-kit mcp` |
| Node / TypeScript | Drizzle's skill | https://orm.drizzle.team/docs/drizzle-kit-skills | `npx --no-install drizzle-kit skills` |
| Node / TypeScript | Prisma's MCP server, hosted | https://www.prisma.io/docs/ai/tools/mcp-server | `claude mcp add --transport http prisma https://mcp.prisma.io/mcp` |
| Node / TypeScript | Prisma's skills | https://www.prisma.io/docs/ai/tools/skills | `npx skills add prisma/skills` |
| Node / TypeScript | Deno's skills. Deno has no MCP server | https://github.com/denoland/skills | `npx skills add denoland/skills` |
| Python | FastAPI's skill, shipped inside the installed package | https://fastapi.tiangolo.com/ai-development/ | `uvx library-skills install --skill fastapi --yes --claude` |
| Python | Litestar's skills (20) | https://github.com/litestar-org/litestar-skills | `claude plugin marketplace add litestar-org/litestar-skills`, then `claude plugin install litestar@litestar` |
| Python | Astral's plugin: skills for uv, ruff and ty | https://github.com/astral-sh/claude-code-plugins | `/plugin marketplace add astral-sh/agent-plugins`, then `/plugin install astral@astral-sh` |
| Python | Pydantic's skills | https://github.com/pydantic/skills | `claude plugin marketplace add pydantic/skills`, then `claude plugin install pydantic@pydantic-skills` |
| Go | gopls's built-in MCP server, labelled experimental: the workspace, a package's API, diagnostics, references, a search, govulncheck | https://github.com/golang/tools/blob/master/gopls/doc/features/mcp.md | `claude mcp add gopls -- gopls mcp` |
| Rust | none found | | |

No server and no skills of their own were found for CakePHP, CodeIgniter, Yii, Slim, PHP with no framework, Express, Fastify, Hono, Django, Flask, Gin, Chi, Axum, Actix Web, Rocket and Tokio. NestJS has no server for development: `@nestjs/mcp` builds MCP servers inside an application, and NestJS Observe's server is paid and reads production data. Echo and Fiber publish an `llms.txt` and nothing else. For all of these, rule 2 applies.

## 6. What the code needs, not decided here

The item that builds this definition settles each of these:

- A detector for Go and one for Rust in the core (`packages/engine/src/detect/`), and detectors for the frameworks with no pack.
- Where a stack's sources, servers and skills are declared. `PackManifest` (`packages/engine/src/packs.ts`) has no field for them.
- How "installed at once, in the project and on our side" is carried out, and by whom: the engine, a pack or the session.
- An ADR for rule 3. Installing a framework's own skills stands beside ADR 0010, under which a pack ships no skill, and ADR 0017, under which an outside source enters distilled.
- How the servers are confined:
  - where each server's credential is held and with what scope (GitHub, the error services, the databases);
  - that the hosted servers (GitHub's remote form, Prisma's, Supabase's, Neon's and the error services') send project data outside the machine;
  - that an install command runs its publisher's code in the project and on our side, so the version and the page are checked again at the install;
  - that two servers are not stable: Drizzle Kit's is a release candidate and gopls's is experimental.
- The backend team itself: its members beyond `review-code-quality`, its lead's agent file, and whether it validates.
