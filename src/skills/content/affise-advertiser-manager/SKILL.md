---
name: affise-advertiser-manager
description: Run an Affise advertiser manager's (a.k.a. account manager's) workflow — the demand-side mirror of the affiliate manager, managing advertisers/suppliers instead of affiliates. Performance reviews, anomaly & quality triage, cap and geo control, brand-safety checks, advertiser outreach, and payout reconciliation. Use when the user manages advertisers/suppliers (accounts) on Affise and asks how an advertiser is doing, to spot anomalies or over-delivery, run a brand-safety sweep, prepare an advertiser review/QBR, reconcile commissions, or draft advertiser outreach. Adapts depth to cadence — daily (anomaly triage), weekly (portfolio review + outreach), quarterly (reconciliation + tiering).
---

# Affise Advertiser Manager (Account Manager)

You are helping an **advertiser manager** — inside Affise this is the **account manager** role: the demand-side mirror of the affiliate manager. Where the affiliate manager manages **partners (= affiliates)**, you manage **advertisers (= suppliers)** — in Affise these are the same managed entity (the advertiser lookup is the suppliers route). Same rhythms, same craft: watch performance, keep quality and brand safe, grow the relationship, reconcile money.

Pick the **cadence** that matches the request. If unstated, infer: "how's this advertiser today / anything off" → Daily; "weekly review / who's slipping" → Weekly; "quarterly / reconcile / QBR / tiering" → Quarterly.

The value is **cadence-shaped output** (terse daily, deep quarterly) and **consistent definitions** applied identically every run.

## Standard definitions (apply identically every time)

- **Advertiser = supplier** — the same managed entity in Affise (`affise_list_advertisers` / `affise_get_advertiser`; IDs are 24-char Mongo hex). `advertiser` and `supplier` are both stats slice/filter dimensions.
- **Active advertiser** — an advertiser with ≥1 conversion in the trailing 90 days; else **dormant**.
- **Approval rate** — approved ÷ total conversions per advertiser/offer. Falling approval = quality or reconciliation problem.
- **Reversal / chargeback rate** — share later rejected/charged back. Discounts real payout.
- **Effective payout** — `bounty × (1 − reversal_rate)`. Quote this, not headline bounty.
- **Cap fill %** — delivered ÷ cap. Near 100% = over-delivery exposure; throttle or raise the cap deliberately.
- **NGR / GGR** (iGaming) — net/gross gaming revenue; commissions often map to NGR minus bonus costs, with negative carryover where the contract requires.

## DAILY — anomaly & quality triage

Goal: *"what changed for my advertisers since baseline, and is it a problem?"* **Never dump a full table** — return only what needs a decision.

1. **Delta scan** — `affise_stats_compare` (MTD vs the same day-range prior, aligned), sliced by `advertiser` (or `supplier`). Surface advertisers whose revenue / conversions / CR / approval moved sharply vs baseline.
2. **Spike & quality check** on flagged advertisers:
   - `affise_conversions_raw` (fraud lens): a click/lead spike with a CR collapse or duplicate/self-referral pattern is fraud, not growth.
   - `affise_trafficback`: rejected-traffic reasons and geos on that advertiser's offers.
3. **Cap watch** — from the stats slice, flag offers nearing their cap (over-delivery risk).

**Output:** ≤5 items as `advertiser → what moved vs baseline → likely cause → action (throttle / pause / investigate / raise cap / call the advertiser)`. Offer to draft the advertiser message.

## WEEKLY — portfolio review + outreach + brand-safety sweep

Goal: a repeatable review with the **same cohorts** every week, so weeks are comparable.

1. **Movers** — `affise_stats_raw` sliced by advertiser, week-over-week. Rank top and bottom movers by revenue and CR/approval change.
2. **Cohorts** — split the book into **active vs dormant** advertisers. Flag active advertisers trending down (churn risk) before they go dormant.
3. **Deep-dive** the flagged advertisers — `affise_stats_raw` for that advertiser sliced by offer → partner → country → device, plus `affise_trafficback`, narrated via `analyze_stats` / `analyze_trafficback`. (There is no one-call composite for advertisers the way `affise_affiliate_analysis` exists for affiliates — assemble from stats slices.)
4. **Brand-safety / compliance** — watch for misleading claims, unauthorized brand assets, trademark bidding, geo/device cloaking that steals attribution.

**Output:** a shortlist framed as **who to reward / who to warn / who's churning**, plus compliance flags, one reason each. Offer to draft advertiser outreach (upsell terms for strong advertisers, re-engagement for decliners).

## QUARTERLY — reconciliation + segmentation + tiering

Goal: the heavy pass — commission reconciliation, advertiser segmentation, tiering, and a QBR narrative.

1. **Reconciliation** — `affise_conversions_raw` for the quarter → `analyze_conversions` (payouts lens). Match network transactions against the advertiser's own sales/refund report by order ID, inside the hold window. Compute **effective payout** per advertiser; flag payout aging (15/30/45-day) and reversal outliers.
2. **Segmentation** — `affise_stats_raw` by advertiser tier / offer / new-vs-returning; revenue-per-advertiser.
3. **Period-over-period** — `affise_stats_compare` quarter-over-quarter for the trend line.
4. **Tiering** — recommend promotions/demotions using effective payout, volume, and traffic quality (not headline revenue alone).

**Output:** a KPI roll-up + explicit tiering recommendations + a wins / challenges / next-steps narrative suitable for the advertiser QBR.

## Gotchas (Affise API)

- **Advertiser = supplier, 24-char Mongo hex IDs** — use `affise_list_advertisers` / `affise_get_advertiser`. There is **no dedicated supplier list/get tool**; reach suppliers via the advertiser tools and the `supplier` stats slice/filter.
- **Filter sub cap:** filters accept only `sub1..sub8`; `sub9..sub30` are slice/order only.
- **Range limits:** `/stats/custom` max 6 months; conversions max 365 days (63 in `raw_export`).
- **`order[]` needs the sort metric in `fields`**, else the API 500s.
- **Conversion status** is numeric; the tools map status names → codes.
- **Auth scope:** advertiser/offer management and network-wide stats need an admin key.

## Data boundaries

Affise carries the **traffic/payout side** of the advertiser relationship. The advertiser's own internal sales/refund ledger and any contract/CRM data live outside Affise — reconciliation compares against them by order ID but cannot fetch them here. Company P&L / forecast is out of scope.
