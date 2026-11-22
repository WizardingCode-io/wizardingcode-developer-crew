# Sources of MCP servers

Each section is a subject of the team's definition (`docs/specs/2026-11-16-agentic-os-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read the content of some pages and only the answer of others; a line that says a page was not opened names nothing that was read. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## MCP servers

- Build, expose, confine. The specification at its revision 2026-07-28, the latest release of its repository, read at "Key Changes" (https://modelcontextprotocol.io/specification/2026-07-28/changelog): it removes protocol-level sessions and the `initialize` handshake ("Make MCP stateless"), adds `server/discover`, and deprecates Roots, Sampling and Logging with "a minimum twelve-month deprecation window"
- its repository (https://github.com/modelcontextprotocol/modelcontextprotocol)
- "Authorization", where "Authorization is OPTIONAL for MCP implementations." and whose sections on scope selection and step-up were not gone through line by line (https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- the blog (https://blog.modelcontextprotocol.io/), with "The 2026-07-28 Specification" (https://blog.modelcontextprotocol.io/posts/2026-07-28/), the roadmap of 2026-08-22, "The New MCP Roadmap" (https://blog.modelcontextprotocol.io/posts/mcp-roadmap/), and "A More Predictable Release Cycle for MCP", of 2026-11-11 (https://blog.modelcontextprotocol.io/posts/mcp-release-cycle/)
- the extensions, "Extensions Overview" (https://modelcontextprotocol.io/extensions/overview) and the "Extension Support Matrix", whose cells came back empty for all but three marks (https://modelcontextprotocol.io/extensions/client-matrix)
- the registry, in preview by its own page, "The MCP Registry (about)" (https://modelcontextprotocol.io/registry/about), a place to watch and not an install source
- the official SDKs, by tier (https://modelcontextprotocol.io/docs/sdk), at the organisation's repositories (https://github.com/modelcontextprotocol)
- the MCP Inspector, "MCP Inspector" (https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector) and its repository (https://github.com/modelcontextprotocol/inspector), and the conformance suite, "MCP Conformance Test Framework", where "A baselined failure is still a failure against a requirement set." (https://github.com/modelcontextprotocol/conformance)
- the security page, "Security Best Practices" (https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices), on which tool poisoning is not a section, and the "OWASP MCP Top 10", a beta and not a final list, headed version v0.1 and at "Phase 3 – Beta Release and Pilot Testing" by its own roadmap, whose sixth entry has two names, "Prompt Injection via Contextual Payloads" on the rendered page and "Intent Flow Subversion" in the repository, so the team cites MCP06 by its number (https://owasp.org/projects/mcp-top-10)
- Laravel MCP, MIT (https://github.com/laravel/mcp)
- Claude Code's managed MCP configuration, "Control MCP server access for your organization" (https://code.claude.com/docs/en/managed-mcp)
- the user's server rules (section 5 of this document)
- the security team's definition (`docs/specs/2026-11-15-security-team-design.md`, section 3, the row "AI and agents")
