/**
 * Unit tests for listPartnerNews — wraps GET /3.0/news.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { listPartnerNews } from '../../src/tools/affise_partner_news.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'partner-key' };

function okResponse(items: any[] = [], allItems: number = items.length) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, items, all_items: allItems },
  } as any;
}

function captureUrl(): { path: string; qs: URLSearchParams } {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  const [path, qs] = String(url).split('?');
  return { path, qs: new URLSearchParams(qs || '') };
}

describe('listPartnerNews', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('GETs /3.0/news with no params when none supplied', async () => {
    await listPartnerNews(CFG, {});
    const [url] = (mockedAxios.get as Mock).mock.calls[0];
    expect(url).toBe('https://api.example.com/3.0/news');
  });

  it('serializes limit/skip and fixed=true', async () => {
    await listPartnerNews(CFG, { limit: 20, skip: 40, fixed: true });
    const { path, qs } = captureUrl();
    expect(path).toBe('https://api.example.com/3.0/news');
    expect(qs.get('limit')).toBe('20');
    expect(qs.get('skip')).toBe('40');
    expect(qs.get('fixed')).toBe('1');
  });

  it('omits fixed when false (matches non-pinned default)', async () => {
    await listPartnerNews(CFG, { fixed: false });
    expect(captureUrl().qs.get('fixed')).toBeNull();
  });

  it('returns ok with items and all_items metadata', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      okResponse([{ _id: 'a', title: 'Hello' }, { _id: 'b', title: 'World' }], 12) as never,
    );
    const r = await listPartnerNews(CFG, { limit: 2 });
    expect(r.status).toBe('ok');
    expect(r.data?.items.length).toBe(2);
    expect(r.data?.all_items).toBe(12);
    expect(r.metadata?.total).toBe(12);
  });

  it('404 from server is normalised to ok + empty list', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 404, statusText: 'Not Found', headers: {}, config: {} as any,
      data: { status: 2, message: 'News not found' },
    } as never);
    const r = await listPartnerNews(CFG, {});
    expect(r.status).toBe('ok');
    expect(r.data?.items).toEqual([]);
    expect(r.data?.all_items).toBe(0);
  });

  it('strip_images=true replaces base64 image data URLs with [IMAGE] markers', async () => {
    const longB64 = 'A'.repeat(300);
    const newsBody = `<p>Hello</p><img src="data:image/jpeg;base64,${longB64}"/><p>World</p>`;
    const item = {
      _id: 'n1',
      title: 'T',
      desc_lang: { en: newsBody, ru: `before <img src="data:image/png;base64,${longB64}" alt="x"/> after` },
      small_desc_lang: { en: `text only` },
    };
    (mockedAxios.get as Mock).mockResolvedValueOnce(okResponse([item], 1) as never);

    const r = await listPartnerNews(CFG, { strip_images: true });
    expect(r.status).toBe('ok');
    const ret = r.data?.items[0];
    expect(ret.desc_lang.en).toBe('<p>Hello</p><img src="[IMAGE]"/><p>World</p>');
    expect(ret.desc_lang.ru).toBe('before <img src="[IMAGE]" alt="x"/> after');
    // Untouched plain text stays as-is
    expect(ret.small_desc_lang.en).toBe('text only');
  });

  it('strip_images defaults to TRUE when omitted (token-conscious by default)', async () => {
    const longB64 = 'B'.repeat(300);
    const item = { _id: 'n2', title: 'T', desc_lang: { en: `<img src="data:image/jpeg;base64,${longB64}"/>` } };
    (mockedAxios.get as Mock).mockResolvedValueOnce(okResponse([item], 1) as never);

    const r = await listPartnerNews(CFG, {});
    expect(r.status).toBe('ok');
    expect(r.data?.items[0].desc_lang.en).not.toContain(longB64);
    expect(r.data?.items[0].desc_lang.en).toContain('[IMAGE]');
  });

  it('strip_images=false explicitly keeps raw base64 payload', async () => {
    const longB64 = 'C'.repeat(300);
    const item = { _id: 'n3', title: 'T', desc_lang: { en: `<img src="data:image/jpeg;base64,${longB64}"/>` } };
    (mockedAxios.get as Mock).mockResolvedValueOnce(okResponse([item], 1) as never);

    const r = await listPartnerNews(CFG, { strip_images: false });
    expect(r.status).toBe('ok');
    expect(r.data?.items[0].desc_lang.en).toContain(longB64);
  });

  it('403 → partner-key-required', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 403, statusText: 'Forbidden', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await listPartnerNews(CFG, {});
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Partner.*API key required/i);
  });
});
