# Sources of Research

Each section is a kind of research of the team's definition (`docs/specs/2026-11-15-researchers-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research opened most of the pages; a line that says a page was not opened, or was read in part, names no more than it says. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Code and repository

- The project's repository (code, tests, configuration, migrations)
- the git history
- the workspace's other projects
- the earlier decisions (`crew decisions`)
- the knowledge base. Outside the project: the dependency's own source at the version in use
- GitHub Code Search in organisations' repositories, as described in About GitHub Code Search (https://docs.github.com/en/search-github/github-code-search/about-github-code-search) and Understanding GitHub Code Search syntax (https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax), which needs a signed-in account
- the `gh` commands by their manual pages: gh search code (https://cli.github.com/manual/gh_search_code), which runs on the legacy code search engine and has no regex
- gh release list (https://cli.github.com/manual/gh_release_list)
- gh release view (https://cli.github.com/manual/gh_release_view)
- gh issue list (https://cli.github.com/manual/gh_issue_list)
- gh api (https://cli.github.com/manual/gh_api).

## Documentation

- The official documentation of the version the project's manifest uses
- release notes and migration guides, as in Laravel's Release Notes (https://laravel.com/framework/docs/releases) and Upgrade Guide (https://laravel.com/framework/docs/upgrade)
- the provider's API reference
- standards and specifications: RFC Editor (https://www.rfc-editor.org/)
- W3C standards and drafts (https://www.w3.org/TR/)
- WHATWG Standards (https://spec.whatwg.org/)
- the sources decided in the backend, security and ETL teams' definitions (`docs/specs/2026-11-14-backend-team-stacks-design.md`, `docs/specs/2026-11-15-security-team-design.md`, `docs/specs/2026-11-15-etl-team-design.md`). Context7 (https://context7.com/) is an Upstash project. A documentation server such as Context7 finds the page
- the citation is of the official page.

## News and recent changes

- Releases and changelogs on GitHub, as defined in About releases (https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- the projects' and providers' official blogs
- security advisories: GitHub Advisory Database (https://github.com/advisories)
- CVE (https://www.cve.org/ (read in part))
- NVD (https://nvd.nist.gov/ (read in part))
- end-of-support notices: endoflife.date (https://endoflife.date/) and its EndOfLife API v1 (https://endoflife.date/docs/api/v1/ (read in part))
- the last month's discussion: Hacker News (https://news.ycombinator.com/), through the Official HN API (https://github.com/HackerNews/API) and the HN Search API (https://hn.algolia.com/api (read in part))
- Reddit, under its Data API Terms (https://redditinc.com/policies/data-api-terms)
- X, through the X API (https://docs.x.com/x-api/introduction), which is paid per resource read (https://docs.x.com/x-api/getting-started/pricing)
- DEV Community (https://dev.to/), through the Forem API (https://developers.forem.com/api). The discussion points at the news
- the fact is cited from its origin.

## Good practice and proven solutions

- The framework's and the provider's official guides
- standards: OWASP's Projects (https://owasp.org/projects (read in part)) and the OWASP Cheat Sheet Series (https://cheatsheetseries.owasp.org/)
- the cloud providers' frameworks under their current names: AWS Well-Architected (https://aws.amazon.com/architecture/well-architected/)
- Azure Well-Architected Framework (https://learn.microsoft.com/en-us/azure/well-architected/)
- Google Cloud Well-Architected Framework (https://docs.cloud.google.com/architecture/framework)
- engineering blogs of organisations that describe what they have in production
- organisations' reference repositories
- published incident reports: Google's SRE Books (https://sre.google/books/) and the chapter Postmortem Culture: Learning from Failure (https://sre.google/sre-book/postmortem-culture/)
- the collection danluu/post-mortems (https://github.com/danluu/post-mortems)
- Thoughtworks' Technology Radar (https://www.thoughtworks.com/radar)
- The Twelve-Factor App (https://12factor.net/)
- the base's earlier solutions. One person's text enters only with a second independent source.

## Product and market

- Competitors' sites read directly, with their pricing and feature pages, never a third party's summary
- their changelogs and public documentation
- the app stores' public listings, which show reviews with no sign-in: App Store (https://apps.apple.com/us/app/apple-store/id375380948, an example listing) and Google Play (https://play.google.com/store/apps/details?id=com.google.android.apps.maps, an example listing)
- the stores' review APIs cover one's own apps only and need a developer account: Customer Reviews, App Store Connect API (https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews (read in part)) and Reply to Reviews, Google Play Developer API (https://developers.google.com/android-publisher/reply-to-reviews)
- review directories: G2 (https://www.g2.com/ (not opened)), Capterra (https://www.capterra.com/ (not opened)), TrustRadius (https://www.trustradius.com/ (not opened)), all three refuse an automated client
- public reports of those who measure the sector: Similarweb (https://www.similarweb.com/), whose per-site page gives ranks and a three-month chart free and the rest on a trial or paid plan, and Statista (https://www.statista.com/accounts/individuals), whose Basic account is free and whose premium statistics and reports are paid
- Product Hunt (https://www.producthunt.com/), whose API (https://api.producthunt.com/v2/docs) needs a token and forbids commercial use
- job postings as a sign of what they are building, on the competitor's own careers page, since LinkedIn Jobs (https://www.linkedin.com/jobs/) forbids automated reading in its User Agreement (https://www.linkedin.com/legal/user-agreement) and Crawling Terms (https://www.linkedin.com/legal/crawling-terms) and is read by hand only
- the Wayback Machine (https://web.archive.org/) for a competitor's past pages, with its availability API (https://archive.org/help/wayback_api.php), free and with no key. Prices and features hold for three months.

## Flows and frontend

- Competitors' real pages, opened in a browser and captured step by step (the purchase flow, sign-up, search)
- published usability research: Baymard Institute for e-commerce, whose articles (https://baymard.com/blog) and benchmark ranking (https://baymard.com/ux-benchmark) are free and whose full research, Baymard Premium, is paid and needs an account (https://baymard.com/pricing), and Nielsen Norman Group, whose articles are free (https://www.nngroup.com/articles/)
- the platforms' guidelines: Apple's Human Interface Guidelines (https://developer.apple.com/design/human-interface-guidelines/ (read in part)), Material Design 3 (https://m3.material.io/ (read in part)), Web Content Accessibility Guidelines (WCAG) 2.2, a W3C Recommendation of 12 December 2024 (https://www.w3.org/TR/WCAG22/), the ARIA Authoring Practices Guide (https://www.w3.org/WAI/ARIA/apg/) and web.dev (https://web.dev/)
- galleries of real flows, both commercial: Mobbin (https://mobbin.com/), with a limited free plan on an account and paid plans, and Page Flows (https://pageflows.com/), paid after a three-day trial
- the documentation of public design systems: GOV.UK Design System (https://design-system.service.gov.uk/), Polaris (https://shopify.dev/docs/api/polaris), now a reference of web components since the React library is deprecated and archived, Carbon Design System (https://www.carbondesignsystem.com/) and Atlassian Design (https://atlassian.design/)
- the plugin's own design library (`plugins/core/design/library/`).

## The user's voice

- Reviews of one to three stars: Trustpilot (https://www.trustpilot.com/), whose Terms of Use for Consumers (https://corporate.trustpilot.com/legal/for-reviewers/terms-of-use-for-consumers/oct-2026) forbid automated collection, scraping and text mining, AI agents named, so its reviews are read by hand or through its API with a key (https://developers.trustpilot.com/)
- G2 (https://www.g2.com/ (not opened)), which refuses an automated client
- the app stores' public listings, as in the row above, their review APIs being for one's own apps only
- Reddit, whose robots.txt (https://www.reddit.com/robots.txt) disallows every automated client and whose content is read through the Data API with an account under the Data API Terms (https://redditinc.com/policies/data-api-terms), commercial use needing a separate agreement
- the sector's forums, through Discourse's public JSON (https://docs.discourse.org/ (read in part)), each forum under its own terms
- Stack Exchange, through the Stack Exchange API v2.3 (https://api.stackexchange.com/docs), with a daily quota and a key from a registered application, its content under CC BY-SA, which requires attribution (https://stackoverflow.com/help/licensing)
- issues and discussions on GitHub (https://docs.github.com/en/issues, https://docs.github.com/en/discussions), issues at 60 requests an hour with no token and discussions through GraphQL with a token
- Hacker News, through Hacker News Search powered by Algolia (https://hn.algolia.com/ (read in part)), with no key
- the last month's social networks. On public personal data, the EDPB's Guidelines 03/2026, a consultation draft (https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_2020603_webscraping_v1_en_0.pdf), say that data on a page open to everyone is not consent to its scraping, and the ICO says the right to be informed remains (https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-common-issues-might-come-up-in-practice/). Each quote is literal and carries its link
- the sample's size is said before any conclusion. Public content only, and no personal data is stored.

## Academic

- arXiv (https://arxiv.org/), through its API (https://info.arxiv.org/help/api/user-manual.html), with no key and at most one request every three seconds on one connection under the Terms of Use for arXiv APIs (https://info.arxiv.org/help/api/tou.html)
- PubMed (https://pubmed.ncbi.nlm.nih.gov/), through the E-utilities (https://www.nlm.nih.gov/dataguide/eutilities/utilities.html), three requests a second with no key and ten with a free key from an NCBI account (https://support.nlm.nih.gov/kbArticle/?pn=KA-05317)
- bioRxiv and medRxiv, through one API on two hosts, with no key (https://api.biorxiv.org/, https://api.medrxiv.org/)
- Semantic Scholar and OpenAlex to find and follow citations: the Semantic Scholar Academic Graph API (https://www.semanticscholar.org/product/api) answers without a key under a limit shared by all, and a free key gives one request a second
- OpenAlex (https://help.openalex.org/api/authentication/) answers basic queries with no key, and a free key from an account gives 1 USD of usage a day, more being paid
- Crossref to check each reference field by field by its DOI, through its REST API (https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/), with no registration and higher limits for a request that carries an email address, and its Retraction Watch data (https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/), open and updated every working day
- the DOI itself resolved at doi.org (https://www.doi.org/)
- Unpaywall for the open-access copy (https://help.openalex.org/access/unpaywall/), an API that takes an email address and now runs on the OpenAlex database
- the article's own text when it is open access. What comes from the abstract alone is said so, and exhaustive coverage is never claimed.
