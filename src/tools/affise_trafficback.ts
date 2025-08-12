import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export interface TrafficbackStatsParams {
  date_from: string;
  date_to: string;

  country?: string[];
  currency?: string[];
  advertiser?: string[];
  advertiser_manager_id?: string[];
  offer?: number[];
  manager?: string[];
  partner?: string[];
  os?: string[];
  device?: string[];
  sub1?: string[];
  sub2?: string[];
  sub3?: string[];
  sub4?: string[];
  sub5?: string[];
  sub6?: string[];
  sub7?: string[];
  sub8?: string[];
  goal?: string[];
  advertiser_tag?: string;
  affiliate_tag?: string;
  offer_tag?: string;

  page?: number;
  limit?: number;  // Results per page (default: 100, max: 500)
  orderType?: 'asc' | 'desc';

  locale?: 'en' | 'ru' | 'es';
  timezone?: string;
}

export interface TrafficbackStatsData {
  stats?: {
    trafficback?: number;
    trafficback_reason?: string;
    country?: string;
    [key: string]: any;
  }[];
  pagination?: {
    count?: number;
    pages?: number;
  };
}

export interface TrafficbackStatsResult {
  status: 'ok' | 'error';
  message: string;
  data?: TrafficbackStatsData;
  metadata?: {
    total_records: number;
    date_range: string;
    filters_applied: string[];
    page_info: {
      current_page: number;
      total_pages: number;
      per_page: number;
      total_count: number;
    };
    analysis_summary?: {
      total_trafficback: number;
      top_reasons: string[];
      affected_geos: string[];
      time_period: string;
    };
  };
  timestamp: string;
}

