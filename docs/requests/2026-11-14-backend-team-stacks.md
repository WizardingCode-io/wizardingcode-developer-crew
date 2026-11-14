# Backend developer team: stacks, sources, frameworks, MCP and skills

## Context

The user paused the benchmark to define the backend developer team first. The engine has a
`backend` team (`packages/engine/src/team.ts`) that is empty: one member
(`review-code-quality`), no agent file for `lead-backend`, `validates: false`. Nothing in the
engine or the packs names documentation sources, MCP servers or skills per stack; a stack
pack has only a prose section "Where the documentation is" in its knowledge file.

The user chose **a written definition first**, decided with them point by point on
2026-11-14. This plan writes that definition into the repository as one document. The engine
and the packs do not change in this work.

## What will be done

One crew item (a chore, documents only) that writes
`docs/specs/2026-11-14-backend-team-stacks-design.md`, in English, following
`plugins/core/skills/crew/references/writing.md`, holding the definition below as decided.
Before writing:

- Read `https://dominikwro.github.io/` (the user's addition for Python, not opened yet) and
  say in the document what it is a source for.
- Add API Platform's documentation URL (`https://api-platform.com/docs/`), the one framework
  the user named without one.
- Every MCP server and skill keeps the URL it was read at and its install command, word for
  word from the research; what the research marked "not verified" is left out or marked.

The document ends with a section "What the code needs, not decided here", naming what a later
item must settle, so nothing is lost: a detector for Go and for Rust in the core
(`packages/engine/src/detect/`); detectors for the frameworks with no pack; where sources,
MCP servers and skills are declared (`PackManifest` in `packages/engine/src/packs.ts` has no
field for them); how "installed at once, in the project and on our side" is carried out and
by whom; and that installing a framework's own skills is a new rule beside ADR 0010 (a pack
ships no skill) and ADR 0017 (outside sources enter distilled), so it needs an ADR of its own.

Then the benchmark the user put on hold (step 3 of the approved plan) is the next step, on
their word.

## The definition (decided 2026-11-14)

### 1. Stacks and where their information comes from

| Stack | Official | Source and changelogs | Packages | Practice and security |
| :- | :- | :- | :- | :- |
| PHP | php.net/manual/en/, PHP RFCs (wiki.php.net/rfc) | php/php-src (NEWS, UPGRADING), php.watch | getcomposer.org, packagist.org | php-fig.org (PSR), PHP: The Right Way, Spatie guidelines, OWASP, Laravel News / Laracasts |
| Node / TypeScript | nodejs.org/docs/latest/api/, typescriptlang.org/docs/, bun.com/docs, docs.deno.com/runtime/, MDN, TC39 | nodejs/node changelogs, microsoft/TypeScript release notes | docs.npmjs.com, npmjs.com | goldbergyoni/nodebestpractices, OWASP Node.js cheat sheet |
| Python | docs.python.org/3/, PEPs, typing.python.org | python/cpython | pypi.org, packaging.python.org, uv | mypy, pyright, ruff, pytest docs; Hitchhiker's Guide; OWASP; dominikwro.github.io |
| Go | go.dev/doc/, go.dev/ref/spec, go.dev/learn/#tutorials, go.dev/wiki, go.dev/blog | golang/go | pkg.go.dev | Google and Uber Go style guides; go.dev/doc/security (govulncheck); OWASP |
| Rust | doc.rust-lang.org (Book, Reference, std, Cargo Book, Edition Guide), Rust by Example, API Guidelines, Clippy lints, Rustonomicon, Async Book, blog.rust-lang.org | rust-lang/rust (RELEASES.md) | docs.rs, crates.io | RustSec (cargo-audit), OWASP |

### 2. Frameworks

