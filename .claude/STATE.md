# Estado — ya-cayo

> Punto de retomada corto; se sobrescribe, no se acumula. El historial de decisiones vive en `docs/changes/` y en git.

## Siguiente acción
1. Rutina de mantenimiento de solo lectura (B.5, plantilla `~/.claude/templates/production/maintenance-routine.md`): no adoptada; decidir con Diego si hace falta.
2. Primer merge real con el flujo en dos pasos: confirmar que construye sin publicar y promoverlo con `vercel promote`. A los Preview les falta `DATABASE_URL` (apuntarlo a una base distinta de la de Producción). Ajustar la skill `release-version` al `promote`.

## Pendientes del 2.º corte (sáb 12-dic, 23:59 CDMX)- CLABE propia: alta iniciada el 17-nov («Procesando», hasta 5 días hábiles); NO VERIFICADO su estado actual. La demo pública necesita la tuya en `ACTIVE`.
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
