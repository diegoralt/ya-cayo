# Estado — ya-cayo

> Punto de retomada corto. El detalle largo sigue en `.claude/ESTADO.md` (nombre viejo; migrarlo a este archivo en la rama `chore/english-names`, pendiente de que Diego lo autorice).

## Siguiente acción
H9, paso 5 (con aprobación de Diego en cada operación): dominio `pey.drkingsia.com`, webhook único en pey (el actual sigue en el túnel viejo; el servidor del Mac está detenido a propósito), pago real de $0.01 + reenvío (`entregas = 1`), prueba con Mac apagado y túnel detenido. Barrido (`sh scripts/barrido-secretos.sh`) antes de cada push.
Informe de buenas prácticas: `docs/changes/2026-11-15-hosting-vercel/buenas-practicas.md`.

## Decisiones abiertas
- Hobby (no comercial) aceptado y declarado por Diego (18-nov). `statement_timeout` por rol en Supabase: no incluido, a decidir.
- Alternativa a re-evaluar: 6543 + `max_pipeline: 1` (probado solo en local). Producción usa el pooler de sesión 5432.
- Ping diario contra la pausa de Supabase gratuito: cron de Vercel (`/api/keepalive` con `SELECT 1` y `CRON_SECRET`) vs GitHub Actions; Diego aún no elige. Verificar antes el criterio real de pausa.
- Migración a nombres en inglés de `.claude/` (ESTADO.md, revisiones/) en rama aparte: pendiente de autorización.
- Pendientes de Diego: renombrar `TITULAR`→`HOLDER_NAME` y `COMISION_TARJETA`→`CARD_FEE_RATE` en su `.env`; revisar en Vercel Settings → Functions el tope de duración; probar la caja en el navegador.
- Pendientes menores de Claude: copiar el informe de Codex de H1 a `docs/changes/.../revision-diff-codex.md`; añadir la regla de idioma al CLAUDE.md del proyecto.

## En curso en esta rama (`feat/english-naming`)
Subida con el barrido en verde. Sin cambios de código pendientes.
