import { ConfigValidationError, loadConfig } from '../../../src/config/env';

describe('loadConfig', () => {
  it('applies defaults when variables are absent', () => {
    const config = loadConfig({});

    expect(config.http.port).toBe(3000);
    expect(config.temporal.taskQueue).toBe('hotel-offers');
    expect(config.cache.ttlSeconds).toBe(300);
    expect(config.suppliers.timeoutMs).toBe(3000);
  });

  it('coerces numeric variables and trims trailing slashes from the supplier base url', () => {
    const config = loadConfig({
      PORT: '8080',
      CACHE_TTL_SECONDS: '60',
      SUPPLIER_BASE_URL: 'http://api:3000/',
    });

    expect(config.http.port).toBe(8080);
    expect(config.cache.ttlSeconds).toBe(60);
    expect(config.suppliers.baseUrl).toBe('http://api:3000');
  });

  it('rejects invalid values with every offending variable listed', () => {
    const load = () => loadConfig({ PORT: 'abc', REDIS_URL: 'not-a-url' });

    expect(load).toThrow(ConfigValidationError);
    expect(load).toThrow(/PORT/);
    expect(load).toThrow(/REDIS_URL/);
  });

  it('returns a deeply immutable object', () => {
    const config = loadConfig({});

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.http)).toBe(true);
    expect(Object.isFrozen(config.temporal)).toBe(true);
  });
});
