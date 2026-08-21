# 15 — Hallazgos verificados contra la API real

> Verificado el 2026-08-21 haciendo llamadas reales contra `apis.andreani.com`
> y `apisqa.andreani.com`, usando el contrato de ejemplo `300006611` que
> aparece en la documentación pública.
>
> **Cierra el GAP-01**, que era el más grave del relevamiento: el contrato de
> cotización no estaba documentado y bloqueaba el checkout.

---

## 1. El path de cotización es `/v1/tarifas` — **GAP-01 cerrado**

La documentación oficial escribe `tarifas`, sin prefijo de versión. No es eso:

| Path | Respuesta |
|---|---|
| `GET /tarifas` | **403 Forbidden** — `{"message":"Forbidden"}` |
| `GET /v1/tarifas` | **200 con la tarifa** |

Los SDKs de terceros tenían razón y la documentación oficial está
desactualizada.

## 2. Cotizar NO requiere autenticación

`GET https://apis.andreani.com/v1/tarifas` responde 200 **sin ningún header**.
No hace falta `POST /login` ni token para cotizar.

Es una diferencia importante de planificación: **el checkout puede cotizar
antes de tener credenciales**. Solo crear envíos, bajar etiquetas y consultar
el seguimiento las necesitan.

Ejemplo real:

```
GET /v1/tarifas?cpDestino=1832&contrato=300006611
    &bultos[0][kilos]=1&bultos[0][volumen]=1000&bultos[0][valorDeclarado]=1000

{"pesoAforado":"1000.00",
 "tarifaSinIva":{"seguroDistribucion":"0.00","distribucion":"541.14","total":"541.14"},
 "tarifaConIva":{"seguroDistribucion":"0.00","distribucion":"654.78","total":"654.78"}}
```

El formato `bultos[N][campo]` que reconstruyeron los SDKs es correcto.

## 3. La fórmula del peso aforado — **pregunta 19 respondida**

Andreani cobra por el **mayor entre el peso real y el volumétrico**. Midiendo
con el contrato de ejemplo:

| kilos | volumen (cm³) | `pesoAforado` |
|---|---|---|
| 1 | 1000 | 1000.00 |
| 1 | 9000 | **3150.00** |
| 5 | 1 | 5000.00 |
| 30 | 1 | 30000.00 |

De ahí salen dos cosas:

1. **`pesoAforado` viene en gramos**, no en kilos.
2. El coeficiente volumétrico de ese contrato es **0,35 g por cm³**:
   9000 × 0,35 = 3150. Con 1000 cm³ el volumétrico da 350 g, pierde contra el
   peso real de 1000 g, y el aforo queda en 1000. Consistente.

O sea: `pesoAforado = max(kilos × 1000, volumen × 0,35)`.

**Es un parámetro del contrato, no de la API**, así que se guarda por tienda y
es editable. Que las medidas del paquete cambien el precio tanto como el peso
es la razón por la que el panel las pide y muestra el volumen resultante.

## 4. La tarifa varía por zona, y no por valor declarado

Mismo bulto (2 kg, 9000 cm³), distintos destinos:

| CP | Destino | Total c/IVA |
|---|---|---|
| 1425 | CABA | 539,83 |
| 1832 | GBA | 654,78 |
| 5000 | Córdoba | 654,78 |
| 4400 | Salta | 771,19 |
| 8400 | Bariloche | 1425,98 |
| 9410 | Ushuaia | 2299,02 |

El `valorDeclarado` **no movió el precio** y `seguroDistribucion` dio siempre
0,00 con este contrato. Puede ser que el contrato de ejemplo no tenga seguro
contratado, o que el parámetro se llame distinto. No es bloqueante —el total
es lo que se cobra— pero conviene confirmarlo con un contrato real.

## 5. ⚠️ Un código postal inexistente NO da error

`cpDestino=9999` devuelve **200 con una tarifa**, la misma que la genérica. La
API no valida el destino.

**Consecuencia directa:** la validación del código postal es responsabilidad
nuestra. Si no se valida, se le muestra al comprador un precio de envío para un
destino que no existe, y el problema recién aparece al despachar.

## 6. `/localidades` no es público

La documentación dice que es el único endpoint sin autenticación. En la
práctica: `apis.andreani.com/localidades` da **404** y el de QA da **403**.
Precargar el catálogo de localidades —que es la mitigación recomendada para los
rechazos por localidad mal escrita— **necesita credenciales**.

## 7. Los errores usan ProblemDetails, no el array documentado

Un contrato inválido devuelve:

```json
{"type":"about:blank","title":"Error en la validacion de su pedido",
 "detail":"No se pudo obtener la tarifa","status":400,"errors":null}
```

La documentación atribuía esa forma solo al producto de almacenes y describía
un array `[{code, property, message}]` para transporte. Conviven las dos: el
cliente soporta ambas.

---

## Lo que sigue sin poder verificarse

Todo lo que necesita credenciales reales, que solo se obtienen por el canal
comercial:

- `POST /login` y el TTL del token.
- `POST /ordenes-de-envio`: cuál de los dos esquemas en conflicto está vigente.
- Etiquetas: si existe ZPL además de PDF.
- El catálogo completo de estados y motivos (solo se conocen cuatro).
- Si la API nacional aplica restricción por IP.
