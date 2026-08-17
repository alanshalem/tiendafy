/** Cuerpo de una página CMS del merchant (título + HTML ya sanitizado por el backend). */
export function CmsBody({ title, html }: { title: string; html: string }) {
  return (
    <>
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h1>
      {/* El body ya viene sanitizado del backend (HtmlSanitizer al guardar). */}
      <div className="prose mt-6 max-w-none opacity-80" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
