/**
 * XMLHttpRequest sobre el `fetch` del test.
 *
 * Las subidas del panel van por XHR (es lo único que informa el avance del
 * envío), pero las respuestas simuladas de la API viven en `fetch` (ver
 * test/api.ts). Este XHR le pasa cada pedido al `fetch` vigente —el que haya
 * instalado el test, con sus `on(...)`— así una subida se ve igual que
 * cualquier otro pedido: queda en `api.calls` y responde lo que diga el test.
 *
 * El avance: al mandar informa la mitad y al responder, el total. Alcanza
 * para ver la barra a mitad de camino mientras el test retiene la respuesta.
 */
type Handler = (() => void) | null;

class FetchBackedXHR {
  status = 0;
  responseText = '';
  withCredentials = false;
  onload: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } =
    {
      onprogress: null,
    };

  private method = 'GET';
  private url = '';
  private headers: Record<string, string> = {};
  private aborted = false;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  abort() {
    if (this.aborted) return;
    this.aborted = true;
    this.onabort?.();
  }

  send(body?: BodyInit | null) {
    const total = body instanceof FormData ? sizeOf(body) : 1;
    queueMicrotask(() => {
      if (!this.aborted) this.upload.onprogress?.({ lengthComputable: true, loaded: total / 2, total });
    });
    globalThis
      .fetch(this.url, {
        method: this.method,
        headers: this.headers,
        body,
        credentials: this.withCredentials ? 'include' : 'same-origin',
      })
      .then(async (res) => {
        if (this.aborted) return;
        this.upload.onprogress?.({ lengthComputable: true, loaded: total, total });
        this.status = res.status;
        this.responseText = await res.text();
        this.onload?.();
      })
      .catch(() => {
        if (!this.aborted) this.onerror?.();
      });
  }
}

function sizeOf(form: FormData): number {
  let bytes = 0;
  form.forEach((value) => {
    bytes += typeof value === 'string' ? value.length : value.size;
  });
  return Math.max(bytes, 1);
}

export function installFetchBackedXhr() {
  globalThis.XMLHttpRequest = FetchBackedXHR as unknown as typeof XMLHttpRequest;
}
