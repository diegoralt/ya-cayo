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
- La conexión cliente→pooler usaba TLS en preview solo porque esa URL llevaba `sslmode=require`; la URL de Production (18-nov) no lo llevaba y `openDb` no pasaba `ssl`, así que iba **sin cifrar** (el pooler lo acepta). Corregido en código: `openDb` exige `ssl: 'require'` salvo localhost (`buenas-practicas.md` S1). `pg_stat_ssl` marca `false` porque mide el tramo pooler→BD.
- Host directo `db.<ref>.supabase.co` solo IPv6: todo va por `aws-1-us-east-1.pooler.supabase.com`.
- Un evento firmado sin orden ni `metadata.attempt` queda «recibido» sin procesar a propósito (la conciliación al consultar lo cubre).
- El aviso de Node (`engines` 24.x sobre 26.x del proyecto) es inofensivo.

## Pruebas adicionales
- **Data API:** desactivada por Diego en el dashboard. Con la clave `anon` (pública), `GET /rest/v1/orders` y `/graphql/v1` responden 503 `PGRST002` y no devuelven datos. La defensa real sigue siendo RLS + `REVOKE` (verificada arriba).
- **Fallo de conexión a la BD** (en local, mismo `openDb`, `connect_timeout: 10`). `GET /api/orders` con BD caída da 502 en 19 ms (puerto cerrado), 10,0 s (host sin respuesta) y 0,95 s (contraseña incorrecta en el pooler real). `POST /webhook` **firmado** con la BD caída da 502 en 17 ms, 10,0 s y 0,9 s: no se marca nada como procesado y el emisor puede reintentar (el webhook sin firma válida da 401 antes de tocar la BD). El peor caso es 10 s, por debajo de cualquier límite de función.
- **Duración de función (Hobby):** el proyecto tiene Fluid Compute activo (`resourceConfig.fluid: true`, vía API de Vercel). El panel no expone el tope; con Fluid, Vercel documenta 300 s por defecto en Hobby. Los peores caminos nuestros son pey 15 s (crear) y 12 s (paginación) más la BD, muy por debajo. Confirmar en Settings → Functions → Max Duration.
- **Secretos:** ningún valor de `preview.env` aparece en el árbol ni en el historial de git (escaneo por valor). `supabase/.temp`, `.vercel` y `.env.local` quedan ignorados.

## Pendiente de H7
- [x] Arranque en frío: tras 12 min de inactividad, `/health` 0,80 s y `/api/orders` 0,51 s a la primera; 0,38 s y 0,29 s a la segunda. Tras pocos minutos: 1,05 s la primera `/health`. El coste del frío es ≲ 0,5 s sobre el caliente.
- [x] Aprobación de Diego de la compuerta de H7 (17-nov-2026), con la evidencia de este archivo.

## H8b · Corte real SQLite → Postgres (18-nov-2026, aprobado por Diego)
- **Preflight (solo lectura, producción `uogquzsxfwpnzrywwsvt`):** 4 migraciones aplicadas (las de `supabase/migrations/`), 7 tablas con RLS, las cinco de datos y `limits` en 0, `ya_cayo_app` sin superusuario ni `BYPASSRLS`, secuencias vírgenes.
- **Congelación:** se detuvo solo el servidor del túnel (proceso con `ya-cayo.sqlite` abierto, puerto 8787); el túnel `yacayo` y el SQLite quedan intactos. Sin `-wal` ni `-journal`.
- **Copia:** `~/.config/ya-cayo/backup-2026-11-18.sqlite` (fuera del repo, modo 600), sha256 `217f8ccb158bfb50ca119b8ee61ba81f143bcdb432ca3094d2f2a412a5f3b4e1`, idéntico al original antes y después.
- **`--aplicar`** (administrador por pooler 5432): insertó orders 10, transactions 8, records 2, events 1, deliveries 3 (= origen). Verificación estricta como `ya_cayo_app` (6543, con RLS): OK.
- **`--verificar` aparte** (administrador): OK, mismo conteo. SQLite original sin cambios (sha256 igual).
- **Estado tras el corte:** PG es la fuente de verdad; el webhook de pey sigue apuntando al túnel viejo (servidor detenido) hasta H9. Los pagos del intervalo se confirman por conciliación al consultar (ventana de 30 min).
- **Reversión:** PG sigue siendo la fuente; el importador es repetible y no pisa hechos nuevos de PG.

