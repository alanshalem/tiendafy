"""Cobertura del backend: une los reportes de cobertura y resume por proyecto.

Uso:
    python tools/coverage.py <carpeta-con-cobertura> [--top N] [--min PCT] [--scope REGEX]

Lee todos los coverage.cobertura.xml bajo la carpeta (unit e integración) y
los UNE por archivo y línea, quedándose con la máxima cantidad de hits. Sumar
los reportes por separado contaría dos veces la misma línea —una vez cubierta
y otra no— y hundiría el porcentaje.

Excluye lo que no es código escrito a mano: migraciones de EF, snapshots del
modelo, factories de design-time y el código que genera el compilador.

Con --min, sale con código 1 si la cobertura del alcance queda por debajo:
sirve de ratchet en CI.
"""
import argparse
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

EXCLUDED = re.compile(
    r'([\\/]Migrations[\\/])|(\.Designer\.cs$)|(ModelSnapshot\.cs$)|(DesignTimeFactory\.cs$)|'
    r'([\\/]obj[\\/])|(\.g\.cs$)|(GlobalUsings)'
)


def load(folder):
    """{(proyecto, archivo): {línea: hits}} unido entre todos los reportes."""
    lines = defaultdict(dict)
    for path in glob.glob(os.path.join(folder, '**', 'coverage.cobertura.xml'), recursive=True):
        root = ET.parse(path).getroot()
        for package in root.iter('package'):
            project = package.get('name', '?')
            for cls in package.iter('class'):
                filename = cls.get('filename', '')
                if EXCLUDED.search(filename):
                    continue
                bucket = lines[(project, filename)]
                for line in cls.iter('line'):
                    number = int(line.get('number'))
                    hits = int(line.get('hits', '0'))
                    bucket[number] = max(bucket.get(number, 0), hits)
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--top', type=int, default=0, help='archivos con más líneas sin cubrir')
    ap.add_argument('--min', type=float, default=None, help='piso de cobertura del alcance')
    ap.add_argument('--scope', default='.*', help='regex sobre el nombre del proyecto')
    args = ap.parse_args()

    lines = load(args.folder)
    scope = re.compile(args.scope)

    per_project = defaultdict(lambda: [0, 0])
    per_file = []
    for (project, filename), bucket in lines.items():
        covered = sum(1 for h in bucket.values() if h > 0)
        per_project[project][0] += covered
        per_project[project][1] += len(bucket)
        per_file.append((len(bucket) - covered, covered, len(bucket), project, filename))

    total_c = total_n = 0
    print('%-42s %8s %14s' % ('proyecto', 'cobert.', 'líneas'))
    for project in sorted(per_project, key=lambda p: per_project[p][0] / max(1, per_project[p][1])):
        c, n = per_project[project]
        if not scope.search(project):
            continue
        total_c += c
        total_n += n
        print('%-42s %7.1f%% %6d/%-6d' % (project, 100 * c / max(1, n), c, n))
    pct = 100 * total_c / max(1, total_n)
    print('%-42s %7.1f%% %6d/%-6d' % ('TOTAL (alcance)', pct, total_c, total_n))

    if args.top:
        print('\nArchivos con más líneas sin cubrir:')
        for missing, c, n, project, filename in sorted(per_file, reverse=True)[: args.top]:
            if scope.search(project):
                print('  %4d sin cubrir  %5.1f%%  %s' % (missing, 100 * c / max(1, n), filename.split('src')[-1]))

    if args.min is not None and pct < args.min:
        print('\nCobertura %.1f%% por debajo del piso %.1f%%' % (pct, args.min))
        sys.exit(1)


if __name__ == '__main__':
    main()
