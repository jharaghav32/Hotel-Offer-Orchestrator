import { HttpSupplierClient, SupplierRequestError } from '../../../src/suppliers/supplier.client';
import { startServer, type RunningServer } from '../../support/http-server';

const validHotel = { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 };

describe('HttpSupplierClient', () => {
  let server: RunningServer;
  let lastUrl: string | undefined;

  beforeAll(async () => {
    server = await startServer((req, res) => {
      lastUrl = req.url;
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      switch (path) {
        case '/supplierA/hotels':
          return reply(200, [validHotel]);
        case '/supplierB/hotels':
          return reply(503, { error: { code: 'SUPPLIER_UNAVAILABLE' } });
        default:
          return reply(404, { error: { code: 'NOT_FOUND' } });
      }
    });
  });

  afterAll(() => server.close());

  const clientFor = (baseUrl: string, timeoutMs = 1000) =>
    new HttpSupplierClient({ baseUrl, timeoutMs });

  it('fetches and validates hotels for a city', async () => {
    await expect(clientFor(server.baseUrl).fetchHotels('supplierA', 'delhi')).resolves.toEqual([
      validHotel,
    ]);
    expect(lastUrl).toBe('/supplierA/hotels?city=delhi');
  });

  it('marks 5xx responses as retryable', async () => {
    const error = await clientFor(server.baseUrl)
      .fetchHotels('supplierB', 'delhi')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SupplierRequestError);
    expect(error).toMatchObject({ supplierId: 'supplierB', status: 503, retryable: true });
  });

  it('marks 4xx responses as non-retryable', async () => {
    const error = await clientFor(`${server.baseUrl}/missing`)
      .fetchHotels('supplierA', 'delhi')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 404, retryable: false });
  });

  it('rejects payloads that do not match the supplier contract as non-retryable', async () => {
    const invalid = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ hotelId: 'x', name: 'Broken', price: 'free' }]));
    });

    const error = await clientFor(invalid.baseUrl)
      .fetchHotels('supplierA', 'delhi')
      .catch((e: unknown) => e);
    await invalid.close();

    expect(error).toMatchObject({
      retryable: false,
      message: 'Supplier A returned an invalid payload',
    });
  });

  it('treats timeouts as retryable', async () => {
    const slow = await startServer(() => undefined);

    const error = await clientFor(slow.baseUrl, 100)
      .fetchHotels('supplierA', 'delhi')
      .catch((e: unknown) => e);
    await slow.close();

    expect(error).toMatchObject({ retryable: true, status: undefined });
  });

  it('treats connection failures as retryable', async () => {
    const error = await clientFor('http://127.0.0.1:1')
      .fetchHotels('supplierA', 'delhi')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ retryable: true });
  });
});
