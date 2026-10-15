#!/usr/bin/env node
/**
 * Verificación completa en local: lo mismo que CI, en fases y con el
 * paralelismo que aguanta la máquina.
 *
 *   pnpm verify               todo (frontend + backend)
 *   pnpm verify --front       solo panel, tienda y tipos compartidos
 *   pnpm verify --back        solo el backend
 *   pnpm verify --coverage    los tests del front con cobertura (como CI)
 *   pnpm verify --seq         todo de a uno (máquina cargada)
 *
 * Por qué en fases: las suites del front miden tiempos (findBy, debounces) y
 * fallan si comparten CPU con un build, así que nunca corren junto a uno. Las
 * dos suites sí corren juntas cuando hay RAM: medido el 15-oct, con 6 workers
 * el panel pide ~3,3 GB y la tienda ~2,2 GB. El tope de workers de cada suite
 * sale de test-fixtures/workers.ts; acá se reparte cuando corren a la vez.
 *
 * Cada paso escribe su log en .verify/<paso>.log; al final, una tabla y la
 * cola del log de lo que falló.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOGS = path.join(ROOT, '.verify');
const args = new Set(process.argv.slice(2));
const front = !args.has('--back');
const back = !args.has('--front');
const coverage = args.has('--coverage');
const sequential = args.has('--seq');

const GB = 2 ** 30;
const freeGb = () => os.freemem() / GB;
/** RAM libre para correr las dos suites del front juntas (pico medido ~5,5 GB + margen). */
const BOTH_SUITES_GB = 8;
/** RAM libre para los builds en paralelo (next + dotnet + vite ~5 GB + margen). */
const PARALLEL_BUILDS_GB = 7;

fs.rmSync(LOGS, { recursive: true, force: true });
fs.mkdirSync(LOGS, { recursive: true });

const results = [];
const children = new Set();
let minFree = freeGb();
const sampler = setInterval(() => (minFree = Math.min(minFree, freeGb())), 2000);

/** Corre un comando; nunca tira: anota el resultado y sigue. */
function run(name, cmd, cwd = '.') {
  const started = Date.now();
  const log = fs.createWriteStream(path.join(LOGS, `${name}.log`));
  process.stdout.write(`  ▶ ${name}\n`);
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd: path.join(ROOT, cwd),
      shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    children.add(child);
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    child.on('close', (code) => {
      children.delete(child);
      const secs = Math.round((Date.now() - started) / 1000);
      results.push({ name, ok: code === 0, secs });
      process.stdout.write(`  ${code === 0 ? '✓' : '✗'} ${name} (${secs} s)\n`);
      log.end(resolve);
    });
  });
}

/** Varios pasos a la vez, o de a uno con --seq. */
async function phase(title, steps, { parallel = true } = {}) {
  console.log(`\n${title}${parallel && !sequential && steps.length > 1 ? ' (en paralelo)' : ''}`);
  if (parallel && !sequential) await Promise.all(steps.map((s) => run(...s)));
  else for (const s of steps) await run(...s);
}

function stopAll() {
  for (const child of children) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      else child.kill('SIGTERM');
    } catch {
      /* ya terminó */
    }
  }
}
process.on('SIGINT', () => {
  console.log('\nCortado: frenando lo que estaba corriendo…');
  stopAll();
  process.exit(130);
});

const t0 = Date.now();
console.log(
  `Verificación (${os.availableParallelism()} núcleos, ${freeGb().toFixed(1)} GB libres${sequential ? ', de a uno' : ''})`,
);

if (front) {
  await phase('Formato, lint y tipos', [
    ['prettier', 'npx prettier --check .'],
    ['lint-panel', 'npx eslint src', 'admin'],
    ['lint-tienda', 'npx eslint src', 'storefront'],
    ['tipos-panel', 'npx tsc --noEmit -p tsconfig.json', 'admin'],
    ['tipos-tienda', 'npx next typegen && npx tsc --noEmit -p .', 'storefront'],
    ['tipos-types', 'npx tsc --noEmit -p .', 'shared/types'],
    ['tipos-ui', 'npx tsc --noEmit -p .', 'shared/ui'],
    ['tipos-e2e', 'npx tsc --noEmit -p .', 'e2e'],
  ]);

  // Las dos suites juntas solo con RAM de sobra; cada una con la mitad de los
  // workers que tendría sola. Si no, de a una con el tope normal.
  const together = !sequential && freeGb() >= BOTH_SUITES_GB;
  const workers = together ? Math.max(2, Math.round(os.availableParallelism() * 0.25)) : undefined;
  const vitest = `npx vitest run${coverage ? ' --coverage' : ''}${workers ? ` --maxWorkers=${workers}` : ''}`;
  await phase(
    `Tests del panel y de la tienda${together ? ` (${workers} workers cada una)` : ''}`,
    [
      ['tests-panel', vitest, 'admin'],
      ['tests-tienda', vitest, 'storefront'],
    ],
    { parallel: together },
  );
}

// Builds: CPU a full, pero sin tests que midan tiempos al lado.
const builds = [];
if (front)
  builds.push(['build-tienda', 'npx next build', 'storefront'], ['build-panel', 'npx vite build', 'admin']);
if (back)
  builds.push([
    'build-backend',
    'dotnet build backend.slnx -c Release -warnaserror --no-incremental',
    'backend',
  ]);
await phase('Builds', builds, { parallel: freeGb() >= PARALLEL_BUILDS_GB });

if (back) {
  const built = results.find((r) => r.name === 'build-backend')?.ok;
  if (built) {
    await phase('Backend: formato y tests unitarios', [
      ['format-backend', 'dotnet format backend.slnx --verify-no-changes --no-restore', 'backend'],
      ['tests-unitarios', 'dotnet test tests/UnitTests -c Release --no-build', 'backend'],
    ]);
    // Los de integración levantan Postgres en Docker: solos.
    await phase('Backend: tests de integración', [
      ['tests-integracion', 'dotnet test tests/IntegrationTests -c Release --no-build', 'backend'],
    ]);
  } else {
    console.log('\nBackend: sin build no hay tests (ver .verify/build-backend.log)');
  }
}

clearInterval(sampler);
const failed = results.filter((r) => !r.ok);
const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`\n${'─'.repeat(52)}`);
for (const r of results)
  console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(22)} ${String(r.secs).padStart(5)} s`);
console.log(`${'─'.repeat(52)}\n${mins} min · RAM libre mínima ${minFree.toFixed(1)} GB · logs en .verify/`);

for (const r of failed) {
  const lines = fs
    .readFileSync(path.join(LOGS, `${r.name}.log`), 'utf8')
    .trimEnd()
    .split('\n');
  console.log(`\n✗ ${r.name} — últimas líneas de .verify/${r.name}.log:\n${lines.slice(-20).join('\n')}`);
}
console.log(failed.length ? `\n${failed.length} paso(s) fallaron.` : '\nTodo en verde.');
process.exit(failed.length ? 1 : 0);
