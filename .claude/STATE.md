# Estado — ya-cayo

> Punto de retomada corto. El detalle largo sigue en `.claude/ESTADO.md` (nombre viejo; migrarlo a este archivo en la rama `chore/english-names`, pendiente de que Diego lo autorice).

## Siguiente acción
1. Mergear el #8 (squash, `has_unresolved_findings:false`) y correr `branch-close`. La fase 4 está cumplida (3 rondas) y registrada en `despliegue.md`.
2. PR aparte para el P2 diferido: migración nueva que revoque `EXECUTE` de `PUBLIC` en funciones futuras + prueba en `test/rls.test.js`. Aplicarla en Supabase solo con aprobación de Diego.
3. **Redesplegar Production solo con aprobación de Diego** (el código desplegado es previo a los fixes).
4. Luego, en este orden: migración de `.claude/` a nombres en inglés (`chore/english-names`); después `verification:`, `agents-contract: v1` + `docs/agentes.md`, `decision-review:`, `integration:`/`main-branch:` y regla de idioma en CLAUDE.md; al final allowlist y `repos.tsv`. Todo solo cuando Diego lo pida.

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
Fase 4 cerrada; listo para merge.
