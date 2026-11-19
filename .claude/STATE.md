# Estado — ya-cayo

> Punto de retomada corto. El detalle largo sigue en `.claude/ESTADO.md` (nombre viejo; migrarlo a este archivo en la rama `chore/english-names`, pendiente de que Diego lo autorice).

## Siguiente acción
Cerrar la cadena de PRs apilados (squash; PRs en español con la skill `pr-description`). Falta el **#8** (`feat/english-naming`).
1. Rondas 1 y 2 de la fase 4 (Codex, high): 0 P0/P1 y 5 P2 en total, todos arreglados y subidos. Falta la ronda 3 (última del tope) sobre el commit de los arreglos de la ronda 2.
2. **Fase 4 (compuerta antes de mergear el #8):** ronda 3 con `~/.claude/skills/medium-change/pre-push-review.sh --target main --change docs/changes/2026-11-15-hosting-vercel --effort high` (tope 3 rondas; el informe sale en `.claude/reviews/<sha>.md`, ignorado por git). Al cerrar, copiar los informes a `docs/changes/2026-11-15-hosting-vercel/` con sufijo Codex y anotar en `despliegue.md` que la compuerta de H9 se cumplió después.
3. Atender a Codex en el #8 (arreglo + prueba + respuesta + resolver hilo) y mergear con `has_unresolved_findings:false`.
4. Tras el merge: `branch-close`, y **redesplegar Production solo con aprobación de Diego**.

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
Arreglos de las rondas 1 y 2 subidos; `node --test` 89/89. Pendiente: ronda 3, atender a Codex en el #8 y merge.
