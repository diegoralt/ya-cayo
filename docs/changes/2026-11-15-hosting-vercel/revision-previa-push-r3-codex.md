Implementó: claude · Revisó: codex · gpt-6.1-sol/high
Fecha: 2026-11-19
Hash revisado: c6244421a9a29aa64ace9d47bb06f8c9bb390eee
Base: 2d2d9e0550078ab3191b3a8124140e8c1492549f
Destino: main
esfuerzo: high · P0/P1/P2: 0/0/1

## Veredicto

Sin bloqueantes encontrados en el diff; un P2 en el endurecimiento de privilegios futuros.

## Bloqueantes

Ninguno.

Verificación independiente en `/private/tmp/ya-cayo-review-vsi5r63p`, con Node 24.19.0 y un contenedor Postgres 16 exclusivo: `node --test` **89/89**, sin omisiones. Incluye importación repetida, ensayo de reversión, concurrencia, firma, límites de PIN y denegación de operaciones a `anon`/`authenticated`. Además, apliqué las migraciones nuevas sobre el esquema anterior con datos sintéticos: conservó estado entregado, token, transacción y evento; reentregar devolvió `ok: false`, con una entrega. Contenedor y volumen de revisión eliminados. `git diff --check` sin errores en las rutas accesibles.

Criterio leído: instrucciones AGENTS del encargo; `~/.claude/reference/ai-native-workflow.md:27` y `:60`; `CLAUDE.md:4` y `:8`; `docs/arranque.md`; `docs/contexto.md`; intent y plan del cambio. No existe AGENTS.md en la raíz ni declaración `agents-contract: v1` en CLAUDE.md. Modelo de amenaza aplicado: `docs/changes/2026-11-15-hosting-vercel/intent.md:24`. HEAD y base coinciden con el encargo. Hashes de las entradas leídas: intent `43aafe52114d44779489cc6514a6fcf62925c2f4`; plan `e5bb7de125e0fe840c9590c8cdd1654875bd9c32`. Revisión a ciegas, sin consultar informes previos.

## Debería

- P2 — **Revocar también EXECUTE de PUBLIC para las funciones futuras.** `supabase/migrations/20261118000000_revoke_default_privileges.sql:7` revoca privilegios a `anon` y `authenticated`, pero ambos conservan el permiso heredado de `PUBLIC`, que PostgreSQL concede por defecto a las funciones. Reproducción local después de aplicar todas las migraciones: crear `public.review_probe()` como migrador; `has_function_privilege(..., 'EXECUTE')` devuelve `true` para ambos roles y `SET LOCAL ROLE anon; SELECT public.review_probe()` se ejecuta. Por tanto, la protección de funciones anunciada en `supabase/migrations/20261118000000_revoke_default_privileges.sql:2` no se establece. Añadir `PUBLIC` a la revocación de funciones y comprobar ese caso junto al test de tablas de `test/rls.test.js:111`. Condición de exposición por internet: incorporar una RPC y habilitar la Data API; este diff no incorpora RPC y la documentación declara esa API desactivada (`docs/changes/2026-11-15-hosting-vercel/despliegue.md:31`), por lo que no es un bloqueo de seguridad actual.

## NO VERIFICADO

- Producción: DNS, TLS efectivo, pooler de Supabase, variables de Vercel, protección de despliegues, webhook real, pago y prueba con el Mac apagado. Leí la evidencia de `docs/changes/2026-11-15-hosting-vercel/despliegue.md:55`; no repetí operaciones contra producción. La evidencia declara la salvedad de otra red y la rotación diferida del PIN en `:65`.
- Barrido completo contra secretos reales e historial: el script necesita leer `.env` (`scripts/barrido-secretos.sh:28`), prohibido por el perfil. Tampoco leí `.env.example`, cuyo nombre coincide con la restricción `.env*`. Las pruebas del barrido con secretos sintéticos sí pasaron.
- Importación del respaldo real y estado remoto de las migraciones: comprobados únicamente con datos sintéticos locales.
