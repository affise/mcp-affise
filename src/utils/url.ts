/**
 * URL normalization helpers.
 *
 * Affise base URLs are entered by users (the `.env` file, the DXT config
 * form) and routinely arrive with a trailing slash, e.g.
 * `https://api.affise.com/`. The public-API tools build request URLs by
 * string concatenation (`${baseUrl}/3.0/admin/partners`), so a trailing
 * slash produces a double slash (`…com//3.0/...`) which Affise answers with
 * **404**.
 *
 * Normalize once at every boundary where a base URL is stored or used.
 */
export function normalizeBaseUrl(baseUrl: string | undefined | null): string {
  if (!baseUrl) return '';
  return baseUrl.trim().replace(/\/+$/, '');
}
