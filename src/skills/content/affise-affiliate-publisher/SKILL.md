---
name: affise-affiliate-publisher
description: Run an affiliate/publisher's own workflow against the Affise MCP server — pick offers, watch your own ROI, cut losing campaigns, scale winners, optimize by sub-ID and geo, and reconcile your earnings. Use when the caller is an affiliate (partner) working their own account and asks which offers to run, how their campaigns are doing, how to optimize by sub-ID/geo/device, or to check pending vs paid earnings. Uses partner-scoped self-service tools only. Adapts depth to cadence — daily (ROI & kill/scale), weekly (sub-ID & segment optimization), quarterly (earnings reconciliation & scaling).
---

# Affise Affiliate / Publisher

You are helping an **affiliate (publisher)** — the media buyer who sends traffic and watches *their own* profit. Core discipline: **test small and clean, cut losers fast, scale winners slowly.** Recurring pain: a campaign profitable for two weeks, then ROI collapses.

This role authenticates with a **partner-scoped key**, so use the **`affise_partner_*` self-service tools** — they return only this affiliate's own view. Do NOT reach for admin tools (`affise_list_partners`, network-wide stats); they aren't available to a partner key.

Pick the **cadence**. If unstated: "what should I run / how's today" → Daily; "optimize / sub-ID / which segments" → Weekly; "earnings / getting paid / scale" → Quarterly.

## Standard definitions (apply identically every time)

- **ROI** — (revenue − spend) ÷ spend. **ROAS** — revenue ÷ spend.
- **EPC** — earnings per 100 clicks. Rule of thumb: EPC must be ~2–3× your CPC to stay profitable after test waste and off-days.
- **CR** — conversions ÷ clicks × 100.
- **Effective payout** — `bounty × (1 − reversal_rate)`. A $100 bounty at 20% reversal is really $80 — always plan on the effective number.
- **sub1** — treat as the primary ROI filter (traffic source / seller); deeper subs = ad variant, placement, audience.
- **Pending / approved / paid** — earnings lifecycle; money clears only after the hold window.

## DAILY — ROI check, kill losers, scale winners

Goal: *"where am I making or losing money right now?"* **Terse.**

1. **Live offers** — `affise_partner_live_offers` / `affise_partner_offers` for what's active and available to you.
2. **Own performance** — `affise_stats` (your account) by offer/campaign; compute ROI/EPC/CR per campaign.
3. **Balance snapshot** — `affise_partner_balance` for today's earnings vs expectation.

**Output:** ≤5 actions — `campaign/offer → ROI now → kill / keep / scale`, and flag any winner starting to turn south (EPC decay vs baseline). Note: ad-spend lives in your ad network, not Affise — ask the user for spend to complete ROI if they haven't given it.

## WEEKLY — sub-ID & segment optimization

Goal: find the profitable slivers and cut the rest.

1. **Discover your subs** — `affise_partner_find_subs` to see which sub-IDs you've been using.
2. **Rank by ROI** — `affise_stats` / `affise_stats_raw` sliced by sub1 first (source/seller), then by geo × device × OS × time-of-day. Surface "sub1=X is 80% of profit; these subs bleed."
3. **Timing / retention** — `affise_time_to_action` and `affise_retention_rate` to see how fast and how durably your traffic converts.

**Output:** a whitelist/blacklist of sub-IDs and segments, plus "double down here, cut these, refresh fatiguing creatives (CTR decay)." Suggest moving a proven funnel from a cheap test geo to a higher-value tier-1 geo.

## QUARTERLY — earnings reconciliation & scaling

1. **Reconcile** — `affise_partner_balance` + `affise_conversions_raw` (your conversions): pending vs approved vs paid, and when each clears (hold window). Compare against your own tracker to catch discrepancies/shaving.
2. **Effective earnings** — apply reversal rate to get real payout, per offer.
3. **Portfolio** — rank offers by EPC stability, retire dying ones, prospect new offers/verticals.
4. **Scaling** — recommend a budget split (~70–80% scale proven / 20–30% test new); raise daily budgets in ~15–20% increments; expand geos on proven funnels. Draft a payout-bump / cap-raise ask to the affiliate manager backed by your volume evidence.

**Output:** an earnings reconciliation (pending/approved/paid with clear dates), portfolio EPC-stability ranking, and a scale-vs-test plan.

## Gotchas (Affise API)

- **Partner-scoped only:** use `affise_partner_profile / _balance / _news / _offers / _live_offers / _find_subs`. Admin/network tools return nothing (or error) on a partner key.
- **Filter sub cap:** filters accept only `sub1..sub8`; deeper subs are slice/order only.
- **Range limits:** stats max 6 months; conversions max 365 days (63 in `raw_export`).
- **Conversion status** is numeric; tools map names → codes.

## Data boundaries

Affise sees your **conversions and payouts on this network** — not your ad-network spend or other networks' earnings. ROI needs the spend side from the user; cross-network totals must be assembled outside Affise.
