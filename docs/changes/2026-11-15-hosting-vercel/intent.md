# Alojar Ya Cayó en Vercel + Supabase, sin depender de mi máquina

- **Pidió:** Diego · 2026-11-15 · chat (sesión Claude Code)
- **Por qué es mediano:** producción (despliegue, dominio, webhook público), BD (de SQLite local a Postgres) y dinero (el webhook confirma pagos reales); más de medio día.

## Lo que se pidió
> antes de avanzar con la implementación quiero ajustar donde tenemos la solución hospedada, migremos para que la solución este hospedada en Vercel en lugar de tenerlo en mi máquina local y no dependa de que la tenga encendida todo el tiempo

Decisiones del mismo día: base de datos = **Postgres desde Supabase**; el polling de respaldo se resuelve **conciliando al consultar** (sin cron); dominio `pey.drkingsia.com` apuntado a Vercel con DNS **sin proxy** de Cloudflare (nube gris); commits de docs ahora.

## Qué cuenta como terminado
- `https://pey.drkingsia.com` sirve la caja y la página del pagador desde Vercel, con el Mac apagado y el túnel de Cloudflare detenido.
- Los datos viven en Supabase Postgres; reiniciar o redesplegar no pierde órdenes, entregas ni eventos.
- El webhook de pey llega a Vercel sin desafío de Cloudflare (200 con firma válida, 401 sin ella) y un pago real de $0.01 se confirma de inicio a fin; reenvío del mismo `webhook-id` deja entregas = 1.
- El estado «pagado» sigue solo por webhook firmado + consulta a pey; sin proceso de fondo, la conciliación de respaldo ocurre al consultar una orden viva (caja y pagador, límite de frecuencia por orden), y un pago con la caja cerrada lo cubre el webhook.
- Mismo comportamiento de H4 (PIN, tope $50, máx. 3 vivos, vencido/tardío/duplicado, métricas); `node --test` en verde sobre la capa de datos nueva.
- Secretos (`PEY_API_KEY`, `PEY_WEBHOOK_SECRET`, `DEMO_PIN`, cadena de conexión de Supabase) solo en variables de entorno de Vercel y `.env` local; nada en el repo ni en el cliente; `.env.example` sin valores.
- Las tablas de Supabase no son accesibles por la API pública de Supabase (RLS activo sin políticas / sin exponer la clave anon): solo el servidor con su cadena de conexión.

## Modelo de amenaza
- Repo y app **públicos**: quien vea el repo o la URL. P1 = secreto en repo/cliente; tablas legibles o escribibles desde internet vía la API de Supabase; webhook sin verificar firma; «pagado» sin evento firmado/consulta; entrega duplicada; PIN sin límite de intentos (hoy vive en memoria y en serverless no se conserva); desplegar con datos de prueba mezclados con producción. Carga a escala y multi-tenant: P2.
- Dinero: solo $0.01 reales de prueba.

## Fuera de alcance
- El agente con IA (cambio `2026-11-15-agente-v2`, queda para después de este).
- Alta de CLABE propia, rotar PIN (se hace al configurar variables nuevas), pase de UI, `docs/agentes.md`.
- Cron de Vercel / plan Pro; multi-comercio.
