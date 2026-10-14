import { parseVideoEmbed, type InstagramData, type VideoEmbed } from '@tiendafy/types';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { Field, TextArea, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, RatioIcon, type Choice } from './choice-group';
import type { SectionEditorProps } from './types';

const ASPECTS: Choice<InstagramData['aspect']>[] = [
  {
    value: 'auto',
    label: 'Auto',
    title: 'Automático (vertical para Shorts)',
    icon: <RatioIcon ratio="auto" />,
  },
  { value: '16:9', label: '16:9', title: 'Horizontal (16:9)', icon: <RatioIcon ratio="16:9" /> },
  { value: '9:16', label: '9:16', title: 'Vertical (9:16)', icon: <RatioIcon ratio="9:16" /> },
  { value: '1:1', label: '1:1', title: 'Cuadrado (1:1)', icon: <RatioIcon ratio="1:1" /> },
];

/** Qué va a mostrar la tienda con el link pegado, en castellano. */
function describe(embed: VideoEmbed): string {
  switch (embed.kind) {
    case 'youtube':
      return embed.short ? 'Short de YouTube (se ve vertical).' : 'Video de YouTube.';
    case 'vimeo':
      return 'Video de Vimeo.';
    case 'instagram':
      return 'Publicación de Instagram.';
    case 'instagram-profile':
      return `Perfil @${embed.user}: Instagram no deja mostrar el feed, va una tarjeta con un botón al perfil.`;
  }
}

/**
 * Un video de YouTube o Vimeo, o una publicación o perfil de Instagram. El
 * link se revisa mientras se pega (con lo mismo que usa la tienda): antes uno
 * que no se podía mostrar terminaba como un recuadro gris en la portada.
 */
export function InstagramEditor({ data, set }: SectionEditorProps<'instagram'>) {
  const url = data.video.trim();
  const embed = url ? parseVideoEmbed(url) : null;
  return (
    <>
      <Field
        label="Link del video o la publicación"
        hint="YouTube (también Shorts), Vimeo, o un post o reel de Instagram."
      >
        <TextInput
          type="url"
          value={data.video}
          onChange={(v) => set({ video: v })}
          placeholder="https://youtube.com/watch?v=…"
        />
      </Field>
      {url &&
        (embed ? (
          <p role="status" className="flex items-start gap-1.5 text-xs text-success">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {describe(embed)}
          </p>
        ) : (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-danger">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            Este link no se puede mostrar en la tienda. Copiá el link del video desde YouTube o Vimeo
            (Compartir → Copiar enlace), o el de una publicación de Instagram.
          </p>
        ))}
      <Field label="Título (opcional)">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Texto debajo (opcional)">
        <TextArea value={data.caption} onChange={(v) => set({ caption: v })} />
      </Field>
      {embed?.kind !== 'instagram' && embed?.kind !== 'instagram-profile' && (
        <ChoiceGroup
          label="Proporción del video"
          hint={
            data.aspect === 'auto'
              ? 'Automático: vertical para los Shorts, horizontal para el resto.'
              : undefined
          }
          value={data.aspect}
          onChange={(aspect) => set({ aspect })}
          options={ASPECTS}
        />
      )}
    </>
  );
}
