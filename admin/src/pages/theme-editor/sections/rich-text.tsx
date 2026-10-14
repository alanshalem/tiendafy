import { Suspense, useId } from 'react';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { LinkPicker } from '../../../components/LinkPicker';
import { Bone } from '../../../components/Skeleton';
import { lazyComponent } from '../../../lib/lazyPage';
import { Field, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, SideIcon } from './choice-group';
import type { SectionEditorProps } from './types';

// Tiptap pesa ~130 KB comprimido: se baja recién cuando se abre esta sección.
const RichDocEditor = lazyComponent(() => import('./rich-doc-editor').then((m) => m.RichDocEditor));

export function RichTextSectionEditor({ data, set }: SectionEditorProps<'rich-text'>) {
  const bodyLabel = useId();
  return (
    <>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <div>
        <span id={bodyLabel} className="mb-1.5 block text-sm font-medium text-fg">
          Texto
        </span>
        <Suspense
          fallback={
            <div
              role="status"
              aria-label="Cargando el editor…"
              className="rounded-md border border-border p-3"
            >
              <Bone className="mb-3 h-7 w-2/3" />
              <Bone className="h-32 w-full" />
            </div>
          }
        >
          <RichDocEditor value={data.body} onChange={(body) => set({ body })} labelledBy={bodyLabel} />
        </Suspense>
      </div>
      <Field label="Imagen (opcional)">
        <MediaUpload kind="sectionImage" value={data.image} onChange={(image) => set({ image })} />
      </Field>
      {data.image && (
        <ChoiceGroup
          label="Dónde va la imagen"
          hint="En celulares siempre va arriba del texto."
          value={data.imagePosition}
          onChange={(imagePosition) => set({ imagePosition })}
          options={[
            {
              value: 'left',
              label: 'Izquierda',
              title: 'A la izquierda del texto',
              icon: <SideIcon image="left" />,
            },
            {
              value: 'right',
              label: 'Derecha',
              title: 'A la derecha del texto',
              icon: <SideIcon image="right" />,
            },
            { value: 'top', label: 'Arriba', title: 'Arriba del texto', icon: <SideIcon image="top" /> },
          ]}
        />
      )}
      <Field label="Texto del botón (opcional)">
        <TextInput value={data.buttonText} onChange={(v) => set({ buttonText: v })} />
      </Field>
      {data.buttonText.trim() && (
        <LinkPicker label="A dónde lleva el botón" value={data.link} onChange={(link) => set({ link })} />
      )}
    </>
  );
}
