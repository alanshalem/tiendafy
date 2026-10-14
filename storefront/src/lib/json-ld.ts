/**
 * JSON-LD listo para `<script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />`.
 *
 * JSON.stringify no escapa `<`: un nombre de producto, una pregunta frecuente
 * o una descripción con `</script>` cerraba el script ahí y lo que seguía se
 * interpretaba como HTML de la página (los textos los carga el comercio, o
 * llegan importados de un CSV). Escapados como < siguen siendo el mismo
 * JSON para Google, pero ya no pueden cortar el script. `>` y `&` van por las
 * dudas (comentarios HTML, entidades).
 */
export function jsonLd(data: unknown): { __html: string } {
  return {
    __html: JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'),
  };
}
