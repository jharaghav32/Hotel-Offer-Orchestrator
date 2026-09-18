export const SUPPLIER_IDS = ['supplierA', 'supplierB'] as const;

export type SupplierId = (typeof SUPPLIER_IDS)[number];

export const SUPPLIER_NAMES: Readonly<Record<SupplierId, string>> = Object.freeze({
  supplierA: 'Supplier A',
  supplierB: 'Supplier B',
});

export function isSupplierId(value: string): value is SupplierId {
  return (SUPPLIER_IDS as readonly string[]).includes(value);
}
