# Ya Cayó

Caja de mostrador que cobra con CoDi mediante la API de pey y solo da por pagado lo que el servidor confirma (webhook firmado + conciliación de respaldo contra pey al consultar). Una entrega por cobro; ninguna captura de pantalla cuenta como pago.

- **Demo en vivo:** https://pey.drkingsia.com · **PIN de la caja: `147369`** (PIN de demo, solo para evaluar; se rota al terminar la evaluación).
- **Prueba en 1 minuto:** abre la URL → escribe el PIN → en el asistente escribe «dos cafés y un pan» → **Proponer cobro** → **Cobrar con CoDi** (con «Cobro de prueba» marcado se cobra $0.01). Pasos completos y casos a revisar: [Cómo probar](#cómo-probar-para-el-jurado).
- **Si la URL no responde:** la demo corre en Vercel (plan Hobby) con Postgres en Supabase (plan gratuito, que pausa proyectos inactivos); vuelve a intentar en unos minutos, o corre tu propia instancia con [Ejecutar en local](#ejecutar-en-local).
- **Descripción e instrucciones de prueba:** `docs/entrega/`. Pruebas automáticas: `node --test`.

## Cómo probar (para el jurado)
**Demo pública:** https://pey.drkingsia.com · PIN de la caja: `147369`. Sin celular con CoDi puedes recorrer los pasos 1 a 3 y ver el video; el pago real cuesta $0.01 MXN.

1. Abre la URL en un celular o tablet y escribe el PIN: verás la **caja**.
2. En el asistente escribe «dos cafés y un pan» y pulsa **Proponer cobro** (por reglas, sin IA). Con «Cobro de prueba» marcado, el total de lista es ilustrativo y se cobra $0.01. Pulsa **Cobrar con CoDi**.
3. Aparece el QR con cuenta regresiva de 6 minutos y el estado «Esperando confirmación». **Entregar** sigue desactivado: una captura de pantalla no cuenta como pago.
4. Abre el **enlace del pagador** (bajo el QR) o escanea el QR con la app de tu banco con CoDi activo y paga $0.01.
5. En unos segundos la caja muestra el sello **«Ya cayó»**, suena una alerta de voz y se habilita **Entregar**. La página del pagador dice «Pagaste».
6. Pulsa **Entregar**: el contador queda en 1 y no se puede repetir.
7. En **Métricas** ves tiempo de cobro, latencia de confirmación y entregas por orden (máx. 1).

**Casos que puedes revisar:** un QR sin pagar pasa a «Vencido» a los 6 minutos, sin entrega; «Paga con tarjeta o efectivo» solo registra la elección y no cobra; un monto mayor a $50 o un 4.º cobro vivo se rechazan con mensaje.

**Probado con pago real (18-nov-2026):** pago de $0.01 confirmado por el webhook firmado en Vercel, entrega única y reenvío del mismo `webhook-id` sin duplicar (`entregas = 1`). **No se probó con pago real:** pago tardío, duplicado y consulta fallida; están cubiertos por `node --test` con un pey simulado. Si el webhook no llega, la caja concilia contra pey al consultar (ventana de 30 min); sin proceso en segundo plano, con la caja cerrada se confirma en el siguiente acceso.

**Si algo falla:** recarga la caja; si el PIN se rechaza con «Demasiados intentos», espera un minuto. Para correrlo en local: `.env.example` → `.env`, `npm install && npm start`.

## Ejecutar en local
Requiere Node ≥ 24 y un Postgres (por ejemplo, un proyecto de Supabase). `cp .env.example .env`, completa las variables, aplica `supabase/migrations/` y corre `npm install && npm start` (escucha en `http://localhost:8787`). Pruebas: `sh scripts/pg-test.sh` (Postgres desechable en Docker) y luego `node --test` (usan un pey simulado, sin red ni credenciales de pey).

| Variable | Obligatoria | Qué es |
|---|---|---|
| `PEY_API_KEY` | sí | API key de **tu** cuenta de pey (portal → Desarrollador). Va como `Bearer` a `https://api.pey.mx`. |
| `PEY_WEBHOOK_SECRET` | sí | Secreto de firma del webhook que muestra el portal al crear el webhook (rotable). |
| `DEMO_PIN` | sí | PIN para entrar a la caja; elige el tuyo en tu instancia. |
| `HOLDER_NAME` | no | Nombre del titular de la cuenta que cobra; se muestra al pagador. |
| `DATABASE_URL` | sí | Conexión a Postgres con un rol **no administrador** (en Supabase, el pooler de **sesión**, puerto 5432; el transaccional 6543 cuelga a postgres.js). TLS obligatorio salvo en localhost. |
| `PORT` | no | Puerto del servidor local (default `8787`; no aplica en Vercel). |
| `CARD_FEE_RATE` | no | Supuesto de comisión de tarjeta para la recomendación de bono (default `0.03`). |

Nunca subas `.env`: está ignorado por git. Cada comercio usa su propia cuenta y API key.

### Configurar pey y CoDi
1. **Cuenta y API key:** regístrate en pey.build/signup, entra a portal.mipey.mx → Perfil → Finanzas y da de alta una cuenta de cobro de tipo `codi`; luego Desarrollador → API key.
2. **CLABE en CoDi:** el alta de una CLABE propia (`POST /bank-account`) pasa por Banxico y puede tardar **hasta 5 días hábiles**; `codiStatus` va de `PENDING` a `ACTIVE`. Empieza antes de necesitarla.
3. **Webhook:** en Desarrollador registra `https://<tu-dominio>/webhook` (HTTPS público; en local usa un túnel). **Una API key admite un solo webhook.** La firma es Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`) y el evento que usa la app es `codi.qr.payment_received`. Copia el secreto a `PEY_WEBHOOK_SECRET`.
4. **Si usas Cloudflare** delante del dominio: Bot Fight Mode (plan gratuito) desafía el POST de pey con un 403 y no se puede excluir con reglas. Deja el registro DNS sin proxy o usa otro host. Mientras el webhook no llegue, la conciliación al consultar confirma igual.
5. **Probar con dinero real:** paga **$0.01** desde la app de un banco con CoDi activo, distinto del banco que cobra. Las reglas de pey que la app respeta: QR de monto fijo con expiración mínima de 360 s, `amount: 0` solo en QR abiertos (nunca en precio cerrado), un cobro vivo por orden (no hay cancelación) y sin reembolso por API.
6. **Qué no publicar:** CLABE ni `trackingKey` (vienen en el payload del webhook), API key, secreto del webhook.

Detalle verificado de la API y de los términos de pey: `docs/contexto.md`.

### Despliegue (Vercel + Supabase)
La función `api/index.js` y los estáticos de `public/` se sirven desde Vercel (`vercel.json`); las variables de la tabla van en Vercel (Production) y la base es un proyecto de Supabase con RLS activo y el rol de la app sin privilegios de administrador. El dominio apunta con un CNAME **sin proxy** (DNS only). Hobby limita el uso a personal/no comercial: detalle y decisión en `docs/contexto.md`; evidencia del despliegue en `docs/changes/2026-11-15-hosting-vercel/despliegue.md`.

## Versión 1 (este repositorio)
Cobro con QR de monto fijo, confirmación por el servidor, entrega única, métricas medidas por el servidor y un asistente de captura **por reglas, sin IA** que propone concepto y total a partir de un texto como «dos cafés y un pan».

## Versión 2 (planeada, no implementada)
Un agente con IA recibirá la lista de productos y piezas a cobrar, calculará el total y generará el cobro de pago para CoDi con la API de pey. Regla de diseño: el agente propone, el cajero confirma y el servidor decide; el agente no tiene herramientas para marcar pagado ni entregar, y el texto de los productos se trata como dato, nunca como instrucción.

## Alcance
Una instancia por comercio, con su propia cuenta y API key de pey. No es una plataforma multi-comercio ni cobra a nombre de terceros. Sin reembolso por API (la devolución es un registro manual). No es un producto oficial de pey ni de Banxico.
