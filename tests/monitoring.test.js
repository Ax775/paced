import { describe, it, expect } from 'vitest';
import { scrubEvent, scrubBreadcrumb } from '../src/lib/monitoring.js';

describe('scrubEvent — PII redaction', () => {
  it('drops the user object entirely', () => {
    const e = scrubEvent({ user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' } });
    expect(e.user).toBeUndefined();
  });

  it('strips the query string from the request URL (e.g. ?invite=CODE)', () => {
    const e = scrubEvent({ request: { url: 'https://paced.nl/?invite=SECRET123&x=1' } });
    expect(e.request.url).toBe('https://paced.nl/');
  });

  it('drops cookies and headers from the request', () => {
    const e = scrubEvent({ request: { url: 'https://paced.nl/', cookies: 'a=b', headers: { Authorization: 'x' } } });
    expect(e.request.cookies).toBeUndefined();
    expect(e.request.headers).toBeUndefined();
  });

  it('redacts emails in the message and exception values', () => {
    const e = scrubEvent({
      message: 'failed for jane.doe@example.com',
      exception: { values: [{ value: 'login error: User a@b.co not found' }] },
    });
    expect(e.message).toBe('failed for [redacted]');
    expect(e.exception.values[0].value).toBe('login error: User [redacted] not found');
  });

  it('drops console breadcrumbs but keeps others (query-stripped)', () => {
    const e = scrubEvent({
      breadcrumbs: [
        { category: 'console', message: 'whatever a@b.com' },
        { category: 'navigation', data: { to: '/settings?token=abc' } },
      ],
    });
    expect(e.breadcrumbs).toHaveLength(1);
    expect(e.breadcrumbs[0].category).toBe('navigation');
    expect(e.breadcrumbs[0].data.to).toBe('/settings');
  });

  it('is a safe no-op on junk input', () => {
    expect(scrubEvent(null)).toBeNull();
    expect(scrubEvent(undefined)).toBeUndefined();
    expect(scrubEvent({})).toEqual({});
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
  });

  it('strips query strings from navigation/fetch urls', () => {
    const b = scrubBreadcrumb({ category: 'fetch', data: { url: 'https://x.supabase.co/rest?apikey=zzz' } });
    expect(b.data.url).toBe('https://x.supabase.co/rest');
  });

  it('redacts emails in breadcrumb messages', () => {
    const b = scrubBreadcrumb({ category: 'ui.click', message: 'clicked by a@b.com' });
    expect(b.message).toBe('clicked by [redacted]');
  });

  it('passes through junk safely', () => {
    expect(scrubBreadcrumb(null)).toBeNull();
    expect(scrubBreadcrumb({ category: 'navigation' }).category).toBe('navigation');
  });
});
