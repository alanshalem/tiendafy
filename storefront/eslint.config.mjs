// ESLint (flat config) del storefront: reglas de Next + hooks. Mismo criterio
// que el admin: estilo → Prettier, tipos → tsc; acá solo bugs reales.
import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/**'] },
  ...nextVitals,
  {
    rules: {
      // Imágenes de MinIO por URL dinámica y links de tienda multi-tenant:
      // decisiones conscientes, no descuidos.
      '@next/next/no-img-element': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // Regla nueva del React Compiler: advisoria acá — setState en effects
      // de hidratación/carga es patrón consciente (igual criterio que admin).
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
