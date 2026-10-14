import { useMemo, type ComponentType } from 'react';
import {
  LABEL_MAX,
  isSectionType,
  sectionData,
  sectionDefinition,
  sectionDisplayName,
  type ThemeConfig,
  type ThemeSection,
} from '@tiendafy/types';
import { BackHeader, Field, TextInput } from '../../theme-editor-inputs';
import { SECTION_EDITORS } from './registry';
import { SectionStyleFields } from './SectionStyleFields';
import type { SectionEditorProps } from './types';

/**
 * El panel de una sección: su nombre propio arriba, el editor de su tipo en
 * el medio y "Diseño de la sección" abajo. `onChange` recibe la sección
 * entera ya modificada.
 */
export function SectionPanel({
  section,
  onBack,
  onChange,
  theme,
}: {
  section: ThemeSection;
  onBack: () => void;
  onChange: (next: ThemeSection) => void;
  /** El tema entero: algunos editores avisan según otra parte (el newsletter, si el pie ya tiene uno). */
  theme?: ThemeConfig;
}) {
  const def = sectionDefinition(section.type);
  const data = useMemo(() => sectionData(section), [section]);
  const set = (patch: Record<string, unknown>) => onChange({ ...section, data: { ...data, ...patch } });
  const setName = (name: string) => {
    const next = { ...section };
    if (name.trim()) next.name = name.slice(0, LABEL_MAX);
    else delete next.name;
    onChange(next);
  };
  const Editor = isSectionType(section.type)
    ? (SECTION_EDITORS[section.type] as ComponentType<SectionEditorProps>)
    : null;

  return (
    <div>
      <BackHeader title={sectionDisplayName(section)} onBack={onBack} />
      <div className="space-y-4 p-4">
        <Field label="Nombre de la sección" hint="Solo lo ves vos, para ubicarla en la lista.">
          <TextInput value={section.name ?? ''} onChange={setName} placeholder={def?.label ?? section.type} />
        </Field>
        {Editor ? (
          <Editor section={section} data={data} set={set} theme={theme} />
        ) : (
          <p className="rounded-md bg-bg-muted p-2.5 text-xs text-fg-muted">
            Esta sección la creó una versión más nueva del editor. Recargá la página para editarla.
          </p>
        )}
        <SectionStyleFields
          section={section}
          onChange={({ style, hideOn }) => {
            const next = { ...section, style, hideOn };
            if (!style) delete next.style;
            if (!hideOn) delete next.hideOn;
            onChange(next);
          }}
        />
      </div>
    </div>
  );
}
