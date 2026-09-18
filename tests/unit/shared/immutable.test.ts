import { deepFreeze } from '../../../src/shared/immutable';

describe('deepFreeze', () => {
  it('freezes nested objects and arrays', () => {
    const value = deepFreeze({ a: { b: { c: 1 } }, list: [{ d: 2 }] });

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.a)).toBe(true);
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(Object.isFrozen(value.list)).toBe(true);
    expect(Object.isFrozen(value.list[0])).toBe(true);
  });

  it('returns primitives unchanged', () => {
    expect(deepFreeze(5)).toBe(5);
    expect(deepFreeze(null)).toBeNull();
  });
});
