import { useState } from 'react';
import { LayoutTemplate, Plus } from 'lucide-react';
import { useConfirm } from '@tiendafy/ui';
import {
  MAX_SECTIONS,
  createSection,
  sectionDisplayName,
  templateSections,
  type HomeTemplate,
  type SectionType,
  type ThemeConfig,
} from '@tiendafy/types';
import { SortableList } from '../../../components/SortableList';
import { BackHeader } from '../../theme-editor-inputs';
import { focusEditorPanel } from '../panelFocus';
import { AddSectionPicker } from './AddSectionPicker';
import { ROW_MAIN_ATTR, SectionRow } from './SectionRow';
import {
  addBlockedReason,
  duplicateSection,
  freshSectionId,
  insertSection,
  moveSection,
  renameSection,
  setSectionHideOn,
  toggleSectionVisible,
} from './sectionOps';
import { TemplatePicker } from './templates';

/** Cuando faltan pocas para el tope, se avisa cuántas van. */
const NEAR_MAX = MAX_SECTIONS - 5;

/** El foco, después de que React dibuje (la fila o el panel todavía no existen). */
const focusSoon = (find: () => HTMLElement | null | undefined) =>
  requestAnimationFrame(() => find()?.focus());

const rowMain = (id: string) => document.querySelector<HTMLElement>(`[${ROW_MAIN_ATTR}="${CSS.escape(id)}"]`);

