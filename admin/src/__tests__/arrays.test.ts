import { describe, expect, it } from 'vitest';
import { moveItem, replaceAt } from '../lib/arrays';

describe('moveItem', () => {
  it('mueve hacia adelante y hacia atrás, como el par de splice que reemplazó', () => {
    const splices = <T>(list: T[], from: number, to: number) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved as T);
      return next;
    };
    const base = ['a', 'b', 'c', 'd', 'e'];
    for (let from = 0; from < base.length; from++)
      for (let to = 0; to < base.length; to++)
        if (from !== to) expect(moveItem(base, from, to)).toEqual(splices(base, from, to));
  });

  it('no toca la lista original', () => {
    const base = ['a', 'b', 'c'];
    moveItem(base, 0, 2);
    expect(base).toEqual(['a', 'b', 'c']);
  });

  it('con un índice fuera de rango deja la lista como estaba', () => {
    // El splice suelto con -1 sacaba el último elemento sin avisar.
    const base = ['a', 'b', 'c'];
    expect(moveItem(base, -1, 0)).toBe(base);
    expect(moveItem(base, 0, -1)).toBe(base);
    expect(moveItem(base, 0, 3)).toBe(base);
    expect(moveItem(base, 1, 1)).toBe(base);
  });
});

describe('replaceAt', () => {
  it('reemplaza solo el índice pedido', () => {
    const base = [{ n: 1 }, { n: 2 }, { n: 3 }];
    expect(replaceAt(base, 1, { n: 9 })).toEqual([{ n: 1 }, { n: 9 }, { n: 3 }]);
    expect(base[1]).toEqual({ n: 2 });
  });
});
