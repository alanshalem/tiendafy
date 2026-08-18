// ESLint (flat config) del admin: foco en reglas que cazan bugs reales
// (hooks, correctness). El estilo lo maneja Prettier y los tipos tsc.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // tsc ya reporta unused/undef con mejor precisión sobre TypeScript.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Las recommended de ts-eslint 8 traen varias estilísticas — mismo
      // criterio de siempre: no duplicar lo que tsc/Prettier ya cubren.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // Reglas nuevas del React Compiler (v7 del plugin): advisorias para este
      // codebase — setState en effects de carga de datos es un patrón usado a
      // consciencia acá. Quedan visibles como warning, no bloquean.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
);
