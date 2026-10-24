# The eval kit's sandbox, probed (2026-10-24)

Item `2026-10-24-009` AC-9, finding 77. One temporary case, `sandbox-probe` (removed after this record), asked the agent to run five commands in the kit's sandbox and quote what each printed: `git status`, `git switch -c probe`, `curl -sI --max-time 10 https://example.com`, `ls ~/.ssh`, `touch ../outside-probe`. Claude Code 2.1.310 (`claude plugin eval`, `--scaffold --trust-plugin --keep-temp`, the agent `claude-sonnet-5-5`, the grant `Write Edit Bash` of `scripts/eval.ts`), macOS 26 (Darwin 25.6.0) with the Command Line Tools at `/Library/Developer/CommandLineTools`. Three runs, 0.20 USD in all; the traces were read for tokens (`sk-ant`, `ghp_`, `gho_`, `github_pat_`, `AKIA`) and held none.

## Results

- git: denied by the sandbox in every form tried. Run 1, the runner's `TMPDIR` (the host's `/var/folders/…/T`): exit 72, `git: error: couldn't create cache file '/var/folders/…/T/xcrun_db-…' (errno=Operation not permitted)`, then `xcode-select: Failed to locate 'git'`. Run 2, `TMPDIR` a folder made with `mktemp -d` inside `plugins/core/evals/results/` (0700, removed after the run): the cache error is gone, `xcode-select: Failed to locate 'git'` stays (exit 72). Run 3, `TMPDIR` as in run 2 and `DEVELOPER_DIR=/Library/Developer/CommandLineTools`: the same exit 72 and line. The agent's `git` is `/usr/bin/git`, the xcrun shim, whatever the runner's PATH holds (a session's PATH is Claude Code's), and the sandbox does not let the shim reach the developer folder.
- network: blocked. `curl` exit 56, `HTTP/1.1 403 user denied`, `X-Proxy-Error: blocked-by-allowlist`, the sandbox's own line `deny network-outbound example.com:443 (user denied)`.
- secrets: not reachable through the home. `~` is the sandbox's own home (`/private/tmp/e-…/home`): `ls ~/.ssh` exit 1, `No such file or directory`. The environment the kit receives is `kitEnvironment`'s allowlist (`scripts/eval.ts`), so no token of the runner's reaches the session either.
- outside-write: confined. `touch ../outside-probe` exit 0, and the file landed in the sandbox's home (`/private/tmp/e-…/home/outside-probe`), the scaffold's parent, not in the repository or the user's home.

## What it means

Finding 77 cannot be fixed from this repository: neither a `TMPDIR` the shim can write nor `DEVELOPER_DIR` lets git run, since the sandbox keeps the shim from the developer folder. It goes upstream as a report on `claude plugin eval`'s sandbox on macOS (git through the xcrun shim fails with exit 72; the read and exec allowance for the active developer directory, or the real git on the session's PATH, would fix it). The report is drafted for the user to send; nothing was sent. Until then, a case whose agent runs git inside the sandbox on macOS sees git fail, and its record says so; the engine's own git calls in a session resolve git on the same PATH (not measured here).

The other three lines say the sandbox does what `scripts/eval.ts` relies on when it grants Bash whole (findings 64 and 95): no network, no host home, no write outside the sandbox.
