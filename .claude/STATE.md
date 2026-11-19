# Estado — ya-cayo

> Punto de retomada corto; se sobrescribe, no se acumula. El historial de decisiones vive en `docs/changes/` y en git.

## Siguiente acción
1. Integrar el PR `chore/english-scripts` (scripts, flags y variables en inglés; barrido ahora `sh scripts/secrets-sweep.sh`) y, aparte, `.claude/settings.json` (allowlist del proyecto + `ask`/`deny` copiados del global). Ambos listos y sin commitear; pedir OK de Diego antes de cada commit.
2. En `~/.claude` (repo global): `reference/repos.tsv` y `hooks/session-start-adoption.sh` ya registran ya-cayo como `produccion` (tests en verde); falta el commit allí, con OK de Diego.
3. Como ya-cayo es `produccion`, el hook de adopción pedirá el flujo completo: `verification:`, `agents-contract: v1` + `docs/agentes.md`, `decision-review:`, `integration: pr`/`main-branch:` y la regla de idioma en CLAUDE.md (quitando lo que duplica el global). Hacerlo cuando Diego lo pida.
4. Redesplegar Production solo cuando Diego lo pida (código desplegado previo a los fixes; migración `20261119000000` ya aplicada). Revisar entonces variables de Vercel.
5. Decisión pendiente de Diego: rutas en español (`/pagar/:token`, `public/pagar.html`, `maqueta.html`); cambiarlas rompe enlaces de pago ya emitidos.

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
- Pendiente de Diego: probar la caja en el navegador. (`.env` ya renombrado a `HOLDER_NAME`/`CARD_FEE_RATE`.) (El tope de Vercel ya está bien: `vercel.json` fija 30 s.)
- Pendientes menores de Claude: copiar el informe de Codex de H1 a `docs/changes/.../revision-diff-codex.md`; añadir la regla de idioma al CLAUDE.md del proyecto.
- Rotar el PIN después del 14-dic.
