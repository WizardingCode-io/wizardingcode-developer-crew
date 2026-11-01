#!/bin/sh
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
cat > concepts_brief.md <<'DOC'
# Webhook delivery

## Overview

Tell customers when an account changes.

## Analysis

The lenses asked about retries and storage.

## Goals vs. Non-Goals

Deliver account events. Not signing payloads.

## Alternatives Weighed

Polling by the customer, rejected because customers asked for a push.

## Key Decisions

Deliveries are at least once.
DOC
mkdir -p docs/billing
echo "# Billing" > docs/billing/README.md
git add -A
fixture_commit "fixture: node project with a brief"
crew detect > /dev/null
