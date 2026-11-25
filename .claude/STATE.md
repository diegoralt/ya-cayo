# Estado — ya-cayo

> Punto de retomada corto; se sobrescribe, no se acumula. El historial de decisiones vive en `docs/changes/` y en git.

## Siguiente acción
1. Revalidación de la propuesta de valor (`docs/changes/2026-11-24-value-proposition-review/`): fuentes oficiales verificadas en `sources.md`. Borrador 1 en `value-proposition.md`. Sigue: refutación a ciegas de Codex (`decision-review`) → ajustes al producto y a `docs/entrega/`. Sin acceso a comercios: la propuesta se declara hipótesis no validada con comercios. Capas 1 (rúbrica a ciegas) y 2 (capacidades de pey no usadas: `/codi/pn`, link de tarjeta) pendientes.
2. Flujo de despliegue en dos pasos: `DATABASE_URL` de Preview apuntando a una base distinta de la de Producción (H4); ajustar la skill `release-version` a `vercel promote`.
3. Rutina de mantenimiento de solo lectura (B.5): no adoptada; decidir con Diego si hace falta.

## Pendientes del 2.º corte (sáb 12-dic, 23:59 CDMX)
- Probar con pago real los casos tardío, duplicado y consulta fallida (hoy solo con pey simulado), con la CLABE de prueba.
- Versión 2 (declarada en README): agente con IA que propone el cobro; el cajero confirma, el servidor decide. Plan en `docs/changes/2026-11-15-agente-v2/`, a reescribir sobre Postgres.
- UI pendiente de la revisión de Codex (6/6/5): reordenar la caja (recientes antes del formulario), originalidad, foco del teclado al reconstruir la lista.
- Titular real a declarar; qué análisis de `docs/` se publica. Leer el Documento de Premios (bounties a más tardar el 30-nov).

## Decisiones abiertas
- CLABE: la propia está verificada, pero producción sigue con la CLABE de prueba (Diego no tiene otra cuenta CoDi para probar).
- `statement_timeout` por rol en Supabase: no incluido, a decidir. Alternativa a re-evaluar: 6543 + `max_pipeline: 1` (producción usa el pooler de sesión 5432).
- Ping diario contra la pausa de Supabase gratuito: cron de Vercel vs GitHub Actions; verificar antes el criterio real de pausa.
- Pendiente de Diego: probar la caja en el navegador.
- Pendiente menor de Claude: copiar el informe de Codex de H1 a `docs/changes/.../revision-diff-codex.md`.
- Rotar el PIN después del 14-dic.
