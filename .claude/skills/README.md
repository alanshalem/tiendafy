# Skills del proyecto

Claude Code carga solo `.claude/skills/<nombre>/SKILL.md` (un nivel, carpeta =
`name` del frontmatter). La `description` es lo que ve el modelo para decidir
si la usa: tiene que decir **cuándo** usarla y ser corta, porque todas las
descripciones comparten un presupuesto de contexto.

| Skill | Para qué | Origen |
|---|---|---|
| `afip-overview` | Mapa de ARCA y de su implementación; qué skill afip-* cargar | Propia |
| `afip-setup-certificados` | Certificado, WSASS, relaciones, punto de venta | Propia |
| `afip-wsaa-autenticacion` | TRA, firma CMS, ticket de acceso | Propia |
| `afip-emision-cae` | `FECAESolicitar`, write-ahead, reconciliación | Propia |
| `afip-tipos-comprobantes` | Clase A/B/C y condición frente al IVA válida por clase | Propia |
| `afip-padrones-validaciones` | CUIT, padrón, `FEParamGet*` | Propia |
| `afip-troubleshooting` | TLS, faults y códigos de error | Propia |
| `mercadopago-overview` | Mapa de Mercado Pago, rutas, Payments vs Orders | Propia |
| `mercadopago-oauth-marketplace` | Conectar la cuenta de cada tienda, comisión | Propia |
| `mercadopago-checkout-pro` | Preferences y links de pago | Propia |
| `mercadopago-checkout-api` | Cobro con token de tarjeta, 3DS | Propia |
| `mercadopago-bricks` | Payment y Status Screen Brick en la tienda | Propia |
| `mercadopago-webhooks` | Firma, inbox, topics | Propia |
| `mercadopago-refunds` | Reembolsos y contracargos | Propia |
| `mercadopago-testing-sandbox` | Cuentas y tarjetas de prueba | Propia |
| `seo-audit` | Auditoría SEO de la tienda (en inglés) | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills), `skills/seo-audit`, v2.2.1 (commit `6b9e938`), MIT: ver `seo-audit/LICENSE` |

## Cómo se mantienen

- **Las propias** (afip-*, mercadopago-*): se editan a mano. La fuente de
  verdad del proyecto son `docs/integraciones/arca.md` y
  `docs/integraciones/mercadopago.md`: si se aprende algo de la API real, va
  primero ahí y después a la skill. Lo que dice la skill de la API se contrasta
  con la documentación oficial (links al final de cada `*-overview`); última
  revisión: 16-oct-2026 (manual WSFEv1 v4.7).
- **seo-audit**: copia sin cambios del original. Para actualizarla, bajá
  `skills/seo-audit/` del repo de origen, reemplazá la carpeta (dejando
  `LICENSE`) y actualizá versión y commit en esta tabla. No se usa el CLI
  `skills` (`npx skills`): instala en `.agents/skills/` y deja enlaces en
  `.claude/skills/`, que en Windows y en git no sirven.
- Contenido de terceros solo con una licencia que permita redistribuirlo (el
  repo es público) y con su aviso de copyright. Si no, se enlaza.
- Validar el frontmatter después de editar: tiene que parsear como YAML y
  tener `name` (igual a la carpeta) y `description`.
