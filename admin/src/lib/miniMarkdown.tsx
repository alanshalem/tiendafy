import type { ReactNode } from 'react';

/**
 * Markdown mínimo para la respuesta del asistente. Arma elementos de React, nunca HTML: lo que el modelo
 * escriba (o lo que venga de un nombre de producto) se ve como texto. No carga nada: un link se ve como su
 * texto y una imagen como su descripción.
 */

// Imagen, link, negrita y código, en ese orden: la imagen tiene que ganarle al link por el "!".
const INLINE = /!\[([^\]]*)\]\([^)]*\)|\[([^\]]*)\]\([^)]*\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [, alt, label, bold, code] = match;
    if (alt !== undefined) out.push(alt);
    else if (label !== undefined) out.push(label);
    else if (bold !== undefined) out.push(<strong key={key++}>{bold}</strong>);
    else if (code !== undefined) out.push(<code key={key++}>{code}</code>);
    last = at + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableRow = (line: string) => line.trim().startsWith('|') && line.trim().endsWith('|');
const isTableRule = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes('-');
const cells = (line: string) =>
  line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
const bullet = /^\s*[-*]\s+(.*)$/;
const numbered = /^\s*\d+\.\s+(.*)$/;
const heading = /^\s*#{1,3}\s+(.*)$/;

export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <table key={key++} className="my-2 w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {head.map((c, n) => (
                <th key={n} className="border-b border-border px-2 py-1 font-semibold">
                  {inline(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, n) => (
                  <td key={n} className="border-b border-border px-2 py-1">
                    {inline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    const listKind = bullet.test(line) ? 'ul' : numbered.test(line) ? 'ol' : null;
    if (listKind) {
      const pattern = listKind === 'ul' ? bullet : numbered;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++].replace(pattern, '$1'));
      const Tag = listKind;
      blocks.push(
        <Tag key={key++} className={`my-1 ml-5 ${listKind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </Tag>,
      );
      continue;
    }

    const title = heading.exec(line);
    if (title) {
      blocks.push(
        <p key={key++} className="my-1 font-semibold">
          {inline(title[1])}
        </p>,
      );
      i++;
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i]) &&
      !heading.test(lines[i]) &&
      !isTableRow(lines[i])
    )
      paragraph.push(lines[i++]);
    blocks.push(
      <p key={key++} className="my-1">
        {paragraph.map((p, n) => (
          <span key={n}>
            {n > 0 && <br />}
            {inline(p)}
          </span>
        ))}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}
