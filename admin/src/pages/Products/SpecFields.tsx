import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FormField, Input, Select, Switch } from '@tiendafy/ui';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import type { SpecDefinition } from '../Settings/SpecFields';

/** definitionId → valor, siempre como texto (lo interpreta la definición). */
export type SpecValues = Record<string, string>;

/**
 * Los campos de ficha técnica de la tienda, separados en los que aplican a
 * estas categorías y el total. El total sirve para decidir si mostrar la
 * sección: sin ningún campo definido no tiene sentido ocupar lugar.
 */
export function useSpecDefinitions(categoryIds: string[]) {
  const { store } = useStore();
  const { data } = useQuery({
    queryKey: ['spec-definitions', store?.id],
    queryFn: () => api.get<{ items: SpecDefinition[] }>('/api/v1/spec-definitions/'),
    enabled: !!store,
    staleTime: 60_000,
  });

  const all = useMemo(() => data?.items ?? [], [data]);
  const applicable = useMemo(
    () =>
      all.filter((d) => d.categoryIds.length === 0 || d.categoryIds.some((id) => categoryIds.includes(id))),
    [all, categoryIds],
  );

  return { applicable, total: all.length };
}

export function SpecFields({
  definitions,
  values,
  onChange,
}: {
  definitions: SpecDefinition[];
  values: SpecValues;
  onChange: (next: SpecValues) => void;
}) {
  const set = (id: string, value: string) => onChange({ ...values, [id]: value });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {definitions.map((d) => {
        const value = values[d.id] ?? '';
        return (
          <FormField
            key={d.id}
            label={d.unit ? `${d.name} (${d.unit})` : d.name}
            hint={d.filterable ? 'Se usa como filtro del catálogo.' : undefined}
          >
            {d.type === 'LIST' ? (
              <Select
                value={value}
                onChange={(e) => set(d.id, e.target.value)}
                placeholder="Sin definir"
                options={d.options.map((o) => ({ value: o, label: o }))}
              />
            ) : d.type === 'BOOLEAN' ? (
              // Tres estados: sin definir, sí, no. "Sin definir" no es lo mismo
              // que "no", y en una ficha técnica esa diferencia importa.
              <div className="flex h-10 items-center gap-3">
                <Switch
                  aria-label={d.name}
                  checked={value === 'Sí'}
                  onChange={(on) => set(d.id, on ? 'Sí' : 'No')}
                />
                <span className="text-sm text-fg-muted">{value === '' ? 'Sin definir' : value}</span>
                {value !== '' && (
                  <button
                    type="button"
                    onClick={() => set(d.id, '')}
                    className="text-xs text-fg-subtle hover:underline"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            ) : (
              <Input
                value={value}
                onChange={(e) => set(d.id, e.target.value)}
                inputMode={d.type === 'NUMBER' ? 'decimal' : undefined}
                placeholder={d.type === 'NUMBER' ? '0' : 'Sin definir'}
                maxLength={120}
              />
            )}
          </FormField>
        );
      })}
    </div>
  );
}
