# Experimento H4 · ¿ofrece pey idempotencia o búsqueda de QR?

- **Fecha:** 2026-11-16 · **Costo:** 0 (2 QR de $0.01 creados y **no pagados**; vencen a los 360 s) · **Webhook de producción:** no tocado (un QR sin pagar no emite evento).
- **Sonda:** desechable, fuera del repo (scratchpad de la sesión); no imprime la key, `qrString` ni `qrImage`.

## Resultados (observados, no supuestos)
| Pregunta | Resultado |
|---|---|
| Mismo cuerpo + cabeceras `Idempotency-Key`/`X-Idempotency-Key`, dos `POST /codi/qr` | **Dos QR distintos** (ids distintos, ambos 201). pey ignora esas cabeceras; `numRef` y `metadata` repetidos tampoco deduplican. |
| `GET /codi/qr/{id}` | **404**: no hay consulta de un QR por id. |
| `GET /transaction/codi/qr/{id}` de un QR sin pagar | 200 con **0 items**: sin pago no hay rastro. |
| `GET /transaction/{id}` con el id del QR | 404. |
| `GET /transaction/api-key` (1.ª página) buscando el QR por `payableId` o `metadata.intento` | **0 coincidencias**: un QR sin pagar no aparece. |
| Respuesta de creación | `{id, qrString}` (+ `qrImage` solo con `generateImage:true`). |
| Latencia de `POST /codi/qr` | 5.2 s y 1.6 s (sin imagen): el timeout de pey debe ser holgado (≥ 15 s). |

## Conclusión
pey **no** ofrece idempotencia ni búsqueda de QR sin pagar. Un QR cuya respuesta perdimos es **inalcanzable**: nadie lo ha visto (solo la respuesta trae el `qrString`) y no se puede consultar ni listar. La deduplicación tiene que vivir de nuestro lado (ver `plan.md`, H4).

## NO VERIFICADO
- Que el webhook y las transacciones **pagadas** devuelvan el `metadata` que enviamos (el webhook real observado trae el campo `metadata`, pero ese pago no lo llevaba). Se confirma con el pago real de $0.01 de H9 o antes con uno de prueba si Diego lo aprueba.
- Que el `numRef` viaje en la transacción consultada (sí viaja en el webhook según la doc).
