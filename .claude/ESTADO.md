# Estado — ya-cayo

> Se sobrescribe cada sesión. Última actualización: 2026-11-14 (cierre de sesión larga; seguir en sesión nueva tras `/clear`).

## Siguiente acción (en este orden; el plan manda: `docs/changes/2026-11-14-ya-cayo-primer-corte/plan.md`, primera casilla vacía)
1. **Maqueta** `public/maqueta.html` rehecha (precio de lista, panel «Recomendación al vendedor», bloque «¿Aún no tienes CoDi?»; enlace oficial de CoDi pendiente de confirmar en la fuente). **Falta el visto bueno de Diego** antes del paso 2.
2. **H4 real** (rutas `/api/ordenes` y `/api/metricas`, columna `pagada_en`, PIN de demo, tope $50, máx. 3 cobros vivos, `/pagar/:id`, mobile-first). Pruebas en local con `node --test` (19/19 hoy).
3. **H0**: Diego corre `curl https://<subdominio>/health` con el túnel apuntando al puerto de la app.
4. **H1 (bloqueado)**: no hay quien pague el QR de prueba; desbloquear con otra persona con CoDi que pague $0.01. H3 queda abierto hasta H1.
Entrega: dom 15-nov 1:00 PM CDMX; congelar alcance 10:30; formulario 12:00.

## Estado del trabajo
Commits hechos: docs, cambio abierto, núcleo (H2 y H3 en local). **Sin commit:** maqueta con incentivo (se va a rehacer), `src/pey.js` (ajuste al OpenAPI), `test/pey.test.js`, `plan.md` y este archivo. Preguntar a Diego antes de commitear.
Hay una sonda desechable fuera del repo en el scratchpad de la sesión anterior (`receptor.py`, `crear-qr.sh`, `consultar-qr.sh`); el scratchpad cambia con la sesión, si hace falta se recrean.

## Decisiones tomadas hoy (no reabrir)
- Sin descuento automático: la app **recomienda** al vendedor un bono por usar CoDi, financiado con la comisión de tarjeta evitada; el vendedor decide. «Tarjeta o efectivo» solo registra para medir aceptación.
- Guía «¿Aún no tienes CoDi?»: **imágenes genéricas generadas con Codex** (sin logos ni marcas de bancos, rotuladas como ilustración genérica; pasos del banco reales NO VERIFICADOS por banco). Video, si llega, en el 2.º corte; sin enlaces inventados.
- Pagador: página con estado en vivo (cada 2 s), sin notificaciones push/SMS/correo; el aviso lo da el banco (CoDi notifica a ambos).
- Mobile-first (tablet/celular), no apps nativas. Captura manual de concepto y monto en el 1.er corte; catálogo y agente #1 después.
- Hosting: túnel Cloudflare con subdominio propio desde el Mac de Diego; migrar a host fijo (H7) tras el envío. Presupuesto: Claude ≤ 6M, Codex ≤ 5% semanal.

## Decisiones abiertas
- Quién paga el QR de prueba (H1); «polling solo» solo con aprobación escrita de Diego.
- ¿La cuenta permite `stripe` (respaldo con tarjeta)? Portal → Perfil → Finanzas.
- Normativa/contrato de adquirente sobre bonos por método de pago: NO VERIFICADO.
- Agente #1 (H5; decide dom 9:00); `docs/agentes.md`/`contrato-agentes: v1`; `integración: push`; titular real a declarar; qué análisis de `docs/` se publica.