## H9 · Hallazgos de la prueba de humo de Production (18-nov-2026)
- Despliegue a Production con las 6 variables; `/`, `/pagar/x`, `/health` y rutas sin PIN responden bien. Con el PIN válido, `GET /api/orders` y luego `/api/metrics` se colgaron 300 s («Task timed out after 300 seconds»).
- Causa: postgres.js hace *pipelining* y el pooler transaccional (6543) no lo soporta (documentado por Supabase). Primero se secuencializó `orderView` (`b2d007a`); una ráfaga de 15 GET simultáneos aún dejaba la instancia sin respuesta. En H7 no apareció porque la lista estaba vacía.
- Prueba propia contra la BD (10 consultas y 6 transacciones en paralelo): 6543 por defecto y con `max_pipeline: 0` se cuelgan; 6543 con `max_pipeline: 1` y el modo sesión 5432 funcionan.
- Decisión de Diego (18-nov): usar **modo sesión (5432)** y re-evaluar 6543 + `max_pipeline: 1` después. Más: TLS obligatorio, `query_timeout`/`queue_timeout`, `maxDuration` 30 s y migración de privilegios por defecto. Detalle y fuentes en `buenas-practicas.md`.

## H9 · Entrada a producción (18-nov-2026, aprobado por Diego paso a paso)
- **Supabase:** migración `20261118000000_revoke_default_privileges` aplicada con `supabase db push` (dry-run mostrado antes); las cinco migraciones coinciden local/remoto.
- **Vercel Production:** `DATABASE_URL` cambiada al pooler de sesión `aws-1-us-east-1.pooler.supabase.com:5432` (rol `ya_cayo_app`) y redespliegue. Prueba de humo con `vercel curl`: `/health` y `/api/orders` 200 (0,7 s); **15 GET simultáneos a `/api/orders`: 15 × 200, 0,60–1,33 s**, y la instancia siguió respondiendo (con 6543 se colgaba).
- **Dominio:** `pey.drkingsia.com` asignado al proyecto `ya-cayo`; en Cloudflare, CNAME `pey` → `2056899e2b2e174b.vercel-dns-017.com` en «DNS only» (sin proxy). Verificado: `dig` devuelve el CNAME de Vercel, `/health` 200 con `server: Vercel`, TLS válido, `POST /webhook` sin firma → 401 (Deployment Protection no lo bloquea).
- **Webhook de pey:** URL única `https://pey.drkingsia.com/webhook`; el secreto no cambió (generado el 14-nov) y coincide con `PEY_WEBHOOK_SECRET` (prefijo/sufijo; la firma válida de la entrega real lo confirma).
- **Túnel y Mac:** `cloudflared tunnel run yacayo` detenido (Cloudflare: sin conexiones activas; el túnel y su configuración no se borran, para revertir). Se encontró además `node src/server.js` (versión anterior al corte, activo desde el 14-nov, puerto 8799) y se detuvo: no queda proceso local ni ruta pública hacia el Mac.
- **Pago real de $0.01 (orden 11), con la caja y la página de pago cerradas:** pago 01:05:44 UTC (19:05 CDMX); pey entregó el webhook con **200**; evento recibido 01:05:47 y procesado 01:05:48, es decir, lo confirmó el webhook y no una consulta. Orden `paid`, una transacción `valid` de 1 centavo, `deliveries = 0`.
- **Entrega y reenvío:** entrega desde la caja a las 01:12:13 UTC (`deliveries = 1`). Reenvío del mismo `webhook-id` con timestamp nuevo y firma válida (el portal de pey no ofrece reenviar; cuerpo reconstruido del log de pey, firmado con un script local fuera del repo): **200 antes y después de entregar**, sin cambios: `deliveries = 1`, 1 transacción, 2 eventos, mismo `processed_at`.
- **Contrato real del webhook (hallazgo):** cuerpo plano (`type`, `codiQrId`, `transactionId`, `amount` en la raíz, sin `data`; `amount` en pesos) y la correlación llega en `metadata.externalMetadata.attempt`, no en `metadata.attempt`. El camino normal (por `qr_id`) no se veía afectado; el respaldo por `attempt` sí. Corregido en `src/reconciliation.js` con un test que usa la forma real (falla sin el arreglo; suite 76/76).
- **Logs de runtime en Hobby:** `vercel logs` devolvió 0 registros y rechaza ventanas largas; la evidencia sale de la base y del portal de pey.
- **Salvedades:** el pago se hizo desde la red de Diego, no desde «otra red» (el DNS ya no tiene ruta al Mac); **la rotación del PIN queda diferida** hasta después del 14-dic (decisión de Diego). El tiempo de respuesta del webhook frente al timeout de pey (W1) no se midió con precisión: el 200 llegó dentro del plazo de pey en el pago real.
