/**
 * Server-level `instructions` — returned to every MCP client in the
 * `initialize` handshake (SDK `ServerOptions.instructions`). This is the one
 * guidance surface that reaches ALL clients automatically, with no install:
 * it's the same mechanism behind the "MCP Server Instructions" block hosts
 * show for other servers.
 *
 * Keep it a concise operating brief, not a manual — a tool-selection tree,
 * auth scoping, the API gotchas, and a pointer to the richer skill resources
 * registered by `skills/setup.ts`.
 */

export const SERVER_INSTRUCTIONS = `Affise MCP — read before choosing a tool.

WHICH TOOL:
- Natural-language question ("top offers last week") → affise_stats or affise_search_offers.
- Precise slices/filters (by country, sub-IDs, specific metrics) → affise_stats_raw / affise_conversions_raw.
- "Compared to last period" / trend → affise_stats_compare (auto range-aligned).

NL INPUT (affise_stats / affise_search_offers): parser is ENGLISH-ONLY. Translate a non-English ask to English before calling, and write dates as ISO YYYY-MM-DD ("1-7 июля" → "from 2026-07-01 to 2026-07-07"). affise_stats accepts multiple explicit ISO ranges (one pull per range, → data.multi_period). For a specific partner + sub-ID export, or any filter the NL layer might miss, prefer affise_stats_raw with explicit slice/filter (one call per date range).
- Review ONE affiliate's account → call affise_affiliate_analysis FIRST (composite: stats-by-offer + trafficback + detail); don't hand-assemble from separate tools.
- Trafficback / rejected-traffic breakdown → affise_trafficback.
- Look up one entity → affise_get_offer / affise_get_partner / affise_get_advertiser / affise_get_conversion; lists → affise_list_partners / affise_list_advertisers.
- Generate a tracking link → affise_offer_tracking_link (offer × affiliate × sub*).
- After fetching data, use the analysis prompts (analyze_stats, analyze_conversions, analyze_trafficback, analyze_offers, auto_analysis) to interpret it — they take already-fetched JSON.

AUTH SCOPE:
- affise_partner_* tools are partner-scoped self-service (one affiliate's own view).
- Admin-class tools (list/get partner, list/get advertiser, network-wide stats) need an admin key.

GOTCHAS:
- Filters accept only sub1..sub8; sub9..sub30 are valid as slice/order dimensions, not filter keys.
- /stats/custom range max 6 months; conversions max 365 days (63 in raw_export mode).
- order[] requires the sort metric to be present in fields, or the API 500s.
- Conversion status is numeric; the tools map status names → codes.

ROLE PLAYBOOKS:
- Skill resources are published under skill://affise/* (see resources/list). Each packages a role's daily/weekly/quarterly workflow — load the one matching the user's role:
  - skill://affise/affiliate-manager — manage affiliates (fraud/quality, tracking links, partner reviews, reconciliation).
  - skill://affise/advertiser-manager — advertiser/account manager (advertiser = supplier); demand-side mirror of affiliate-manager: advertiser performance reviews, brand safety, reconciliation.
  - skill://affise/affiliate-publisher — an affiliate's own ROI, sub-ID/geo optimization, earnings (partner-scoped tools).
  - skill://affise/business-owner — whole-account view (both affiliates and advertisers): overall performance, active/dormant cohorts, concentration/margin, board review.`;
