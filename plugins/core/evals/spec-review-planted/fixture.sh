#!/bin/sh
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
git add -A
fixture_commit "fixture: node project"
crew detect > /dev/null
ANSWERS='{"work_type":"feature","is_vague":0,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0.9,"touches_public_api":0}'
ID=$(crew start "Webhook delivery for account changes" --answers "$ANSWERS" --json | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
[ -n "$ID" ] || ID=$(ls .crew/work | head -1)
cat > ".crew/work/$ID/spec.md" <<'DOC'
# Webhook delivery

## Problem

Customers want to hear when an account changes. We send them a webhook.

## Goals

- Deliver every account event to the customer's URL with the HCP tier applied.
- A blazingly fast, seamless and revolutionary delivery.

### Design

The accounts module already exposes `deliverWebhook()`, so we call it after each change. `createAccount` already sends an email when an account is made, so the customer is told twice and that is fine. Failed deliveries are retried.

## Acceptance criteria

- AC-1: A webhook goes out when an account is created.

## Risks and rollback

None.

## Out of scope

Signing the payload.
DOC
cat > ".crew/work/$ID/plan.md" <<'DOC'
# Plan

1. Update the accounts module to send webhooks.
2. Choose a suitable queue and retry policy, and implement them.
3. Add some tests.
DOC
