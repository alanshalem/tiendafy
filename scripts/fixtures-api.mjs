// Regenera test-fixtures/api.json: las respuestas reales de la API sobre la
// tienda sembrada, que usan los tests de componentes del admin y del
// storefront. Corre el exportador de los tests de integración (necesita el
// Postgres de desarrollo levantado) y deja el archivo formateado.
//
//   pnpm fixtures:api
//
// - En Release: el build de Debug es el mismo que usa la API de desarrollo
//   (`dotnet run` en backend/src/Api) y con la API levantada los DLL están
//   tomados; así se regenera sin apagarla.
// - En su propia base (tiendafy_fixtures), no en la de los tests de
//   integración: una corrida de `pnpm verify --back` al mismo tiempo no la
//   pisa. TIENDAFY_TEST_DB la cambia, como en el resto de la suite.
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'test-fixtures', 'api.json');
const database =
  process.env.TIENDAFY_TEST_DB ??
  'Host=localhost;Port=5432;Database=tiendafy_fixtures;Username=tiendafy;Password=tiendafy';

execFileSync(
  'dotnet',
  [
    'test',
    'backend/tests/IntegrationTests',
    '-c',
    'Release',
    '--filter',
    'FullyQualifiedName~ApiFixturesExport',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, TIENDAFY_EXPORT_FIXTURES: target, TIENDAFY_TEST_DB: database },
  },
);
execSync(`pnpm exec prettier --write "${target}"`, { cwd: root, stdio: 'inherit' });
console.log(`Fixtures actualizadas: ${path.relative(root, target)}`);
