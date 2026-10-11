// Regenera test-fixtures/api.json: las respuestas reales de la API sobre la
// tienda sembrada, que usan los tests de componentes del admin y del
// storefront. Corre el exportador de los tests de integración (necesita el
// Postgres de desarrollo levantado) y deja el archivo formateado.
//
//   pnpm fixtures:api
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'test-fixtures', 'api.json');

execFileSync(
  'dotnet',
  ['test', 'backend/tests/IntegrationTests', '--filter', 'FullyQualifiedName~ApiFixturesExport'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, TIENDAFY_EXPORT_FIXTURES: target } },
);
execFileSync('pnpm', ['exec', 'prettier', '--write', target], { cwd: root, stdio: 'inherit', shell: true });
console.log(`Fixtures actualizadas: ${path.relative(root, target)}`);
