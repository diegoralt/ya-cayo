# Estado — ya-cayo

> Se sobrescribe cada sesión. Última actualización: 2026-11-15 (sesión larga; seguir en sesión nueva tras `/clear`).

## Siguiente acción (1.er corte ENVIADO el 15-nov-2026; 2.º corte sáb 12-dic 23:59 CDMX)
1. **Lunes 16-nov: iniciar el alta de la CLABE propia** (`POST /bank-account`, hasta 5 días hábiles con Banxico); la demo pública del 2.º corte necesita la tuya en `ACTIVE`.
2. **Rotar el PIN** de la demo (`DEMO_PIN` en `.env`) y reiniciar el servidor: quedó impreso en una sesión.
3. **Webhook:** Bot Fight Mode (plan gratuito) desafía los envíos de pey y no se puede saltar con reglas (detalle en `docs/contexto.md`). Elegir antes del 2.º corte: host fuera del bloqueo (H7), zona aparte o Super Bot Fight Mode con Skip. Mientras tanto confirma el polling.
4. **Probar con pago real:** reenvío, tardío, duplicado y consulta fallida (hoy solo con pey simulado).
5. **Versión 2 (declarada en README y en la descripción):** agente con IA que lista productos y piezas y genera el cobro para CoDi. Regla: propone, el cajero confirma, el servidor decide; sin herramientas de «marcar pagado» ni «entregar». Hoy existe un asistente por reglas en `public/caja.html` (`proponer`).
6. **UI pendiente de la revisión de Codex (6/6/5):** reordenar la caja (recientes antes del formulario), subir originalidad, foco del teclado al reconstruir la lista. Otros pendientes: titular real a declarar, `docs/agentes.md`, `integración: push`.
7. Skill `orca-cli`: Diego debe revisarla y aceptarla (`sh ~/.claude/hooks/session-start-skills.sh --aceptar`).
Antes de cada push: `sh scripts/barrido-secretos.sh`. `main` protegida (sin force-push ni borrado); interacciones externas limitadas a colaboradores hasta 2027-05-15.
Entregado: repo público, app `pey.drkingsia.com`, video «Ya Cayo Video» en Drive, textos en `docs/entrega/` (los `.local.md` llevan PIN y titular; no se versionan).

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
