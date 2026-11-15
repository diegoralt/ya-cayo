# Revisión fase 1 · implementador

Implementó: Claude · Revisó: Claude (autorrevisión a ciegas del revisor) · sonnet-5.5/medium
Hash revisado: 7b2b225be60757db3c5bb7fcce8175ee67388384
esfuerzo: medium · P0/P1/P2: 0/3/3

## Veredicto
El intent es consistente con CLAUDE.md, pero hay tres huecos de diseño que condicionan el plan.

## Bloqueantes
- P1 `src/server.js:74-81`: hoy `POST /api/ordenes` toma `monto` y `concepto` del cliente; no existe catálogo en el servidor (el `MENU` está fijo en `public/caja.html:261`). El criterio «el servidor recalcula el monto desde el catálogo» exige crear ese catálogo en servidor y un contrato de línea (id, cantidad); si no, el LLM «propone» pero el monto sigue viniendo del navegador. → el plan debe decidir catálogo en servidor (archivo/tabla) y un endpoint de orden por líneas.
- P1 Gasto de la key: el endpoint del agente es el primero con costo por llamada. El PIN limita fallos (`server.js:11`) pero no uso legítimo ni de quien conozca el PIN. → tope diario/por minuto y `max_tokens` en el servidor, y límite de gasto en OpenRouter (no verificado que la key lo permita).
- P1 Inyección: la salida del LLM debe validarse contra el esquema (ids del catálogo, enteros 1..20), nunca texto libre al concepto sin saneo; el «concept» de pey quita `$` y `.` (`contexto.md:116`). → validar en servidor, el concepto se arma en el servidor desde el catálogo.

## Debería
- P2 Criterio «dicta»: no hay reconocimiento de voz en el servidor; aclarar si es el dictado del teclado del móvil o Web Speech API.
- P2 Modelo y proveedor concretos en OpenRouter (precio, latencia, retención de datos) sin elegir; declarar tercero.
- P2 Pruebas con LLM simulado no prueban el modelo real: añadir una corrida manual con 5-10 frases registradas.

## NO VERIFICADO
- Que OpenRouter soporte tool use/JSON estricto con el modelo elegido.
- Que el límite de gasto por key exista en OpenRouter.
