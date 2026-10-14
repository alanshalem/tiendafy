import { MediaUpload } from '../../../components/upload/MediaUpload';
import { LinkPicker } from '../../../components/LinkPicker';
import { Check, Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import { NumberField } from './section-pickers';
import type { SectionEditorProps } from './types';

const TRIGGERS = [
  { value: 'delay', label: 'A los pocos segundos de entrar' },
  { value: 'exit', label: 'Cuando el mouse se va de la página' },
  { value: 'both', label: 'Lo que pase primero' },
];

const FREQUENCIES = [
  { value: 'days', label: 'Cada tantos días' },
  { value: 'session', label: 'Una vez por visita' },
  { value: 'once', label: 'Una sola vez' },
];

export function PromoPopupEditor({ data, set }: SectionEditorProps<'promo-popup'>) {
  return (
    <>
      <p className="rounded-md bg-bg-muted p-2.5 text-xs text-fg-muted">
        Se ve encima de la página, nunca en el checkout ni en la cuenta del cliente. En esta vista previa se
        abre mientras editás esta sección.
      </p>
      <Field label="Imagen">
        <MediaUpload kind="popupImage" value={data.image} onChange={(image) => set({ image })} />
      </Field>
      <Field label="Imagen para celular (opcional)">
        <MediaUpload
          kind="popupImageMobile"
          value={data.mobileImage}
          onChange={(mobileImage) => set({ mobileImage })}
        />
      </Field>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Texto">
        <TextArea value={data.text} onChange={(v) => set({ text: v })} />
      </Field>
      <Field
        label="Código de cupón (opcional)"
        hint="Se muestra con un botón para copiarlo. Crealo en Descuentos."
      >
        <TextInput
          value={data.couponCode}
          onChange={(v) => set({ couponCode: v.toUpperCase().slice(0, 40) })}
        />
      </Field>
      <Check
        label="Pedir el email para el newsletter"
        checked={data.newsletter}
        onChange={(v) => set({ newsletter: v })}
      />
      <Field label="Texto del botón">
        <TextInput
          value={data.buttonText}
          onChange={(v) => set({ buttonText: v })}
          placeholder="Ver productos"
        />
      </Field>
      <LinkPicker label="A dónde lleva el botón" value={data.link} onChange={(link) => set({ link })} />
      <Field
        label="Cuándo aparece"
        hint={
          data.trigger === 'exit'
            ? 'En celulares no hay forma de saber que alguien se va: con esta opción aparece solo en computadoras.'
            : undefined
        }
      >
        <Select
          value={data.trigger}
          onChange={(v) => set({ trigger: v as typeof data.trigger })}
          options={TRIGGERS}
        />
      </Field>
      {data.trigger !== 'exit' && (
        <NumberField
          label="Segundos de espera"
          value={data.delaySeconds}
          min={0}
          max={120}
          suffix="segundos"
          onChange={(delaySeconds) => set({ delaySeconds })}
        />
      )}
      <Field label="Cada cuánto se muestra a la misma persona">
        <Select
          value={data.frequency}
          onChange={(v) => set({ frequency: v as typeof data.frequency })}
          options={FREQUENCIES}
        />
      </Field>
      {data.frequency === 'days' && (
        <NumberField
          label="Volver a mostrarlo después de"
          value={data.frequencyDays}
          min={1}
          max={365}
          suffix="días"
          onChange={(frequencyDays) => set({ frequencyDays })}
        />
      )}
    </>
  );
}
