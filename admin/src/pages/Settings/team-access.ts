import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Perm, PermissionInfo } from '../../lib/access';

/** Un rol en esta tienda: lo que puede y lo que trae de fábrica. */
export interface RoleRow {
  role: string;
  label: string;
  summary: string;
  rank: number;
  permissions: Perm[];
  defaults: Perm[];
}

/** GET /api/v1/members/roles: el catálogo entero y la matriz de la tienda. */
export interface AccessMatrix {
  groups: string[];
  permissions: PermissionInfo[];
  roles: RoleRow[];
}

export const OWNER = 'owner';

export const MATRIX_KEY = ['access-matrix'] as const;

/**
 * La matriz de la tienda activa, tal cual la usa el backend en cada request.
 * La pantalla de roles la edita: cada cambio la invalida.
 */
export function useAccessMatrix() {
  return useQuery({
    queryKey: MATRIX_KEY,
    queryFn: () => api.get<AccessMatrix>('/api/v1/members/roles'),
    retry: false,
  });
}

/** Color de la etiqueta de cada rol (los textos vienen del backend). */
export const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-700',
  admin: 'bg-purple-100 text-purple-700',
  vendedor: 'bg-sky-100 text-sky-700',
  catalogo: 'bg-green-100 text-green-700',
  finanzas: 'bg-blue-100 text-blue-700',
  soporte: 'bg-rose-100 text-rose-700',
};

/** Las claves sensibles del catálogo. */
export const sensitiveKeys = (matrix: AccessMatrix | undefined): Set<string> =>
  new Set((matrix?.permissions ?? []).filter((p) => p.sensitive).map((p) => p.key));

/**
 * ¿Puede esta persona cambiar este permiso? Las mismas reglas que el backend
 * (TeamRules): nada que sea solo del dueño, y nadie da ni quita lo que no
 * tiene. El backend igual lo valida: esto solo evita ofrecer lo que va a fallar.
 */
export function canChange(
  perm: PermissionInfo,
  me: { isOwner: boolean; can: (p: Perm) => boolean },
): boolean {
  return !perm.ownerOnly && (me.isOwner || me.can(perm.key));
}