| Stack | Frameworks, each with its documentation |
| :- | :- |
| PHP | Laravel (laravel.com/framework/docs); Symfony (symfony.com/doc, the Fast Track 8.1); API Platform; CakePHP (book.cakephp.org/5.x/); WordPress (wordpress.org/documentation/, technical-guides/); CodeIgniter (codeigniter.com/user_guide/); Yii (yiisoft.github.io/docs/guide/, cookbook/); Slim (slimframework.com/docs/v4/); PHP with no framework |
| Node / TypeScript | NestJS (docs.nestjs.com); Express (expressjs.com); Fastify (fastify.dev/docs); Hono (hono.dev/docs) |
| Python | FastAPI (fastapi.tiangolo.com); Django with Django REST Framework (docs.djangoproject.com); Flask (flask.palletsprojects.com); Litestar (docs.litestar.dev) |
| Go | net/http (pkg.go.dev/net/http); Gin (gin-gonic.com/docs); Echo (echo.labstack.com/docs); Fiber (docs.gofiber.io); Chi (go-chi.io) |
| Rust | Axum (docs.rs/axum); Actix Web (actix.rs/docs); Rocket (rocket.rs/guide); Tokio (tokio.rs) |

### 3. MCP servers and skills

Rules, the user's:
- A framework's or a language's **own** MCP server is installed at once, in the project and
  on our side, whenever the project is of it. **Nothing from the community.** Where none
  exists, the information comes from the sources of points 1 and 2.
- Skills published by a framework's or a tool's own team follow the same rule: installed with
  the framework.
- context7 was not chosen.

Common to every stack:
- **GitHub**: the official server (github.com/github/github-mcp-server), remote or local.
- **Errors in production**: the server of the service the project uses, among Sentry,
  Rollbar, Datadog and Bugsnag (each first-party).
- **Database**: the framework's own where it gives the schema and the queries (Boost, Drizzle,
  Prisma); otherwise Google MCP Toolbox for Databases (PostgreSQL, MySQL, with a SELECT-only
  user); Supabase's and Neon's own servers for projects hosted there, read-only.

Per stack, first-party only (read on 2026-11-14):

| Stack | Own MCP server | Own skills |
| :- | :- | :- |
| PHP | Laravel Boost (`composer require laravel/boost --dev`, `php artisan boost:install`), which installs the Herd MCP too. Symfony AI Mate is a CLI today, not an MCP server, installed as Symfony's own tool. WordPress MCP Adapter exposes the site's abilities, not coding context | Laravel (with Boost), Symfony (with AI Mate), API Platform (api-platform/skillset), WordPress (WordPress/agent-skills) |
| Node / TypeScript | None for NestJS, Express, Fastify, Hono. ORMs: Drizzle Kit MCP (in the project, release candidate), Prisma (hosted) | Deno (denoland/skills), Drizzle, Prisma (prisma/skills) |
| Python | None | FastAPI (shipped in the package), Litestar (litestar-org/litestar-skills), Astral (uv, ruff, ty), Pydantic (pydantic/skills) |
| Go | gopls's built-in server, experimental (`claude mcp add gopls -- gopls mcp`) | None (llms.txt for Echo and Fiber) |
| Rust | None | None |

Nothing first-party: CakePHP, CodeIgniter, Yii, Slim, plain PHP, Express, Fastify, Hono,
NestJS (for development), Django, Flask, Gin, Echo, Fiber, Chi, Axum, Actix Web, Rocket, Tokio.

## Files

- New: `docs/specs/2026-11-14-backend-team-stacks-design.md`.
- Read for the form: `docs/specs/2026-10-17-sp7-teams-agents-workflows-and-rules-design.md`
  (line 62 says what the backend team covers), `packs/laravel/knowledge/laravel.md` (how
  sources are written today), `plugins/core/skills/crew/references/writing.md`.
- No change to `packages/`, `plugins/` or `packs/`.

## Verification

- The crew item's gates (prose and secrets scan among them) pass and the engine prints Proven.
- A criterion checks the document names the five stacks, each framework of point 2 and each
  server and skill of point 3 with its URL.
- The user reads the document; their word closes the definition. Commit and push, no release.
