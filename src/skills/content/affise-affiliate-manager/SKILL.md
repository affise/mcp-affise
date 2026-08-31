---
name: affise-affiliate-manager
description: Run an affiliate/partner manager's workflow against the Affise MCP server — partner performance reviews, fraud & traffic-quality checks, tracking links, weekly top-partner digests, and quarterly commission reconciliation. Use when the user manages affiliates/partners on Affise and asks to check how partners are doing, spot anomalies or fraud, prepare a partner review or QBR, reconcile payouts, or draft partner outreach. Adapts depth to cadence — daily (quick anomaly triage), weekly (portfolio review), quarterly (reconciliation + narrative).
---

# Affise Affiliate Manager

You are helping an **affiliate manager** — the person on the network/advertiser side who recruits and manages affiliates (partners), watches their traffic quality, hands out tracking links, and reconciles commissions.

Pick the **cadence** that matches the request, then follow that section. If the user does not say, infer from the ask: "how is X doing today / anything weird" → Daily; "weekly review / top partners / who's slipping" → Weekly; "quarterly / reconcile / QBR / tiering" → Quarterly.

The whole value here is **cadence-shaped output** (terse for daily, deeper for quarterly) and **consistent definitions** (below) applied the same way every run.

## Standard definitions (apply identically every time)

- **Active affiliate** — a partner with ≥1 conversion in the trailing 90 days. Anything else is **dormant**.
- **EPC** — earnings per 100 clicks = revenue ÷ clicks × 100. The metric affiliates judge a program by; also the recruitment pitch.
- **CR (conversion rate)** — conversions ÷ clicks × 100. Benchmark: **>3% healthy**, **1–3% watch**, **<1% investigate** (landing/audience mismatch or fraud).
- **Reversal / clawback rate** — share of conversions later rejected/charged back. Discounts real payout.
- **Effective payout** — `bounty × (1 − reversal_rate)`. Always quote this, not the headline bounty, when talking money.
- **Click→conversion discrepancy** — clicks up but conversions flat (or vice-versa) vs baseline → tracking break or fraud, investigate.

## DAILY — anomaly & quality triage

Goal: answer *"what changed since baseline, and is it a problem?"* in seconds. **Never dump a full table.** Return only what needs a decision.

1. **Delta scan** — call `affise_stats_compare` (MTD vs the same day-range in the prior period), sliced by partner. Surface partners whose revenue / conversions / CR moved sharply vs baseline.
2. **Fraud/quality check** on each flagged partner:
   - `affise_conversions_raw` with the fraud lens (high `fraud_risk`, status breakdown) — look for bot-like patterns, duplicate/self-referrals, CR collapse alongside a click spike.
   - `affise_trafficback` — who is sending junk and why (top reasons, geo).
3. **Tracking links on demand** — if the ask is "give partner X a link for offer Y", use `affise_offer_tracking_link` (offer × affiliate × sub1/sub2). Look up the partner via `affise_get_partner` if needed.

**Output:** 3–5 anomalies max, each as `partner → what changed vs baseline → likely cause → suggested action`. Offer to draft a partner reply. Stop there.

## WEEKLY — top-partner digest + outreach + fraud sweep

Goal: a repeatable review with the **same cohorts** every week, so weeks are comparable.

1. **Movers** — `affise_stats_raw` sliced by partner, week-over-week. Rank top and bottom movers by revenue and CR change.
2. **Cohorts** — split the base into **active vs dormant** (definition above). Flag active partners trending down (churn risk) before they go dormant.
3. **Deep-dive** the flagged partners — `affise_affiliate_analysis` (one composite call per affiliate: stats-by-offer + trafficback + detail → KPIs, breakdown, insights).
4. **Fraud sweep** — weekly `affise_trafficback`, then narrative via `analyze_trafficback` / `analyze_stats`.

**Output:** a shortlist framed as **who to reward / who to warn / who's churning**, with one reason each. Offer to draft personalized outreach per partner (custom terms for top partners, re-engagement for decliners).

## QUARTERLY — reconciliation + segmentation + tiering

Goal: the heavy pass — commission reconciliation, partner segmentation, tiering, and a board/QBR narrative.

1. **Reconciliation** — `affise_conversions_raw` for the quarter, then `analyze_conversions` with the **payouts lens**. Reconcile approved vs reversed; compute **effective payout** per partner. Flag payout aging and reversal outliers.
2. **Segmentation** — `affise_stats_raw` segmented by partner tier / offer / new-vs-returning. Compute revenue-per-partner.
3. **Period-over-period** — `affise_stats_compare` quarter-over-quarter for the trend line.
4. **Tiering** — recommend promotions/demotions using effective payout, volume, and traffic quality (not headline revenue alone).

**Output:** a KPI roll-up + explicit tiering recommendations + a wins / challenges / next-steps narrative suitable for a QBR or program review.

## Gotchas (Affise API)

- **Filter sub cap:** filters accept only `sub1..sub8`. `sub9..sub30` are valid as slice/order dimensions but **not** as filter keys.
- **Range limits:** `/stats/custom` (behind `affise_stats*`) max **6 months**; conversions max 365 days, 63 days in `raw_export` mode.
- **`order[]` needs a backing metric** present in `fields`, else the API 500s. Revenue sort keys are unreliable.
- **Conversion status** is passed as numeric codes; the tools map status names → codes for you.
- **Auth scope:** admin-class tools (`affise_list_partners`, `affise_get_partner`, network-wide stats) need an admin key. The `affise_partner_*` tools are partner-scoped self-service and only see one affiliate's view.

## Data boundaries

This role's data is the **partner/traffic side**. Affise does not carry account-management metrics (NRR, health score, NPS) or company P&L / forecast / CAC — if the user asks for those, say so plainly rather than approximating from partner data.
