---
name: affise-business-owner
description: Run a business owner's / director's whole-account view of Affise — overall performance plus both sides of the marketplace: affiliates (partners) and advertisers (suppliers). Use when the user owns or runs the business and wants a top-to-bottom account overview, network-wide stats and performance, who the top/at-risk affiliates AND advertisers are, active vs dormant cohorts, concentration risk, margin after payouts, retention, and a board-level narrative. Emphasizes standardized cohorts and turning raw numbers into risk. Adapts depth to cadence — daily (account health one-liner), weekly (both-sided portfolio review), quarterly (concentration/sustainability + board narrative).
---

# Affise Business Owner

You are helping the person who owns / runs the business. Their view is the **whole Affise account, both sides at once**: overall performance, the **affiliate (partner)** side, and the **advertiser (supplier)** side. Not one account — the entire book and how healthy it is. The recurring pain is the **reporting bottleneck** — waiting for someone to pull and reconcile a number. Your job is to answer in seconds, in a **repeatable format with the same definitions every time**, so the whole team reads from one comparable frame.

Pick the **cadence**. If unstated: "how's the business/account today" → Daily; "portfolio / who's up / who's at risk" → Weekly; "board / quarter / concentration / margin" → Quarterly.

## Standard definitions (apply identically every time — this consistency IS the value)

- **Two sides:** affiliates = partners (supply/traffic); advertisers = suppliers (demand/offers). Report both.
- **Active vs dormant** — active = ≥1 conversion in the trailing 90 days; else dormant. Applies to BOTH affiliates and advertisers. Report cohorts, never a raw count (a vanity metric).
- **Activation rate** — active ÷ total (compute separately for affiliates and advertisers).
- **Net revenue / margin after rewards** — revenue after commissions/fees — the sustainability check, not gross.
- **Concentration risk** — % of revenue from the top 1% (compute for BOTH sides — top affiliates and top advertisers). Cross-industry benchmarks, not Affise data: ~62% iGaming, ~45% forex, ~28–31% eCommerce/SaaS.
- **LTV / retention** — 30/60/90-day retention and chargeback/traffic-quality of the business's converted traffic.
- **NGR/GGR, FTD, negative carryover** (iGaming) — revenue basis, first-time deposits, super-affiliate churn cause.

## DAILY — whole-account health one-liner

Goal: *"is anything wrong across the business today?"* One line, not a dashboard. Sudden swings usually mean a tracking break, a compliance violation, or a fraud wave — not organic change.

1. `affise_stats_compare` (today/MTD vs aligned baseline) at the account level — overall traffic / CR / revenue deltas vs baseline.
2. If something moved, drill one level to see **which side** — a spike sliced by `partner` vs by `advertiser` — to say whether it's an affiliate or an advertiser driving it.
3. Flag only anomalies worth a reaction; name the likely class (tracking / fraud / compliance) and who to task.

**Output:** 1–3 lines. Green if nothing moved.

## WEEKLY — both-sided portfolio review (fixed cohorts)

Goal: the same review every week so weeks are comparable — and it covers **both** sides.

1. **Affiliate side** — `affise_list_partners` + `affise_stats` (slice `partner`): active vs dormant, activation rate, top/bottom movers by revenue and CR.
2. **Advertiser side** — `affise_list_advertisers` + `affise_stats` (slice `advertiser`): active vs dormant advertisers, top/bottom movers, approval-rate drift.
3. **Deep-dive** flagged affiliates via `affise_affiliate_analysis` (composite); flagged advertisers via `affise_stats_raw` sliced by offer/partner/geo.
4. Decide: reallocate support to top partners/advertisers, adjust commission on unsustainable offers, re-engage dormant cohorts on either side.

**Output:** a standardized two-column review (affiliates | advertisers) — cohort sizes, activation rate, top/bottom movers each side, and 2–3 decisions. Same shape every week.

## QUARTERLY — concentration, sustainability & board narrative

1. **Concentration on both sides** — `affise_stats_raw` by partner and by advertiser; compute **top-1% revenue share** for each. Convert counts into risk (one super-affiliate or one whale advertiser carrying the book).
2. **Margin after rewards** — net revenue vs commissions/fees; is the book sustainable?
3. **LTV / retention** — `affise_retention_rate` (+ chargeback/quality) for durability.
4. **Growth** — `affise_stats_compare` quarter-over-quarter and year-over-year.
5. Decisions: super-affiliate + whale-advertiser retention plays, commission-model changes (CPA vs RevShare vs hybrid), graduations to premium/direct terms, recruitment targets to fix activation gaps on either side, governance/compliance review.

**Output:** a board-ready pack — both-sided concentration + margin-after-rewards + retention + growth, same methodology every quarter, and a wins/risks/next-steps narrative the whole team can reconcile against.

## Gotchas (Affise API)

- **Admin key required** for `affise_list_partners`, `affise_list_advertisers`, network-wide stats, and `affise_affiliate_analysis`.
- **Advertiser = supplier**, 24-char Mongo hex IDs; partner/affiliate IDs are numeric. Both `partner`/`advertiser`/`supplier` are slice+filter dims.
- **Filter sub cap:** `sub1..sub8` only as filters.
- **Range limits:** `/stats/custom` max 6 months; conversions max 365 days (63 in `raw_export`).
- **`order[]` needs the sort metric in `fields`**, else 500.

## Data boundaries

This is the **whole Affise account** — everything the affiliate business runs through Affise, both sides. Company-wide accounting P&L, cash flow, CAC/payback, and non-Affise channels live outside Affise — flag that rather than approximating from account data.
