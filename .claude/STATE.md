# Estado — ya-cayo

> Punto de retomada corto; se sobrescribe, no se acumula. El historial de decisiones vive en `docs/changes/` y en git.

## Siguiente acción
1. Integrar este PR (`chore/agents-contract`: marcadores, `docs/agentes.md`, regla de idioma en CLAUDE.md). Con `main` protegida: Codex sin hallazgos y conversaciones resueltas.
2. En `~/.claude` (repo global): el commit que registra ya-cayo como `produccion` está hecho en local; falta el push, con OK de Diego.
3. Rutina de mantenimiento de solo lectura (B.5, plantilla `~/.claude/templates/production/maintenance-routine.md`): no adoptada; decidir con Diego si hace falta.
4. Decisión pendiente de Diego: rutas en español (`/pagar/:token`, `public/pagar.html`, `public/maqueta.html`); cambiarlas rompe enlaces de pago ya emitidos. Hasta entonces son excepción en CLAUDE.md.
5. Redesplegar Production solo cuando Diego lo pida (código desplegado previo a los fixes; migración `20261119000000` ya aplicada). Revisar entonces variables de Vercel.

## Pendientes del 2.º corte (sáb 12-dic, 23:59 CDMX) · venían de ESTADO.md
- CLABE propia: alta iniciada el 17-nov («Procesando», hasta 5 días hábiles); NO VERIFICADO su estado actual. La demo pública necesita la tuya en `ACTIVE`.
- Probar con pago real los casos tardío, duplicado y consulta fallida (el reenvío ya se probó en H9; hoy solo con pey simulado).
- Versión 2 (declarada en README): agente con IA que propone el cobro; el cajero confirma, el servidor decide. Plan en `docs/changes/2026-11-15-agente-v2/`, a reescribir sobre Postgres.
- UI pendiente de la revisión de Codex (6/6/5): reordenar la caja (recientes antes del formulario), originalidad, foco del teclado al reconstruir la lista.
- Titular real a declarar; qué análisis de `docs/` se publica.

## Decisiones abiertas
- Hobby (no comercial) aceptado y declarado por Diego (18-nov). `statement_timeout` por rol en Supabase: no incluido, a decidir.
- Alternativa a re-evaluar: 6543 + `max_pipeline: 1` (probado solo en local). Producción usa el pooler de sesión 5432.
- Ping diario contra la pausa de Supabase gratuito: cron de Vercel (`/api/keepalive` con `SELECT 1` y `CRON_SECRET`) vs GitHub Actions; Diego aún no elige. Verificar antes el criterio real de pausa.
- Pendiente de Diego: probar la caja en el navegador. (`.env` ya renombrado a `HOLDER_NAME`/`CARD_FEE_RATE`.) (El tope de Vercel ya está bien: `vercel.json` fija 30 s.)
- Pendientes menores de Claude: copiar el informe de Codex de H1 a `docs/changes/.../revision-diff-codex.md`.
- Rotar el PIN después del 14-dic.
