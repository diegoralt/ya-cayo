# Estado — ya-cayo

> Punto de retomada corto. El detalle largo sigue en `.claude/ESTADO.md` (nombre viejo; migrarlo a este archivo en la rama `chore/english-names`, pendiente de que Diego lo autorice).

## Siguiente acción
H9 (variables de producción en Vercel, dominio `pey.drkingsia.com`, webhook único en pey, pago real de $0.01 + reenvío, prueba con Mac apagado y túnel detenido, rotar PIN tras el 14-dic), plan en `docs/changes/2026-11-15-hosting-vercel/plan.md`. Urgente: el servidor del Mac está detenido y el webhook de pey sigue apuntando al túnel viejo, así que conviene hacer H9 pronto (los pagos se recuperan por conciliación al consultar).
Antes: commit de la evidencia de H8b y STATE.md, barrido y push (pregunta a Diego).

## Decisiones abiertas
- Ping diario contra la pausa de Supabase gratuito: cron de Vercel (`/api/keepalive` con `SELECT 1` y `CRON_SECRET`) vs GitHub Actions; Diego aún no elige. Verificar antes el criterio real de pausa.
- Migración a nombres en inglés de `.claude/` (ESTADO.md, revisiones/) en rama aparte: pendiente de autorización.

## En curso en esta rama (`feat/english-naming`)
Sin commitear: evidencia de H8b en `despliegue.md`, casilla en `plan.md` y este archivo. El commit `--aplicar/--verificar` aún no está subido.
