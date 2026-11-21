# Sources of Environment and containers

Each section is a subject of the team's definition (`docs/specs/2026-11-15-devops-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Hosts

- Nothing tied to one machine or account. The infra rubric
- the project's own environment and deployment files
- The Twelve-Factor App: Config (https://12factor.net/config), Backing services (https://12factor.net/backing-services), Dev/prod parity (https://12factor.net/dev-prod-parity) and Disposability (https://12factor.net/disposability)
- the framework on configuration per environment
- the CI on runners and variables, read in the pages of the rows "Pipelines" and "Secrets", no page on runners being opened
- Docker Compose's "Environment variables in Compose" (https://docs.docker.com/compose/how-tos/environment-variables/) and "Using profiles with Compose" (https://docs.docker.com/compose/how-tos/profiles/)
- Martin Fowler's "Immutable Server" (https://martinfowler.com/bliki/ImmutableServer.html), "Phoenix Server" (https://martinfowler.com/bliki/PhoenixServer.html) and "Snowflake Server" (https://martinfowler.com/bliki/SnowflakeServer.html)
- Pets vs Cattle, in Randy Bias's "The History of Pets vs Cattle and How to Use the Analogy Properly", of 2016-09-29 (http://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/)

## Reproducibility

- A pinned toolchain, and a build that does not depend on its time. The infra rubric
- the project's own version files (lockfiles, .tool-versions, .nvmrc, composer.json, rust-toolchain)
- the package manager on lockfiles and frozen installs: Composer's page of commands, "Command-line interface / Commands" (https://getcomposer.org/doc/03-cli.md), "npm-ci" (https://docs.npmjs.com/cli/v11/commands/npm-ci/), "pnpm install" (https://pnpm.io/cli/install), Bun's "Lockfile" (https://bun.com/docs/pm/lockfile), uv's "Locking and syncing" (https://docs.astral.sh/uv/concepts/projects/sync/), pip's "Secure installs - pip documentation v26.3" (https://pip.pypa.io/en/stable/topics/secure-installs/), the "Go Modules Reference", for go.sum (https://go.dev/ref/mod), "Cargo.toml vs Cargo.lock - The Cargo Book" (https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html)
- mise (https://mise.jdx.dev/), asdf (https://asdf-vm.com/) and Volta, a stopped tool, unmaintained by its own README, which recommends mise, used only where the project already uses it (https://volta.sh/)
- reproducible-builds.org (https://reproducible-builds.org/) and SOURCE_DATE_EPOCH (https://reproducible-builds.org/docs/source-date-epoch/)
- Docker on pinning the base image by digest, in "Building best practices", whose section on pinning was not read (https://docs.docker.com/build/building/best-practices/)
- Nix (https://nixos.org/) and devenv (https://devenv.sh/)
- Dev Containers, "Development containers" (https://containers.dev/)
- Renovate (https://docs.renovatebot.com/) and Dependabot (https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/dependabot-quickstart), as on the architects team

## The project's environment

- Start, health, stop, logs. The crew's rules (`plugins/core/skills/crew/references/gate.md`, on the profile's environment and `crew env`)
- what the project declares (compose, Makefile, package.json scripts, artisan, Procfile)
- Docker Compose: "Control startup and shutdown order in Compose", for healthcheck and depends_on (https://docs.docker.com/compose/how-tos/startup-order/), "Define services in Docker Compose" (https://docs.docker.com/reference/compose-file/services/), "Using profiles with Compose" (https://docs.docker.com/compose/how-tos/profiles/) and "Use Compose Watch" (https://docs.docker.com/compose/how-tos/file-watch/)
- the framework's local development documentation: Laravel Herd (https://herd.laravel.com/docs/macos/getting-started/installation), "Laravel Sail" (https://laravel.com/framework/docs/sail) and "Laravel Valet" (https://laravel.com/framework/docs/valet), Vite's "Getting Started" (https://vite.dev/guide/), Next's documentation, whose title was not read (https://nextjs.org/docs), Nuxt's "Introduction · Get Started with Nuxt v4" (https://nuxt.com/docs/4.x/getting-started/introduction), Django's "django-admin and manage.py", for runserver (https://docs.djangoproject.com/en/6.1/ref/django-admin/)
- Dev Containers (https://containers.dev/)
- Overmind, stale and not archived (https://github.com/DarthSim/overmind), Foreman, quiet and not archived (https://github.com/ddollar/foreman), and process-compose (https://github.com/F1bonacc1/process-compose)
- Tilt (https://tilt.dev/) and Skaffold (https://skaffold.dev/) where the project is Kubernetes
- Kubernetes' "Liveness, Readiness, and Startup Probes", as the model of liveness and readiness (https://kubernetes.io/docs/concepts/workloads/pods/probes/)

## Containers and images

- The project's own Dockerfiles and compose
- Docker's documentation: "Building best practices" (https://docs.docker.com/build/building/best-practices/), "Multi-stage builds" (https://docs.docker.com/build/building/multi-stage/), "Docker build cache" (https://docs.docker.com/build/cache/), "Build context", of which `.dockerignore` is a section (https://docs.docker.com/build/concepts/context/), the "Dockerfile reference", where the non-root user (`USER`) and `HEALTHCHECK` are instructions (https://docs.docker.com/reference/dockerfile/), and the "Compose file reference" (https://docs.docker.com/reference/compose-file/)
- the Open Container Initiative (https://opencontainers.org/) and its specifications: image (https://github.com/opencontainers/image-spec), runtime (https://github.com/opencontainers/runtime-spec) and distribution (https://github.com/opencontainers/distribution-spec)
- Podman (https://podman.io/) and Buildah (https://buildah.io/)
- base images: Docker Official Images, at Docker's "Trusted content" (https://docs.docker.com/docker-hub/image-library/trusted-content/) and at the programme's repository (https://github.com/docker-library/official-images), distroless, Google's (https://github.com/GoogleContainerTools/distroless), Chainguard, whose documentation calls them "Chainguard Containers" and no longer Chainguard Images (https://www.chainguard.dev/docs/chainguard/containers), with its catalogue (https://images.chainguard.dev/), Alpine (https://alpinelinux.org/) and its limits, read in musl's "Functional differences from glibc", a page the research chose (https://wiki.musl-libc.org/functional-differences-from-glibc.html)
- the OWASP cheat sheet "Docker Security" (https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html) and the CIS Docker Benchmark, by name (https://www.cisecurity.org/benchmark/docker)
- the framework on its image: "FrankenPHP Docker image: build, configure, extend" (https://frankenphp.dev/docs/docker/), "Laravel Octane" (https://laravel.com/framework/docs/octane), Next's "output", of which `output: 'standalone'` is a section (https://nextjs.org/docs/app/api-reference/config/next-config-js/output), and the official images of PHP (https://hub.docker.com/_/php), Node (https://hub.docker.com/_/node) and Python (https://hub.docker.com/_/python)
- the security team's definition for image scanning (`docs/specs/2026-11-15-security-team-design.md`, section 4)
