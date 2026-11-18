# Despliegue de preview (H7) — evidencia

Fecha: 17/18-nov-2026. Rama `feat/english-naming` (commit `6c9c990`). Proyecto Vercel `ya-cayo` (equipo `drkingsia`, Hobby, región `iad1`, Fluid Compute activo). BD: Supabase `ya-cayo-preview` (us-east-1). Pruebas con el bypass de automatización de Vercel; los secretos están en `~/.config/ya-cayo/preview.env`, fuera del repo.

## Configuración (solo entorno Preview)
- Variables: `DATABASE_URL` (pooler transaccional 6543, rol `ya_cayo_app`, `sslmode=require`), `PEY_WEBHOOK_SECRET` y `DEMO_PIN` de prueba, `HOLDER_NAME`, `CARD_FEE_RATE`, y `PEY_API_KEY` **inválida de marcador** (`createPeyClient()` exige que exista; así Preview no puede crear cobros reales). Producción sigue sin variables (H9).
- Migraciones: las 4 aplicadas con `supabase db push`. Verificado como `ya_cayo_app`: 7 tablas con RLS, `anon`/`authenticated` sin privilegios, el rol de la app lee y escribe, no es superusuario ni `BYPASSRLS`, `CREATE TABLE` denegado (`42501`).

## Resultados
| Prueba | Resultado |
|---|---|
| `/` y `/pagar/abc` | 200, páginas estáticas (rewrites correctos) |
| `/health`, `/api/orders` sin PIN (401), con PIN (200 `[]`), `/api/payment/falso` (404 JSON) | La función recibe la ruta original tras el rewrite (`req.url` íntegro) y consulta la BD por el pooler |
| Webhook firmado, JSON con espacios, saltos de línea y Unicode (`ñ`, `😀`) | **200**: el cuerpo llega intacto a la verificación |
| Mismo `webhook-id` reenviado | 200 (un solo evento registrado) |
| Un byte alterado / sin cabeceras / firma de otro secreto / timestamp de 1 h | **401** las cuatro |
| 15 GET simultáneos a `/api/orders` | todos 200, 430–1000 ms (con `max: 1` se colgaban; ver abajo) |
| Crear cobro con API key inválida | 502 genérico en 444 ms; no queda orden |
| Persistencia tras redeploy | `events` = 1 y `limits` = 2 antes y después |

## Hallazgo corregido: `max: 1` y el pooler transaccional
Por el puerto 6543 con `max: 1`, varias consultas simultáneas en la misma conexión se colgaban (timeout a 15 s); con `max: 3` o por el puerto 5432 funcionan. `openDb` pasó a `max: 3` (`6c9c990`). Las pruebas locales (Postgres directo) no lo reproducen: la prueba real es la de 15 GET simultáneos de arriba.

## Notas
- La conexión cliente→pooler usa TLS (`ssl: 'require'`). `pg_stat_ssl` marca `false` solo porque mide el tramo pooler→BD.
- Host directo `db.<ref>.supabase.co` solo IPv6: todo va por `aws-1-us-east-1.pooler.supabase.com`.
- Un evento firmado sin orden ni `metadata.attempt` queda «recibido» sin procesar a propósito (la conciliación al consultar lo cubre).
- El aviso de Node (`engines` 24.x sobre 26.x del proyecto) es inofensivo.

## Pruebas adicionales
- **Data API:** desactivada por Diego en el dashboard. Con la clave `anon` (pública), `GET /rest/v1/orders` y `/graphql/v1` responden 503 `PGRST002` y no devuelven datos. La defensa real sigue siendo RLS + `REVOKE` (verificada arriba).
- **Fallo de conexión a la BD** (en local, mismo `openDb`, `connect_timeout: 10`). `GET /api/orders` con BD caída da 502 en 19 ms (puerto cerrado), 10,0 s (host sin respuesta) y 0,95 s (contraseña incorrecta en el pooler real). `POST /webhook` **firmado** con la BD caída da 502 en 17 ms, 10,0 s y 0,9 s: no se marca nada como procesado y el emisor puede reintentar (el webhook sin firma válida da 401 antes de tocar la BD). El peor caso es 10 s, por debajo de cualquier límite de función.
- **Duración de función (Hobby):** el proyecto tiene Fluid Compute activo (`resourceConfig.fluid: true`, vía API de Vercel). El panel no expone el tope; con Fluid, Vercel documenta 300 s por defecto en Hobby. Los peores caminos nuestros son pey 15 s (crear) y 12 s (paginación) más la BD, muy por debajo. Confirmar en Settings → Functions → Max Duration.
- **Secretos:** ningún valor de `preview.env` aparece en el árbol ni en el historial de git (escaneo por valor). `supabase/.temp`, `.vercel` y `.env.local` quedan ignorados.

## Pendiente de H7
- [ ] Arranque en frío tras ≥10 min de inactividad (medición en curso; ver abajo).
- [ ] Aprobación de Diego de la compuerta de producción.
