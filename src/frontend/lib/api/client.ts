/**
 * Base HTTP client with interceptors, retry, timeout, and auth injection.
 *
 * All backend calls flow through this client.
 * No raw fetch() in components.
 */

import { createClient as createSupabaseClient } from '../supabase/client';
import { normalizeError, isRetryable } from './errors';

const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 300;

interface RequestConfig extends RequestInit {
  timeout?: number;
  retries?: number;
}

function generateCorrelationId(): string {
  return crypto.randomUUID();
}

async function getAuthToken(): Promise<string | null> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  config: RequestConfig,
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...rest } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...rest,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function executeRequest(
  url: string,
  config: RequestConfig,
): Promise<Response> {
  const correlationId = generateCorrelationId();
  const token = await getAuthToken();

  const headers = new Headers(config.headers);
  headers.set('x-correlation-id', correlationId);
  headers.set('content-type', 'application/json');
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetchWithTimeout(url, {
    ...config,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error(body.message || response.statusText), {
      code: body.code || `HTTP_${response.status}`,
      correlationId,
      retryable: response.status >= 500 || response.status === 429,
      details: body.details,
    });
  }

  return response;
}

export async function apiGet<T>(url: string, config?: RequestConfig): Promise<T> {
  const retries = config?.retries ?? MAX_RETRIES;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await executeRequest(url, { ...config, method: 'GET' });
      return (await response.json()) as T;
    } catch (error) {
      const normalized = normalizeError(error);
      if (attempt === retries || !isRetryable(normalized)) {
        throw normalized;
      }
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }

  throw normalizeError(new Error('Max retries exceeded'));
}

export async function apiPost<T>(
  url: string,
  body: unknown,
  config?: RequestConfig,
): Promise<T> {
  const response = await executeRequest(url, {
    ...config,
    method: 'POST',
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

export async function apiPut<T>(
  url: string,
  body: unknown,
  config?: RequestConfig,
): Promise<T> {
  const response = await executeRequest(url, {
    ...config,
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

export async function apiDelete<T>(url: string, config?: RequestConfig): Promise<T> {
  const response = await executeRequest(url, {
    ...config,
    method: 'DELETE',
  });
  return (await response.json()) as T;
}
