import { useState } from 'react';
import { GripVertical, ChevronUp, ChevronDown, ChevronRight, Eye, EyeOff, X, Plus } from 'lucide-react';
import { cn, useConfirm } from '@tiendafy/ui';
import {
  MAX_SECTIONS,
  SECTION_DEFINITIONS,
  SECTION_GROUPS,
  canAddSection,
  createSection,
  sectionDisplayName,
  templateSections,
  type HomeTemplate,
  type SectionType,
  type ThemeConfig,
} from '@tiendafy/types';
import { useFlipList } from '../../../lib/useFlip';
import { moveItem } from '../../../lib/arrays';
import { BackHeader } from '../../theme-editor-inputs';
import { TemplatePicker } from './templates';
import { MiniBlock } from './wireframes';

/* ---- Panel "Página de inicio": lista de secciones (reordenar / ocultar / agregar / quitar) ---- */
export function HomePanel({
  theme,
  onBack,
  onOpenSection,
  updateTheme,
}: {
  theme: ThemeConfig;
  onBack: () => void;
  onOpenSection: (id: string) => void;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
}) {
  const move = (id: string, dir: -1 | 1) =>
    updateTheme((t) => {
      const idx = t.sections.findIndex((s) => s.id === id);
      const next = moveItem(t.sections, idx, idx + dir);
      return next === t.sections ? t : { ...t, sections: next };
    });
  const toggle = (id: string) =>
    updateTheme((t) => ({
      ...t,
      sections: t.sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
    }));

  const reorder = (fromId: string, toId: string) =>
    updateTheme((t) => {
      const from = t.sections.findIndex((s) => s.id === fromId);
      const to = t.sections.findIndex((s) => s.id === toId);
      if (from < 0 || to < 0 || from === to) return t;
      return { ...t, sections: moveItem(t.sections, from, to) };
    });

  const remove = (id: string) =>
    updateTheme((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== id) }));
  // Nace con el contenido de ejemplo del registro: se ve apenas se agrega.
  const addSection = (type: SectionType) =>
    updateTheme((t) => ({ ...t, sections: [...t.sections, createSection(type)] }));

  const listRef = useFlipList<HTMLDivElement>(theme.sections.map((s) => s.id).join(','));
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const confirm = useConfirm();
  const full = theme.sections.length >= MAX_SECTIONS;

  const applyTemplate = async (tpl: HomeTemplate) => {
    if (theme.sections.length > 0) {
      const ok = await confirm({
        title: `Usar plantilla "${tpl.name}"`,
        message:
          'Reemplaza las secciones actuales del inicio por esta estructura. Podés editar cada una después, y deshacerlo con Ctrl+Z.',
        confirmLabel: 'Usar plantilla',
      });
      if (!ok) return;
    }
    updateTheme((t) => ({ ...t, sections: templateSections(tpl) }));
    setShowTemplates(false);
  };

  return (
    <div>
      <BackHeader title="Página de inicio" onBack={onBack} />

      {/* Plantillas curadas: arman una estructura base de secciones de un click. */}
      <div className="px-3 pt-3">
        {showTemplates ? (
          <TemplatePicker onPick={applyTemplate} onClose={() => setShowTemplates(false)} />
        ) : (
          <button
            onClick={() => setShowTemplates(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary/[0.08] py-2.5 text-sm font-semibold text-primary hover:bg-primary/[0.14]"
          >
            Usar una plantilla de inicio
          </button>
        )}
      </div>

      <p className="inline-flex flex-wrap items-center gap-1 px-4 pt-3 text-xs text-fg-muted">
        Arrastrá <GripVertical className="h-3.5 w-3.5" /> para reordenar. El ojo muestra/oculta cada sección.
      </p>
      <div className="p-3" ref={listRef}>
        {theme.sections.length === 0 && (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
            <p>Tu página de inicio está vacía: en la tienda solo se ven el encabezado y el pie.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-primary/40 px-3 text-sm font-medium text-primary hover:bg-primary/[0.05]"
              >
                <Plus className="h-4 w-4" /> Agregar sección
              </button>
              <button
                type="button"
                onClick={() => setShowTemplates(true)}
                className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-primary hover:underline"
              >
                Usar una plantilla
              </button>
            </div>
          </div>
        )}
        {theme.sections.map((s, i) => (
          <div
            key={s.id}
            data-flip-key={s.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', s.id);
              setDragId(s.id);
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setDragId(null);
              reorder(e.dataTransfer.getData('text/plain'), s.id);
            }}
            className={cn(
              'mb-2 flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-2 transition-shadow',
              dragId === s.id ? 'opacity-50 shadow-lg' : 'shadow-none',
            )}
          >
            <span className="cursor-grab select-none text-fg-subtle active:cursor-grabbing" title="Arrastrar">
              <GripVertical className="h-4 w-4" />
            </span>
            <div className="flex flex-col text-fg-subtle">
              <button
                onClick={() => move(s.id, -1)}
                disabled={i === 0}
                aria-label="Subir"
                className="leading-none disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => move(s.id, 1)}
                disabled={i === theme.sections.length - 1}
                aria-label="Bajar"
                className="leading-none disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={() => onOpenSection(s.id)}
              className={cn(
                'min-w-0 flex-1 truncate text-left text-sm',
                !s.visible && 'text-fg-subtle line-through',
              )}
            >
              {sectionDisplayName(s)}
            </button>
            <button onClick={() => toggle(s.id)} aria-label="Mostrar/ocultar">
              {s.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button
              onClick={() => remove(s.id)}
              aria-label="Quitar sección"
              className="text-fg-subtle hover:text-danger"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => onOpenSection(s.id)}
              aria-label="Editar sección"
              className="text-fg-subtle"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="px-3 pb-4">
        {adding ? (
          <AddSectionMenu
            sections={theme.sections}
            onPick={(type) => {
              setAdding(false);
              addSection(type);
            }}
            onClose={() => setAdding(false)}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            disabled={full}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/40 py-2.5 text-sm font-medium text-primary hover:bg-primary/[0.05] disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Agregar sección
          </button>
        )}
        {full && (
          <p className="mt-2 text-xs text-fg-subtle">
            Llegaste al máximo de {MAX_SECTIONS} secciones. Quitá alguna para agregar otra.
          </p>
        )}
      </div>
    </div>
  );
}

/** El menú de "Agregar sección", por grupos y con una línea que explica cada tipo. */
function AddSectionMenu({
  sections,
  onPick,
  onClose,
}: {
  sections: ThemeConfig['sections'];
  onPick: (type: SectionType) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Elegí una sección</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-bg-muted"
        >
          <X className="h-4 w-4 text-fg-subtle" />
        </button>
      </div>
      {SECTION_GROUPS.map((group) => (
        <div key={group} role="group" aria-label={group} className="pb-1">
          <div className="px-2 pb-0.5 pt-2 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-subtle">
            {group}
          </div>
          {SECTION_DEFINITIONS.filter((d) => d.group === group).map((def) => {
            const allowed = canAddSection(sections, def.type);
            return (
              <button
                key={def.type}
                type="button"
                onClick={() => onPick(def.type)}
                disabled={!allowed}
                className="flex w-full items-start gap-2.5 rounded px-2 py-2 text-left hover:bg-bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                <span className="mt-0.5 w-12 shrink-0" aria-hidden>
                  <MiniBlock wireframe={def.wireframe} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-fg">{def.label}</span>
                  <span className="block text-xs text-fg-muted">
                    {allowed ? def.description : 'Ya está en tu inicio: va una sola.'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
