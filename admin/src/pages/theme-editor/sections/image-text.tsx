import { contrastText, type ImageTextData } from '@tiendafy/types';
import { LinkPicker } from '../../../components/LinkPicker';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { imageTextIdeal } from '../../../lib/uploads';
import { Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import { EditorWarning, ratioOptions } from './image-fields';
import type { SectionEditorProps } from './types';

type D = ImageTextData;

export function ImageTextEditor({ section, data, set }: SectionEditorProps<'image-text'>) {
  const alone = !data.title && !data.description && !data.buttonText;
  const ideal = imageTextIdeal(data.ratio, alone);
  // Texto claro sobre la página (sin recuadro oscuro): la tienda le pone uno
  // oscuro para que se lea. Se avisa para que no sorprenda.
  const bg = section.style?.background === 'custom' ? section.style.backgroundColor : undefined;
  const darkSection = !!bg && contrastText(bg) === '255 255 255';
  const autoDark = data.textColor === 'light' && data.textBackground !== 'dark' && !darkSection;
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
      <Field label="Forma de la imagen">
        <Select
          value={data.ratio}
          onChange={(v) => set({ ratio: v as D['ratio'] })}
          options={ratioOptions(['original', '16x9', '4x3', '1x1', '4x5', '3x4'])}
        />
      </Field>

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
          <Field label="Estilo del botón">
            <Select
              value={data.buttonStyle}
              onChange={(v) => set({ buttonStyle: v as D['buttonStyle'] })}
              options={[
                { value: 'solid', label: 'Relleno' },
                { value: 'outline', label: 'Con borde' },
                { value: 'link', label: 'Link subrayado' },
              ]}
            />
          </Field>
        </>
      )}

      {data.image && (
        <>
          <Field label="Imagen en computadora">
            <Select
              value={data.imagePosition}
              onChange={(v) => set({ imagePosition: v as D['imagePosition'] })}
              options={[
                { value: 'left', label: 'A la izquierda del texto' },
                { value: 'right', label: 'A la derecha del texto' },
              ]}
            />
          </Field>
          <Field label="En celular va primero">
            <Select
              value={data.mobileOrder}
              onChange={(v) => set({ mobileOrder: v as D['mobileOrder'] })}
              options={[
                { value: 'image', label: 'La imagen' },
                { value: 'text', label: 'El texto' },
              ]}
            />
          </Field>
          <Field label="Texto respecto de la imagen">
            <Select
              value={data.verticalAlign}
              onChange={(v) => set({ verticalAlign: v as D['verticalAlign'] })}
              options={[
                { value: 'top', label: 'Arriba' },
                { value: 'center', label: 'Al medio' },
                { value: 'bottom', label: 'Abajo' },
              ]}
            />
          </Field>
        </>
      )}
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