/* ---- Panel "Página de inicio": la lista de secciones ---- */
export function HomePanel({
  theme,
  onBack,
  onOpenSection,
  onRemoveSection,
  updateTheme,
}: {
  theme: ThemeConfig;
  onBack: () => void;
  /** Abrir el panel de una sección. */
  onOpenSection: (id: string) => void;
  /** Quitarla (el editor ofrece "Deshacer"; ver ThemeEditor). */
  onRemoveSection: (id: string) => void;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
}) {
  const sections = theme.sections;
  // Dónde se va a meter la sección que se elija en el selector (null = cerrado).
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const confirm = useConfirm();
  const addBlocked = addBlockedReason(sections, '');

  const applyTemplate = async (tpl: HomeTemplate) => {
    if (sections.length > 0) {
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

  // Nace con el contenido de ejemplo del registro (se ve apenas se agrega) y
  // se abre su panel: lo siguiente que uno quiere es cambiarle el texto.
  const add = (type: SectionType, at: number) => {
    const section = { ...createSection(type), id: freshSectionId(type, sections) };
    updateTheme(insertSection(section, at));
    setPickerAt(null);
    onOpenSection(section.id);
    focusEditorPanel();
  };

  const where = (at: number) => {
    if (sections.length === 0) return 'Va a ser la primera sección de tu inicio.';
    if (at <= 0) return `Va arriba de todo, antes de «${sectionDisplayName(sections[0]!)}».`;
    if (at >= sections.length) return 'Va al final del inicio.';
    return `Va entre «${sectionDisplayName(sections[at - 1]!)}» y «${sectionDisplayName(sections[at]!)}».`;
  };

  const remove = (id: string, index: number) => {
    // El foco pasa a la fila que queda en su lugar (o a "Agregar sección"):
    // si no, se pierde en la nada y el teclado arranca de nuevo desde arriba.
    const next = sections[index + 1] ?? sections[index - 1];
    onRemoveSection(id);
    focusSoon(() => (next ? rowMain(next.id) : document.getElementById(ADD_BUTTON_ID)));
  };

  return (
    <div>
      <BackHeader title="Página de inicio" onBack={onBack} />

      {/* Plantillas curadas: arman una estructura base de secciones de un click. */}
      <div className="px-3 pt-3">
        {showTemplates ? (
          <TemplatePicker onPick={applyTemplate} onClose={() => setShowTemplates(false)} />
        ) : (
          sections.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-primary/[0.08] text-sm font-semibold text-primary hover:bg-primary/[0.14]"
            >
              <LayoutTemplate className="h-4 w-4" aria-hidden /> Usar una plantilla de inicio
            </button>
          )
        )}
      </div>

      {sections.length === 0 && !showTemplates && (
        <EmptyHome onAdd={() => setPickerAt(0)} onTemplates={() => setShowTemplates(true)} />
      )}

      {sections.length > 0 && (
        <>
          <p className="px-4 pt-3 text-xs text-fg-muted">
            Tocá una sección para editarla. Para ordenarlas, arrastrá la manija o usá el menú ⋯.
          </p>
          <div className="px-3 pt-3">
            <SortableList
              items={sections}
              getId={(s) => s.id}
              onReorder={(from, to) => updateTheme(moveSection(from, to))}
              itemName={(s) => `«${sectionDisplayName(s)}»`}
              className="space-y-2"
              renderItem={(s, { handle, index, isDragging }) => (
                <div className="relative">
                  {!addBlocked && !isDragging && (
                    <InsertPoint
                      label={`Agregar una sección antes de «${sectionDisplayName(s)}»`}
                      onClick={() => setPickerAt(index)}
                    />
                  )}
                  <SectionRow
                    section={s}
                    index={index}
                    total={sections.length}
                    handle={handle}
                    isDragging={isDragging}
                    renaming={renaming === s.id}
                    duplicateBlocked={addBlockedReason(sections, s.type)}
                    addBlocked={addBlocked}
                    actions={{
                      onOpen: () => onOpenSection(s.id),
                      onToggleVisible: () => updateTheme(toggleSectionVisible(s.id)),
                      onStartRename: () => setRenaming(s.id),
                      onRename: (name) => {
                        if (name !== null) updateTheme(renameSection(s.id, name));
                        setRenaming(null);
                        focusSoon(() => rowMain(s.id));
                      },
                      onDuplicate: () => {
                        const dup = duplicateSection(sections, s.id);
                        if (!dup) return;
                        updateTheme(insertSection(dup.copy, dup.at));
                        focusSoon(() => rowMain(dup.copy.id));
                      },
                      onHideOn: (hideOn) => updateTheme(setSectionHideOn(s.id, hideOn)),
                      onMove: (dir) => updateTheme(moveSection(index, index + dir)),
                      onInsert: (pos) => setPickerAt(pos === 'before' ? index : index + 1),
                      onRemove: () => remove(s.id, index),
                    }}
                  />
                </div>
              )}
            />
          </div>
        </>
      )}

      <div className="px-3 pb-6 pt-3">
        {sections.length > 0 && (
          <button
            id={ADD_BUTTON_ID}
            type="button"
            onClick={() => setPickerAt(sections.length)}
            disabled={!!addBlocked}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 text-sm font-medium text-primary hover:bg-primary/[0.05] disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden /> Agregar sección
          </button>
        )}
        {addBlocked ? (
          <p className="mt-2 text-xs text-fg-subtle">{addBlocked}</p>
        ) : (
          sections.length >= NEAR_MAX && (
            <p className="mt-2 text-xs text-fg-subtle">
              {sections.length} de {MAX_SECTIONS} secciones.
            </p>
          )
        )}
      </div>

      {pickerAt !== null && (
        <AddSectionPicker
          sections={sections}
          where={where(pickerAt)}
          onPick={(type) => add(type, pickerAt)}
          onClose={() => setPickerAt(null)}
        />
      )}
    </div>
  );
}

const ADD_BUTTON_ID = 'theme-editor-add-section';

/**
 * "+" entre dos filas: agrega justo ahí. Aparece al pasar el mouse o con el
 * foco del teclado; con el dedo no hay "pasar por encima", así que en
 * pantallas táctiles no está (para eso el menú ⋯ tiene "Agregar arriba/abajo").
 */
function InsertPoint({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="group/insert absolute left-1/2 top-0 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none pointer-coarse:hidden"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-fg shadow-md ring-4 ring-surface group-focus-visible/insert:ring-primary/30">
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </span>
    </button>
  );
}

/** Inicio vacío: qué pasa en la tienda y las dos formas de arrancar. */
function EmptyHome({ onAdd, onTemplates }: { onAdd: () => void; onTemplates: () => void }) {
  return (
    <div className="mx-3 mt-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/[0.08] text-primary">
        <LayoutTemplate className="h-6 w-6" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-fg">Tu página de inicio está vacía</p>
      <p className="mx-auto mt-1 max-w-[16rem] text-xs text-fg-muted">
        En la tienda solo se ven el encabezado y el pie. Arrancá con una plantilla o agregá secciones de a
        una.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          id={ADD_BUTTON_ID}
          type="button"
          onClick={onAdd}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden /> Agregar sección
        </button>
        <button
          type="button"
          onClick={onTemplates}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-fg hover:bg-bg-muted"
        >
          Usar una plantilla
        </button>
      </div>
    </div>
  );
}
