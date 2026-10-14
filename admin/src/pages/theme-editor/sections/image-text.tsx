import { contrastText, type ImageTextData } from '@tiendafy/types';
import { LinkPicker } from '../../../components/LinkPicker';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { imageTextIdeal } from '../../../lib/uploads';
import { Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, RatioIcon, SideIcon } from './choice-group';
import { EditorWarning, RATIO_LABEL } from './image-fields';
import type { SectionEditorProps } from './types';

type D = ImageTextData;

const RATIOS: D['ratio'][] = ['original', '16x9', '4x3', '1x1', '4x5', '3x4'];

/** Dibujito de un botón: relleno, con borde o un link subrayado. */
function ButtonIcon({ style }: { style: D['buttonStyle'] }) {
  return (
    <svg viewBox="0 0 28 20" width="28" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
      {style === 'solid' && (
        <rect x="3" y="6" width="22" height="8" rx="2" fill="currentColor" opacity=".55" />
      )}
      {style === 'outline' && <rect x="3" y="6" width="22" height="8" rx="2" />}
      {style === 'link' && <path d="M6 13h16" strokeLinecap="round" />}
    </svg>
  );
}

/** El texto va arriba, al medio o abajo respecto de la imagen. */
function VAlignIcon({ at }: { at: D['verticalAlign'] }) {
  const y = at === 'top' ? 4 : at === 'center' ? 9 : 14;
  return (
    <svg viewBox="0 0 28 20" width="28" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="11" height="16" rx="1" fill="currentColor" stroke="none" opacity=".55" />
      <path d={`M16 ${y}h9M16 ${y + 3}h6`} strokeLinecap="round" />
    </svg>
  );
}

export function ImageTextEditor({ section, data, set, theme }: SectionEditorProps<'image-text'>) {
  const alone = !data.title && !data.description && !data.buttonText;
  const ideal = imageTextIdeal(data.ratio, alone);
  // Texto claro sobre una página clara (sin recuadro oscuro): la tienda le
  // pone uno oscuro para que se lea. Se avisa para que no sorprenda. Sobre
  // una tienda oscura no hace falta (lo mismo decide la tienda).
  const custom = section.style?.background === 'custom';
  const bg = custom ? section.style?.backgroundColor : undefined;
  const darkSection = !!bg && contrastText(bg) === '255 255 255';
  const darkPage = !!theme && contrastText(theme.colors.bg) === '255 255 255';
  const autoDark =
    data.textColor === 'light' && data.textBackground !== 'dark' && !darkSection && !(darkPage && !custom);
  return (
    <>
      <Field label="Imagen">
        <MediaUpload
          kind="imageText"
          ideal={data.ratio === 'original' ? undefined : ideal}
          value={data.image}
          onChange={(url) => set({ image: url })}
        />
      </Field>
      <Field label="Imagen para celular (opcional)">
        <MediaUpload
          kind="imageTextMobile"
          ideal={
            data.ratio === 'original'
              ? undefined
              : { width: 1080, height: Math.round((1080 * ideal.height) / ideal.width) }
          }
          value={data.mobileImage}
          onChange={(url) => set({ mobileImage: url })}
        />
      </Field>
      <Field label="Texto alternativo" hint="Qué muestra la foto. Lo leen los lectores de pantalla y Google.">
        <TextInput value={data.alt} onChange={(v) => set({ alt: v })} />
      </Field>
      <ChoiceGroup
        label="Forma de la imagen"
        value={data.ratio}
        onChange={(ratio) => set({ ratio })}
        options={RATIOS.map((r) => ({
          value: r,
          label: r === 'original' ? 'Original' : r.replace('x', ':'),
          title: RATIO_LABEL[r],
          icon: <RatioIcon ratio={r} />,
        }))}
        columns={3}
      />

      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Descripción">
        <TextArea value={data.description} onChange={(v) => set({ description: v })} />
      </Field>
      <Field label="Texto del botón">
        <TextInput value={data.buttonText} onChange={(v) => set({ buttonText: v })} />
      </Field>
      {data.buttonText && (
        <>
          <LinkPicker
            label="Link del botón"
            value={data.link}
            onChange={(link) => set({ link })}
            newTab={data.newTab}
            onNewTabChange={(newTab) => set({ newTab })}
          />
          {!data.link && <EditorWarning>El botón aparece cuando le elegís un link.</EditorWarning>}
          <ChoiceGroup
            label="Estilo del botón"
            value={data.buttonStyle}
            onChange={(buttonStyle) => set({ buttonStyle })}
            options={[
              { value: 'solid', label: 'Relleno', icon: <ButtonIcon style="solid" /> },
              { value: 'outline', label: 'Con borde', icon: <ButtonIcon style="outline" /> },
              { value: 'link', label: 'Link', title: 'Link subrayado', icon: <ButtonIcon style="link" /> },
            ]}
          />
        </>
      )}

      <ChoiceGroup
        label="Imagen en computadora"
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
        ]}
      />
      <ChoiceGroup
        label="En celular va primero"
        value={data.mobileOrder}
        onChange={(mobileOrder) => set({ mobileOrder })}
        options={[
          { value: 'image', label: 'La imagen', icon: <SideIcon image="top" /> },
          {
            value: 'text',
            label: 'El texto',
            icon: (
              <svg
                viewBox="0 0 28 20"
                width="28"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M8 3.5h12M8 7h8" strokeLinecap="round" />
                <rect
                  x="7"
                  y="10"
                  width="14"
                  height="8"
                  rx="1"
                  fill="currentColor"
                  stroke="none"
                  opacity=".55"
                />
              </svg>
            ),
          },
        ]}
      />
      <ChoiceGroup
        label="Texto respecto de la imagen"
        value={data.verticalAlign}
        onChange={(verticalAlign) => set({ verticalAlign })}
        options={[
          { value: 'top', label: 'Arriba', icon: <VAlignIcon at="top" /> },
          { value: 'center', label: 'Al medio', icon: <VAlignIcon at="center" /> },
          { value: 'bottom', label: 'Abajo', icon: <VAlignIcon at="bottom" /> },
        ]}
      />
      <Field label="Fondo del texto">
        <Select
          value={data.textBackground}
          onChange={(v) => set({ textBackground: v as D['textBackground'] })}
          options={[
            { value: 'none', label: 'Ninguno' },
            { value: 'subtle', label: 'Gris suave' },
            { value: 'accent', label: 'Color de la marca, suave' },
            { value: 'dark', label: 'Oscuro (texto blanco)' },
          ]}
        />
      </Field>
      <Field label="Color del texto">
        <Select
          value={data.textColor}
          onChange={(v) => set({ textColor: v as D['textColor'] })}
          options={[
            { value: 'dark', label: 'El de la tienda' },
            { value: 'light', label: 'Claro' },
          ]}
        />
      </Field>
      {autoDark && (
        <EditorWarning>
          El texto claro no se lee sobre la página clara: la tienda le pone un recuadro oscuro. Para que vaya
          sin recuadro, elegí un fondo oscuro en «Diseño de la sección».
        </EditorWarning>
      )}
    </>
  );
}
