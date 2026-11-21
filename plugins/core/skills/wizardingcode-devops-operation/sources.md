# Sources of Operation

Each section is a subject of the team's definition (`docs/specs/2026-11-15-devops-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Observability and operation

- Logs, metrics, traces, alerts, incidents, runbooks. What the project already has
- the SRE book: "Monitoring Distributed Systems", chapter 6 (https://sre.google/sre-book/monitoring-distributed-systems/), "Service Level Objectives", chapter 4 (https://sre.google/sre-book/service-level-objectives/), "Practical Alerting", chapter 10 (https://sre.google/sre-book/practical-alerting/), "Being On-Call", chapter 11 (https://sre.google/sre-book/being-on-call/), the Workbook's own chapter being "On-Call", chapter 8 (https://sre.google/workbook/on-call/), and "Postmortem Culture: Learning from Failure", chapter 15 (https://sre.google/sre-book/postmortem-culture/)
- the Workbook's error budget policy, "Example Error Budget Policy", its Appendix B and not a chapter (https://sre.google/workbook/error-budget-policy/)
- OpenTelemetry: "OpenTelemetry Specification 1.62.0" (https://opentelemetry.io/docs/specs/otel/), "OpenTelemetry semantic conventions 1.45.0" (https://opentelemetry.io/docs/specs/semconv/) and "Collector" (https://opentelemetry.io/docs/collector/)
- Prometheus's "Metric and label naming" (https://prometheus.io/docs/practices/naming/) and "Alerting" (https://prometheus.io/docs/practices/alerting/), and Grafana (https://grafana.com/docs/grafana/latest/)
- "The USE Method", Brendan Gregg's (https://www.brendangregg.com/usemethod.html), and the RED method, offered to the user under Brendan Gregg's name and created by Tom Wilkie in 2015, by Grafana Labs' page "The RED Method: How to Instrument Your Services" (https://grafana.com/blog/the-red-method-how-to-instrument-your-services/)
- the service the project uses: Sentry (https://docs.sentry.io/), Datadog (https://docs.datadoghq.com/), New Relic (https://docs.newrelic.com/), Honeycomb (https://docs.honeycomb.io/), CloudWatch (https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html), Grafana Cloud (https://grafana.com/docs/grafana-cloud/)
- PagerDuty's "Incident Response Guide", offered to the user at response.pagerduty.com, which redirects to PagerDuty's documentation (https://docs.pagerduty.com/ops-guides/incident-response-guide), and "The Atlassian Incident Management Handbook" (https://www.atlassian.com/incident-management/handbook)
- the framework's logging documentation, as "Logging (Laravel 13.x)" (https://laravel.com/framework/docs/logging)
- the architects' definition for quality attributes (`docs/specs/2026-11-15-architects-team-design.md`, section 3, the row "Quality attributes")
