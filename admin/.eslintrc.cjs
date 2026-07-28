/**
 * ESLint del admin: foco en reglas que cazan bugs reales (hooks, correctness).
 * El estilo lo maneja Prettier y los tipos los maneja tsc — acá no se duplica.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:react-hooks/recommended'],
  env: { browser: true, es2022: true, node: true },
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
  rules: {
    // tsc ya reporta unused/undef con mejor precisión sobre TypeScript.
    'no-unused-vars': 'off',
    'no-undef': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'react-hooks/exhaustive-deps': 'warn',
  },
};
