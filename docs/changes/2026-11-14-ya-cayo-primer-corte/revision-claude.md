# Revisión fase 1 · intent.md

Implementó: Claude · Revisó: Claude (autorrevisión del implementador) · Sonnet 5.5 / medium
Fecha: 2026-11-14 · Hash revisado: 3abe849171096ee26aa24db9118b6742b0cf9bfa
esfuerzo: medium · P0/P1/P2: 0/2/2

## Veredicto
El intent es verificable, pero dos supuestos de pey sin probar pueden mover el diseño.

## Bloqueantes
- P1 Contrato del webhook sin probar: solo `webhook-id` está documentado; firma/timestamp, reintentos y repetición de `webhook-id` no. Si la firma no valida con Standard Webhooks, el «pagado» por webhook falla → el polling a `GET /transaction/...` debe poder ser la vía única el domingo. Arreglo: hito de prueba con $0.01 antes de construir la lógica de estado.
- P1 URL del webhook: una API key admite un solo webhook y no está documentado cómo cambiar la URL. Con cloudflared quick tunnel la URL cambia al reiniciar → webhook roto. Arreglo: túnel con nombre (URL estable) o dominio propio desde el inicio; el polling cubre el hueco.

## Debería
- P2 «QR pagado dos veces» no está resuelto: si pey acepta ambos pagos, «entrega única» debe depender del estado local de la orden y no del QR; conviene fijar ese comportamiento en el plan.
- P2 Un cobro vivo por orden y expiración mínima de 360 s: la demo del vencido necesita caso preparado y rotulado.

## NO VERIFICADO
Sandbox, activación de la CLABE preautorizada, algoritmo de firma, comportamiento ante reintentos.
