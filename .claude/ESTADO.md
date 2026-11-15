# Estado — ya-cayo

> Se sobrescribe cada sesión. Última actualización: 2026-11-15 (sesión larga; seguir en sesión nueva tras `/clear`).

## Siguiente acción (15-nov; entrega 1:00 PM CDMX, formulario 12:00)
1. **Webhook verificado** (200 en pey, fila en `eventos`, firma válida; detalle en `docs/contexto.md`). Bot Fight Mode quedó encendido otra vez: bloquea los envíos de pey. Antes del 2.º corte elegir: host fuera de ese bloqueo (H7), zona aparte o Super Bot Fight Mode con Skip.
2. **Textos de entrega actualizados** (pago real por polling + webhook firmado verificado; reenvío/tardío/duplicado/consulta fallida solo con pey simulado). Revisar y quitar el aviso de borrador antes de enviar.
3. **UI (publicada en `main`):** ticket + sello + barra, límite de PIN, ajustes de la revisión ciega de Codex (6/6/5): texto del pagador, doble envío, consultas superpuestas, contraste/foco. Pendiente de esa revisión, sin decidir: reordenar la caja (recientes antes del formulario) y subir originalidad; foco al reconstruir la lista. Correr `sh scripts/barrido-secretos.sh` antes de cada push. `main` protegida (sin force-push ni borrado, historial lineal; Diego puede empujar directo); interacciones externas limitadas a colaboradores hasta 2027-05-15.
4. **Video generado** (1:33, narrado, con 2 pagos reales de $0.01 en dos tomas): `~/Desktop/ya-cayo-video.mp4` (el `-borrador-1` es la toma con cintillo DEMO; no usar). Subirlo y llenar el formulario. Asistente de captura por reglas publicado en `main` y declarado en `descripcion.md`. Probar con pago real aún: reenvío, tardío, duplicado. Contexto de la sesión muy largo: seguir en sesión nueva (`/clear`).
5. Skill `orca-cli`: Diego debe revisarla y aceptarla (`sh ~/.claude/hooks/session-start-skills.sh --aceptar`).

## Estado del trabajo
Maqueta confirmada por Diego (se mejora solo si hace falta). H4 implementado en local (rutas, PIN, tope, máx. 3 vivos, `pagada_en`, `/pagar/:token`, métricas; `node --test` 26/26), commiteado. Preguntar a Diego antes de cada commit.
Hay una sonda desechable fuera del repo en el scratchpad de la sesión anterior (`receptor.py`, `crear-qr.sh`, `consultar-qr.sh`); el scratchpad cambia con la sesión, si hace falta se recrean.

## Decisiones tomadas hoy (no reabrir)
- Sin descuento automático: la app **recomienda** al vendedor un bono por usar CoDi, financiado con la comisión de tarjeta evitada; el vendedor decide. «Tarjeta o efectivo» solo registra para medir aceptación.
- Guía «¿Aún no tienes CoDi?»: **imágenes genéricas generadas con Codex** (sin logos ni marcas de bancos, rotuladas como ilustración genérica; pasos del banco reales NO VERIFICADOS por banco). Video, si llega, en el 2.º corte; sin enlaces inventados.
- Pagador: página con estado en vivo (cada 2 s), sin notificaciones push/SMS/correo; el aviso lo da el banco (CoDi notifica a ambos).
- Mobile-first (tablet/celular), no apps nativas. Captura manual de concepto y monto en el 1.er corte; catálogo y agente #1 después.
- Hosting: túnel Cloudflare con subdominio propio desde el Mac de Diego; migrar a host fijo (H7) tras el envío. Presupuesto: Claude ≤ 6M, Codex ≤ 5% semanal.

## Decisiones abiertas
- «Polling solo» (sin webhook) solo con aprobación escrita de Diego; H1 resuelto: Diego ya pagó con CoDi.
- ¿La cuenta permite `stripe` (respaldo con tarjeta)? Portal → Perfil → Finanzas.
- Normativa/contrato de adquirente sobre bonos por método de pago: NO VERIFICADO.
- Agente #1 (H5; decide dom 9:00); `docs/agentes.md`/`contrato-agentes: v1`; `integración: push`; titular real a declarar; qué análisis de `docs/` se publica.
