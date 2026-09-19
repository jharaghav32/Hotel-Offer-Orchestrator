import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import type { SupplierHotel } from '../domain/hotel';
import { SUPPLIER_NAMES, type SupplierId } from '../domain/supplier';

const supplierHotelsSchema = z.array(
  z.object({
    hotelId: z.string().min(1),
    name: z.string().trim().min(1),
    price: z.number().nonnegative(),
    city: z.string().min(1),
    commissionPct: z.number().min(0).max(100),
  }),
);

const RETRYABLE_CLIENT_STATUSES = new Set([408, 429]);

export class SupplierRequestError extends Error {
  constructor(
    message: string,
    readonly supplierId: SupplierId,
    readonly retryable: boolean,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SupplierRequestError';
  }
}

export interface SupplierClient {
  fetchHotels(supplierId: SupplierId, city: string): Promise<SupplierHotel[]>;
}

export interface SupplierProbe {
  ping(supplierId: SupplierId): Promise<void>;
}

export interface HttpSupplierClientOptions {
  baseUrl: string;
  timeoutMs: number;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || RETRYABLE_CLIENT_STATUSES.has(status);
}

function toRequestError(supplierId: SupplierId, error: unknown): SupplierRequestError {
  const supplier = SUPPLIER_NAMES[supplierId];

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status !== undefined) {
      return new SupplierRequestError(
        `${supplier} responded with HTTP ${status}`,
        supplierId,
        isRetryableStatus(status),
        status,
        { cause: error },
      );
    }
    return new SupplierRequestError(
      `${supplier} request failed: ${error.code ?? error.message}`,
      supplierId,
      true,
      undefined,
      { cause: error },
    );
  }

  return new SupplierRequestError(`${supplier} request failed`, supplierId, true, undefined, {
    cause: error,
  });
}

export class HttpSupplierClient implements SupplierClient, SupplierProbe {
  private readonly http: AxiosInstance;

  constructor({ baseUrl, timeoutMs }: HttpSupplierClientOptions) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: { accept: 'application/json' },
    });
  }

  async fetchHotels(supplierId: SupplierId, city: string): Promise<SupplierHotel[]> {
    let payload: unknown;
    try {
      const response = await this.http.get<unknown>(`/${supplierId}/hotels`, { params: { city } });
      payload = response.data;
    } catch (error) {
      throw toRequestError(supplierId, error);
    }

    const parsed = supplierHotelsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new SupplierRequestError(
        `${SUPPLIER_NAMES[supplierId]} returned an invalid payload`,
        supplierId,
        false,
        undefined,
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }

  async ping(supplierId: SupplierId): Promise<void> {
    try {
      await this.http.get(`/${supplierId}/hotels`, { responseType: 'text' });
    } catch (error) {
      throw toRequestError(supplierId, error);
    }
  }
}
