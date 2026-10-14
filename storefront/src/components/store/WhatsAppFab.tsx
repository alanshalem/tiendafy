'use client';

/**
 * Botón flotante de WhatsApp. Al pasar el mouse (sólo desktop) abre un mini-chat
 * con estética WhatsApp que previsualiza el mensaje que el cliente va a enviar.
 * En mobile no hay hover: tocar el botón abre WhatsApp directo.
 *
 * Va abajo a la derecha o a la izquierda, y puede llevar un texto al lado
 * ("¿Te ayudamos?"): el ícono solo no le dice a todos que ahí se pregunta.
 */
export function WhatsAppFab({
  phone,
  message,
  storeName,
  logo,
  showPreview,
  position = 'right',
  label = '',
}: {
  phone: string;
  message: string;
  storeName: string;
  logo?: string;
  showPreview: boolean;
  position?: 'right' | 'left';
  label?: string;
}) {
  const left = position === 'left';
  const caption = label.trim();
  const tel = phone.replace(/\D/g, '');
  const text = message || '';
  const href = `https://wa.me/${tel}?text=${encodeURIComponent(text)}`;
  const initial = (storeName || 'T').trim().charAt(0).toUpperCase();

  return (
    // El aviso de consentimiento ocupa el borde inferior mientras está: publica
    // su alto en --tf-consent-h y el botón se corre para no taparle el
    // "Aceptar". Sin el aviso la variable no existe y queda donde siempre.
    <div
      data-tf-focus="whatsapp"
      className={`group fixed z-[70] ${left ? 'left-5' : 'right-5'}`}
      style={{ bottom: 'calc(1.25rem + var(--tf-consent-h, 0px))' }}
    >
      {showPreview && (
        <div
          className={`pointer-events-none invisible absolute bottom-[4.5rem] ${left ? 'left-0' : 'right-0'} w-[19rem] translate-y-2 overflow-hidden rounded-2xl opacity-0 shadow-2xl ring-1 ring-black/10 transition-all duration-200 md:group-hover:pointer-events-auto md:group-hover:visible md:group-hover:translate-y-0 md:group-hover:opacity-100`}
          role="dialog"
          aria-label="Vista previa de WhatsApp"
        >
          {/* Header estilo WhatsApp */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5" style={{ background: '#075E54' }}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 text-sm font-bold text-white">
              {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : initial}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-white">{storeName}</div>
              <div className="flex items-center gap-1 text-[11px] text-white/75">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#25D366]" /> En línea
              </div>
            </div>
          </div>

          {/* Cuerpo del chat (fondo clásico de WhatsApp) */}
          <div className="px-3 py-4" style={{ background: '#E5DDD5' }}>
            {/* Burbuja saliente = el mensaje que se va a enviar */}
            <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-sm bg-[#DCF8C6] px-3 py-2 shadow-sm">
              <p className="whitespace-pre-wrap break-words text-[13px] leading-snug text-gray-800">
                {text || 'Escribí tu mensaje inicial en el editor.'}
              </p>
              <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-500">
                ahora
                <svg
                  viewBox="0 0 16 11"
                  className="h-3 w-3.5 text-[#34B7F1]"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M11.07.65a.5.5 0 0 1 .02.7l-5.4 5.9a.5.5 0 0 1-.72.02L2.4 5.06a.5.5 0 1 1 .68-.73l2.2 2.05L10.37.67a.5.5 0 0 1 .7-.02Zm3.3 0a.5.5 0 0 1 .02.7l-5.4 5.9a.5.5 0 0 1-.71.03l-.36-.33.68-.74.02.02 5.04-5.5a.5.5 0 0 1 .71-.08Z" />
                </svg>
              </span>
            </div>
          </div>

          {/* CTA */}
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white transition-colors hover:brightness-95"
            style={{ background: '#25D366' }}
          >
            <WaGlyph className="h-4 w-4" /> Iniciar chat
          </a>
        </div>
      )}

      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={caption ? `${caption} (WhatsApp)` : 'Escribinos por WhatsApp'}
        className={`flex h-14 items-center justify-center gap-2 rounded-full text-white shadow-lg transition-transform ${
          caption ? 'max-w-[calc(100vw-2.5rem)] pl-3.5 pr-5 hover:scale-105' : 'w-14 hover:scale-110'
        }`}
        style={{ background: '#25D366' }}
      >
        <WaGlyph className={caption ? 'h-7 w-7 shrink-0' : 'h-8 w-8'} />
        {caption && <span className="truncate text-sm font-semibold">{caption}</span>}
      </a>
    </div>
  );
}

function WaGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.519 5.262l-.999 3.648 3.97-1.04zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  );
}