export async function getTrafficbackStats(
  config: { baseUrl: string; apiKey: string },
  params: TrafficbackStatsParams
): Promise<TrafficbackStatsResult> {
  const { baseUrl, apiKey } = config;

  if (!baseUrl || !apiKey) {
    return {
      status: 'error',
      message: 'baseUrl or apiKey not provided',
      timestamp: getCurrentTimestamp()
    };
  }

  if (!params.date_from || !params.date_to) {
    return {
      status: 'error',
      message: 'date_from and date_to are required parameters',
      timestamp: getCurrentTimestamp()
    };
  }

  try {
    const url = `${baseUrl}/3.0/stats/getbytrafficback`;
    const queryParams = new URLSearchParams();

    queryParams.append('filter[date_from]', params.date_from);
    queryParams.append('filter[date_to]', params.date_to);
    queryParams.append('page', String(params.page ?? 1));
    queryParams.append('limit', String(params.limit ?? 100));
    queryParams.append('orderType', params.orderType ?? 'desc');

    const arrayFilters: (keyof TrafficbackStatsParams)[] = [
      'currency', 'advertiser', 'advertiser_manager_id', 'offer', 'manager',
      'partner', 'country', 'os', 'device', 'goal',
      'sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8'
    ];

    for (const key of arrayFilters) {
      const values = params[key];
      if (Array.isArray(values) && values.length > 0) {
        values.forEach(value => {
          queryParams.append(`filter[${key}][]`, String(value));
        });
      }
    }

    const singleFilters: Record<string, string | undefined> = {
      advertiser_tag: params.advertiser_tag,
      affiliate_tag: params.affiliate_tag,
      offer_tag: params.offer_tag
    };

    for (const [key, value] of Object.entries(singleFilters)) {
      if (value) queryParams.append(`filter[${key}]`, value);
    }

    if (params.locale) queryParams.append('locale', params.locale);
    if (params.timezone) queryParams.append('timezone', params.timezone);

    const fullUrl = `${url}?${queryParams.toString()}`;

    if (process.env.NODE_ENV === 'development') {
      console.info('Trafficback Stats API URL:', fullUrl);
    }

    const response = await axios.get(fullUrl, {
      headers: {
        'api-key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 45000,
      validateStatus: status => status < 500
    });

    if (response.status === 401) {
      return { status: 'error', message: 'Authentication failed - check API key', timestamp: getCurrentTimestamp() };
    }
    if (response.status === 403) {
      return { status: 'error', message: 'Access forbidden - insufficient permissions', timestamp: getCurrentTimestamp() };
    }
    if (response.status >= 400) {
      return {
        status: 'error',
        message: `API error: ${response.status} ${response.statusText} - ${JSON.stringify(response.data)}`,
        timestamp: getCurrentTimestamp()
      };
    }

    const data: TrafficbackStatsData = response.data;

    if (!Array.isArray(data.stats)) {
      return {
        status: 'error',
        message: 'Invalid response format: missing stats array',
        timestamp: getCurrentTimestamp()
      };
    }

    const totalRecords = data.stats.length;
    const pagination = data.pagination || {};

    const filtersApplied: string[] = [];
    if (params.currency?.length) filtersApplied.push(`currency: ${params.currency.join(', ')}`);
    if (params.advertiser?.length) filtersApplied.push(`advertiser: ${params.advertiser.length} items`);
    if (params.partner?.length) filtersApplied.push(`partner: ${params.partner.length} items`);
    if (params.country?.length) filtersApplied.push(`countries: ${params.country.join(', ')}`);
    if (params.device?.length) filtersApplied.push(`devices: ${params.device.join(', ')}`);
    if (params.os?.length) filtersApplied.push(`OS: ${params.os.join(', ')}`);
    if (params.goal?.length) filtersApplied.push(`goals: ${params.goal.join(', ')}`);
    if (params.sub1?.length) filtersApplied.push(`sub1: ${params.sub1.length} items`);
    if (params.timezone) filtersApplied.push(`timezone: ${params.timezone}`);

    const totalTrafficback = data.stats.reduce((sum, stat) => sum + (stat.trafficback || 0), 0);
    const topReasons = Array.from(new Set(
      data.stats
      .map(stat => stat.trafficback_reason)
      .filter((r): r is string => typeof r === 'string')
      )).slice(0, 5);


    const affectedGeos = Array.from(new Set(data.stats
      .filter(stat => stat.country && stat.trafficback! > 0)
      .map(stat => stat.country!)
    )).slice(0, 10);

    return {
      status: 'ok',
      message: `Retrieved ${totalRecords} records`,
      data,
      metadata: {
        total_records: totalRecords,
        date_range: `${params.date_from} to ${params.date_to}`,
        filters_applied: filtersApplied,
        page_info: {
          current_page: params.page ?? 1,
          total_pages: pagination.pages ?? 1,
          per_page: params.limit ?? 100,
          total_count: pagination.count ?? totalRecords
        },
        analysis_summary: {
          total_trafficback: totalTrafficback,
          top_reasons: topReasons,
          affected_geos: affectedGeos,
          time_period: `${params.date_from} to ${params.date_to}`
        }
      },
      timestamp: getCurrentTimestamp()
    };

  } catch (error: any) {
    let message = 'Unknown error';
    if (error.code === 'ECONNREFUSED') message = 'Connection refused';
    else if (error.code === 'ETIMEDOUT') message = 'Request timed out';
    else if (error.code === 'ENOTFOUND') message = 'DNS lookup failed';
    else if (error.response) {
      const status = error.response.status;
      message = error.response.data?.message || `HTTP ${status}: ${error.response.statusText}`;
    } else {
      message = error.message;
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('API Error:', error);
    }

    return {
      status: 'error',
      message: `Error retrieving stats: ${message}`,
      timestamp: getCurrentTimestamp()
    };
  }
}
export function createTrafficbackPresets() {
  return {
    recentByCountry: (dateFrom: string, dateTo: string, countries?: string[]) => ({
      date_from: dateFrom,
      date_to: dateTo,
      country: countries,
      orderType: 'desc',
      limit: 100
    }),

    deviceAnalysis: (dateFrom: string, dateTo: string) => ({
      date_from: dateFrom,
      date_to: dateTo,
      orderType: 'desc',
      limit: 100
    }),

    offerAnalysis: (dateFrom: string, dateTo: string, offers?: number[]) => ({
      date_from: dateFrom,
      date_to: dateTo,
      offer: offers,
      orderType: 'desc',
      limit: 100
    }),

    trafficSourceAnalysis: (dateFrom: string, dateTo: string) => ({
      date_from: dateFrom,
      date_to: dateTo,
      orderType: 'desc',
      limit: 100
    }),

    comprehensive: (dateFrom: string, dateTo: string) => ({
      date_from: dateFrom,
      date_to: dateTo,
      orderType: 'desc',
      limit: 100
    }),

    byAdvertiser: (dateFrom: string, dateTo: string, advertiserIds?: string[]) => ({
      date_from: dateFrom,
      date_to: dateTo,
      advertiser: advertiserIds,
      orderType: 'desc',
      limit: 100
    }),

    byPartner: (dateFrom: string, dateTo: string, partnerIds?: string[]) => ({
      date_from: dateFrom,
      date_to: dateTo,
      partner: partnerIds,
      orderType: 'desc',
      limit: 100
    })
  };
}

