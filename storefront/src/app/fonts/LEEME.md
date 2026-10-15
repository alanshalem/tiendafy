# Fuentes de la tienda

Las fuentes que el editor de diseño deja elegir: subconjunto latin de Google
Fonts (https://fonts.google.com), en woff2. Todas se distribuyen bajo la SIL
Open Font License 1.1 (https://openfontlicense.org), que permite incluirlas y
servirlas con la app. Están en el repo para que el build no salga a la red.

No se editan a mano. Para bajarlas de nuevo y regenerar `src/app/store-fonts.ts`:

```bash
node storefront/scripts/fetch-store-fonts.mjs
pnpm --filter tiendafy-storefront exec prettier --write src/app/store-fonts.ts
```

Sumar una fuente: agregala a `FONTS` en `storefront/scripts/fetch-store-fonts.mjs`,
corré lo de arriba, y sumala también a `FONT_OPTIONS` y `FONT_FAMILY_CSS` en
`shared/types/src/fonts.ts` (lo que ofrece el editor) y a `SELF_HOSTED` en
`storefront/src/lib/theme-style.ts` (su variable CSS).
