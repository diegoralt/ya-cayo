# Síntesis · fase 1 (agente-v2)

## Índice
- `intent.md` (manda; revisado tras la fase 1, hash 71e4458…) · `revision-claude.md` y `revision-codex.md` (antecedentes, sobre el hash 7b2b225…).

## Coincidencias
- Catálogo hoy solo en cliente y monto tomado del cliente (`server.js:74-81`, `caja.html:261`): el «servidor recalcula» exige catálogo en servidor.
- «Tope de uso» no basta: falta presupuesto de la key. Inyección/validación de salida; dictado = teclado del móvil; modelo y proveedor por definir; mock no acredita OpenRouter.

## Solo Codex
- Respaldo por reglas falla el ejemplo literal (`pan: 1`); corpus con esperados. XSS por nombres de catálogo. Qué datos salen a OpenRouter. Respuesta tardía no pisa ticket editado. Límite de gasto nativo de la key de OpenRouter.

## Desacuerdos con la decisión de Diego
- Ninguno material. Ajuste: el cajero edita cantidades, no precios; el modo demo pasa al servidor.

## Mapa hueco → verificación (el plan lo asigna a hitos)
| Hueco | Verificación |
|---|---|
| Monto desde cliente/LLM | prueba: POST con monto manipulado no cambia el QR de líneas |
| Presupuesto/PIN | prueba: sin PIN 0 llamadas; tope agotado → 429/manual; sobrevive reinicio |
| Inyección/XSS | corpus + nombre `<img onerror>` |
| Datos a OpenRouter | prueba con valores centinela |
| Compatibilidad real | corrida real acotada (manual, con presupuesto) |
