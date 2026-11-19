# Estado — ya-cayo

> Punto de retomada corto. El detalle largo sigue en `.claude/ESTADO.md` (nombre viejo; migrarlo a este archivo en la rama `chore/english-names`, pendiente de que Diego lo autorice).

## Siguiente acción
1. PR `fix/revoke-public-execute` (migración `20261119000000_revoke_public_function_execute` + prueba en `test/rls.test.js`): revisar, mergear. **Aplicarla en Supabase (`supabase db push`) solo con aprobación de Diego**, con dry-run mostrado antes.
2. Redesplegar Production solo cuando Diego lo pida (el código desplegado es previo a los fixes). Revisar entonces las variables de Vercel (`HOLDER_NAME`, `CARD_FEE_RATE`).
3. En este orden, cuando Diego lo pida: migración de `.claude/` a nombres en inglés (`chore/english-names`); después `verification:`, `agents-contract: v1` + `docs/agentes.md`, `decision-review:`, `integration:`/`main-branch:` y regla de idioma en CLAUDE.md; al final allowlist y `repos.tsv`.

## Decisiones abiertas
- Hobby (no comercial) aceptado y declarado por Diego (18-nov). `statement_timeout` por rol en Supabase: no incluido, a decidir.
- Alternativa a re-evaluar: 6543 + `max_pipeline: 1` (probado solo en local). Producción usa el pooler de sesión 5432.
- Ping diario contra la pausa de Supabase gratuito: cron de Vercel (`/api/keepalive` con `SELECT 1` y `CRON_SECRET`) vs GitHub Actions; Diego aún no elige. Verificar antes el criterio real de pausa.
- Migración a nombres en inglés de `.claude/` (ESTADO.md, revisiones/) en rama aparte: pendiente de autorización.
- Forma de trabajo global en este repo (CLAUDE.md con `verification:`/`workflow:`/`agents-contract`, `docs/agentes.md`, allowlist, `repos.tsv`): otra sesión lo pidió; solo se ejecuta si Diego lo pide directamente, tras el #8.
- Pendientes de Diego: renombrar `TITULAR`→`HOLDER_NAME` y `COMISION_TARJETA`→`CARD_FEE_RATE` en su `.env`; probar la caja en el navegador. (El tope de Vercel ya está bien: `vercel.json` fija 30 s.)
- Pendientes menores de Claude: copiar el informe de Codex de H1 a `docs/changes/.../revision-diff-codex.md`; añadir la regla de idioma al CLAUDE.md del proyecto.
- Rotar el PIN después del 14-dic.

## En curso en esta rama (`fix/revoke-public-execute`)
Migración y prueba listas (`node --test` 90/90); sin commitear.
