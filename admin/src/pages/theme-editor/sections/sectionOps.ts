import {
  LABEL_MAX,
  MAX_SECTIONS,
  canAddSection,
  isSectionType,
  sectionDisplayName,
  type SectionHideOn,
  type ThemeConfig,
  type ThemeSection,
} from '@tiendafy/types';
import { moveItem } from '../../../lib/arrays';

/*
 * Lo que la lista de secciones del inicio le hace al tema, como funciones
 * puras (tema → tema). La lista, el menú ⋯ de cada fila y el tacho de la
 * vista previa usan las mismas: antes cada botón tenía su propio
 * `updateTheme((t) => …)` escrito a mano y el tacho del preview borraba
 * distinto que la X de la lista.
 */

type Sections = ThemeConfig['sections'];
type Update = (t: ThemeConfig) => ThemeConfig;
const withSections = (t: ThemeConfig, sections: Sections): ThemeConfig =>
  sections === t.sections ? t : { ...t, sections };

/** Un id que no está en la lista (los ids repetidos rompían el editor). */
export function freshSectionId(type: string, sections: Sections): string {
  const taken = new Set(sections.map((s) => s.id));
  for (;;) {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
}

/** Mete una sección en la posición `at` (al final si se pasa de largo). */
export const insertSection =
  (section: ThemeSection, at: number): Update =>
  (t) => {
    if (t.sections.some((s) => s.id === section.id)) return t;
    const i = Math.max(0, Math.min(at, t.sections.length));
    return withSections(t, [...t.sections.slice(0, i), section, ...t.sections.slice(i)]);
  };

export const removeSection =
  (id: string): Update =>
  (t) =>
    withSections(t, t.sections.some((s) => s.id === id) ? t.sections.filter((s) => s.id !== id) : t.sections);

export const moveSection =
  (from: number, to: number): Update =>
  (t) =>
    withSections(t, moveItem(t.sections, from, to));

const patchSection =
  (id: string, patch: (s: ThemeSection) => ThemeSection): Update =>
  (t) =>
    withSections(
      t,
      t.sections.map((s) => (s.id === id ? patch(s) : s)),
    );

export const toggleSectionVisible = (id: string): Update =>
  patchSection(id, (s) => ({ ...s, visible: !s.visible }));

/** Nombre propio: vacío = el del tipo (se borra la clave, como en el panel de la sección). */
export const renameSection = (id: string, name: string): Update =>
  patchSection(id, (s) => {
    const next = { ...s };
    const clean = name.trim().slice(0, LABEL_MAX);
    if (clean) next.name = clean;
    else delete next.name;
    return next;
  });

/** En qué dispositivo NO se ve. `undefined` = en todos. */
export const setSectionHideOn = (id: string, hideOn: SectionHideOn | undefined): Update =>
  patchSection(id, (s) => {
    const next = { ...s };
    if (hideOn) next.hideOn = hideOn;
    else delete next.hideOn;
    return next;
  });

/**
 * Por qué no entra otra sección de este tipo, o `null` si entra. La razón se
 * muestra al lado de la opción apagada: un botón gris sin explicación parece
 * roto.
 */
export function addBlockedReason(sections: Sections, type: string): string | null {
  if (sections.length >= MAX_SECTIONS)
    return `Llegaste al máximo de ${MAX_SECTIONS} secciones. Quitá alguna para agregar otra.`;
  if (isSectionType(type) && !canAddSection(sections, type)) return 'Ya está en tu inicio: va una sola.';
  return null;
}

/**
 * Copia de una sección justo debajo de la original, con id nuevo y "(copia)"
 * en el nombre (si no, en la lista se ven dos iguales y no se sabe cuál es
 * cuál). `null` si no entra (tope o "una por página").
 */
export function duplicateSection(sections: Sections, id: string): { at: number; copy: ThemeSection } | null {
  const i = sections.findIndex((s) => s.id === id);
  const src = sections[i];
  if (!src || addBlockedReason(sections, src.type)) return null;
  const copy = JSON.parse(JSON.stringify(src)) as ThemeSection;
  copy.id = freshSectionId(src.type, sections);
  copy.name = `${sectionDisplayName(src)} (copia)`.slice(0, LABEL_MAX);
  return { at: i + 1, copy };
}
