# Estado — ya-cayo

> Punto de retomada corto; se sobrescribe, no se acumula. El historial de decisiones vive en `docs/changes/` y en git.

## Siguiente acción
1. Integrar el PR `chore/english-names` (migración de `.claude/` a nombres en inglés; `ESTADO.md` fusionado aquí).
2. Redesplegar Production solo cuando Diego lo pida (el código desplegado es previo a los fixes; la migración `20261119000000` ya está aplicada en Supabase). Revisar entonces las variables de Vercel (`HOLDER_NAME`, `CARD_FEE_RATE`).
3. En este orden, cuando Diego lo pida: `verification:`, `agents-contract: v1` + `docs/agentes.md`, `decision-review:`, `integration: pr`/`main-branch:` y regla de idioma en CLAUDE.md; al final allowlist y `repos.tsv`.

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
- Forma de trabajo global en este repo (CLAUDE.md con `verification:`/`workflow:`/`agents-contract`, `docs/agentes.md`, allowlist, `repos.tsv`): otra sesión lo pidió; solo se ejecuta si Diego lo pide directamente, tras el #8.
- Pendientes de Diego: renombrar `TITULAR`→`HOLDER_NAME` y `COMISION_TARJETA`→`CARD_FEE_RATE` en su `.env`; probar la caja en el navegador. (El tope de Vercel ya está bien: `vercel.json` fija 30 s.)
- Pendientes menores de Claude: copiar el informe de Codex de H1 a `docs/changes/.../revision-diff-codex.md`; añadir la regla de idioma al CLAUDE.md del proyecto.
- Rotar el PIN después del 14-dic.
