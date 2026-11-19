# Estado — ya-cayo

> Punto de retomada corto. El detalle largo sigue en `.claude/ESTADO.md` (nombre viejo; migrarlo a este archivo en la rama `chore/english-names`, pendiente de que Diego lo autorice).

## Siguiente acción
Cerrar la cadena de PRs apilados (merge con squash; historial lineal en main; PRs en español con la skill `pr-description`). Los #3–#7 ya están integrados; falta el **#8** (`feat/english-naming`, H7–H10 + renombrado a inglés).
1. Aprobar el commit que porta a nombres en inglés los arreglos de Codex de H4–H6 (en esta rama quedaron fuera del rebase), barrido, `git push --force-with-lease` y `@codex review` en el #8.
2. **Fase 4 antes de mergear el #8:** `~/.claude/skills/medium-change/pre-push-review.sh --destino main --esfuerzo high` (tope 3 rondas) sobre `main...feat/english-naming`; informes en `docs/changes/2026-11-15-hosting-vercel/` y anotar en `despliegue.md` que la compuerta de H9 se cumplió después.
3. Atender a Codex en el #8 (arreglo + prueba + respuesta + resolver hilo) y mergear con `has_unresolved_findings:false`.
4. Tras el merge: `branch-close`, y **redesplegar Production solo con aprobación de Diego** (incluye los fixes de `attempt`, límites y cuerpo consumido).

## Decisiones abiertas
- Hobby (no comercial) aceptado y declarado por Diego (18-nov). `statement_timeout` por rol en Supabase: no incluido, a decidir.
- Alternativa a re-evaluar: 6543 + `max_pipeline: 1` (probado solo en local). Producción usa el pooler de sesión 5432.
- Ping diario contra la pausa de Supabase gratuito: cron de Vercel (`/api/keepalive` con `SELECT 1` y `CRON_SECRET`) vs GitHub Actions; Diego aún no elige. Verificar antes el criterio real de pausa.
- Migración a nombres en inglés de `.claude/` (ESTADO.md, revisiones/) en rama aparte: pendiente de autorización.
- Forma de trabajo global en este repo (CLAUDE.md con `verification:`/`workflow:`/`agents-contract`, `docs/agentes.md`, allowlist, `repos.tsv`): otra sesión lo pidió; solo se ejecuta si Diego lo pide directamente, tras el #8.
- Pendientes de Diego: renombrar `TITULAR`→`HOLDER_NAME` y `COMISION_TARJETA`→`CARD_FEE_RATE` en su `.env`; revisar en Vercel Settings → Functions el tope de duración; probar la caja en el navegador.
- Pendientes menores de Claude: copiar el informe de Codex de H1 a `docs/changes/.../revision-diff-codex.md`; añadir la regla de idioma al CLAUDE.md del proyecto.
- Rotar el PIN después del 14-dic.

## En curso en esta rama (`feat/english-naming`)
Rama rebasada sobre `main` (17 commits) con el port de los arreglos de Codex a inglés sin commitear: `src/core.js`, `src/reconciliation.js`, `src/server.js` y sus pruebas. `node --test` 87/87 en verde.
