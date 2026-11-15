# Alojar Ya Cayó en Vercel + Supabase, sin depender de mi máquina

- **Pidió:** Diego · 2026-11-15 · chat (sesión Claude Code)
- **Por qué es mediano:** producción (despliegue, dominio, webhook público), BD (de SQLite local a Postgres) y dinero (el webhook confirma pagos reales); más de medio día.

## Lo que se pidió
> antes de avanzar con la implementación quiero ajustar donde tenemos la solución hospedada, migremos para que la solución este hospedada en Vercel en lugar de tenerlo en mi máquina local y no dependa de que la tenga encendida todo el tiempo

Decisiones del mismo día: base de datos = **Postgres desde Supabase**; el polling de respaldo se resuelve **conciliando al consultar** (sin cron); dominio `pey.drkingsia.com` apuntado a Vercel con DNS **sin proxy** de Cloudflare (nube gris); commits de docs ahora.

## Qué cuenta como terminado
- `https://pey.drkingsia.com` sirve la caja y la página del pagador desde Vercel, con el Mac apagado y el túnel de Cloudflare detenido.
- Los datos viven en Supabase Postgres; reiniciar o redesplegar no pierde órdenes, entregas ni eventos. **Migración:** respaldo consistente del SQLite actual, importación repetible de las cinco tablas conservando ids/tokens/QR/fechas/relaciones y ajustando secuencias; conteos y métricas cotejados y una orden ya entregada sigue sin poder entregarse otra vez; pausa de escrituras durante el corte, un único escritor después y rollback que no pierde hechos escritos en Postgres. Pruebas y previews usan otra BD y nunca la API key real.
- El webhook de pey llega a Vercel sin desafío de Cloudflare (200 con firma válida, 401 sin ella) y un pago real de $0.01 se confirma de inicio a fin; reenvío del mismo `webhook-id` deja entregas = 1.
- El estado «pagado» sigue solo por webhook firmado + consulta a pey. Sin proceso de fondo, la conciliación de respaldo ocurre al consultar (listado de la caja y lectura del pagador por token) sobre **las mismas órdenes y ventana que hoy** (vivas y hasta 30 min tras vencer, incluidas entregadas para detectar segundo pago), con frecuencia limitada por reserva atómica compartida con vencimiento. Se guarda un registro durable de conciliación pendiente que se retoma en el siguiente acceso. **Límite declarado:** con la caja cerrada y sin reintento del webhook, el pago se confirma al siguiente acceso, no antes (la confirmación sin acceso requeriría cron o reintentos de pey, no verificados); no se promete cobertura incondicional.
- **Idempotencia sobre Postgres con conexiones independientes:** restricciones únicas (`transaction_id`, `webhook_id`, `entregas.orden_id`), una transacción con bloqueo por orden, clasificación coherente con la transición ganadora, evento «recibido» distinto de «procesado» (un 503 debe poder reintentarse), UPDATE+INSERT de entrega inseparables. Probado: mismo evento simultáneo, dos pagos distintos, webhook vs lectura, doble entrega, rollback, caída tras registrar el evento.
- **Creación de QR recuperable:** intento con identificador estable y estado durable; si la función muere tras aceptar pey el QR, el reintento del mismo intento no crea otro y un webhook anticipado se conserva. Se verifica qué idempotencia/búsqueda ofrece pey (no se asume `numRef`).
- Mismo comportamiento de H4 (tope $50, vencido/tardío/duplicado, métricas); el máx. 3 vivos y el límite de 10 fallos de PIN por minuto se aplican con **contador compartido y atómico** (cuatro POST simultáneos no pasan de 3; 10 fallos repartidos entre instancias dan 429), con la IP tomada de la cabecera confiable de Vercel (la falsificada `cf-connecting-ip` no cuenta). `node --test` en verde sobre la capa de datos nueva, contra una Postgres de prueba que falla claro si no está disponible.
- Entorno destino probado en un despliegue aislado: `/`, `/pagar/:token`, APIs y firma sobre cuerpo crudo, arranque en frío y tras inactividad, driver/TLS/pooler transaccional (sin prepared statements) con Supabase, timeouts y cancelación hacia pey.
- Secretos (`PEY_API_KEY`, `PEY_WEBHOOK_SECRET`, `DEMO_PIN`, cadena de conexión de Supabase) solo en variables de entorno de Vercel y `.env` local; nada en el repo ni en el cliente; `.env.example` sin valores.
- Denegación verificable aunque el atacante conozca la URL y la clave anon de Supabase: RLS activo sin políticas permisivas en todas las tablas, grants revisados, sin vistas/RPC que lo salten (o Data API deshabilitada); probado lectura/inserción/modificación/borrado con roles públicos. El servidor usa un rol propio con permisos explícitos.
- Cambio de ruta con evidencia: DNS efectivo sin destinos viejos, certificado válido, dominio en el deployment correcto, protección de despliegues de Vercel sin bloquear `/webhook`, un solo webhook por API key actualizado en pey y mecanismo de reversión. La prueba «Mac apagado» se hace desde otro dispositivo/red.

## Modelo de amenaza
- Repo y app **públicos**: quien vea el repo o la URL. P1 = secreto en repo/cliente; tablas legibles o escribibles desde internet vía la API de Supabase; webhook sin verificar firma; «pagado» sin evento firmado/consulta; entrega duplicada; PIN sin límite de intentos (hoy vive en memoria y en serverless no se conserva); desplegar con datos de prueba mezclados con producción. Carga a escala y multi-tenant: P2.
- Dinero: solo $0.01 reales de prueba.

## Fuera de alcance
- El agente con IA (cambio `2026-11-15-agente-v2`, queda para después de este).
- Alta de CLABE propia, rotar PIN (se hace al configurar variables nuevas), pase de UI, `docs/agentes.md`.
- Cron de Vercel / plan Pro; multi-comercio.
