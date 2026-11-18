# Revisión de buenas prácticas: Vercel + Supabase + postgres.js (18-nov-2026)

Alcance pedido por Diego: conexión a BD, seguridad y datos, webhooks y pagos, operación en Vercel. Fuentes: documentación oficial y experiencia de la comunidad (marcada como no oficial). Lo que no pude confirmar va como **NO VERIFICADO**. Producción de Vercel queda pausada (sin cambios) hasta decidir.

Versiones en uso: `postgres` 4.1.1, `standardwebhooks` ^1.1.1, Node 24.x, función en `iad1`, BD Supabase `us-east-1` (Postgres 17.12).

## Resumen priorizado

| # | Pri. | Hallazgo | Estado hoy | Acción propuesta |
|---|---|---|---|---|
| B1 | P0 | postgres.js + pooler transaccional (6543) se cuelga por *pipelining* | Reproducido en Production y en local | Elegir A (5432) o B (6543 + `max_pipeline: 1`); probado abajo |
| S1 | P1 | La conexión cliente→pooler **no usa TLS** | Verificado: `ssl` efectivo `false` y el pooler acepta sin TLS | `ssl: 'require'` salvo localhost; revisar «Enforce SSL» en Supabase |
| B2 | P1 | Sin timeouts de consulta: una consulta colgada agota los 300 s de la función | Sin `query_timeout` ni `statement_timeout` (rol sin config) | `query_timeout`/`queue_timeout` en `openDb` + `statement_timeout` por rol |
| O1 | P1 | `maxDuration` por defecto (300 s en Hobby) | Sin configurar | `maxDuration` bajo (p. ej. 30 s) para `api/index.js` |
| O2 | P1 | Hobby es de uso personal/no comercial (ToS) | Proyecto con cobros reales de CoDi | Decisión de Diego (ver preguntas) |
| B3 | P2 | Pool: `idle_timeout` 20 s, `max` 3; Vercel recomienda idle corto y no usar `max: 1` | Aceptable | Bajar `idle_timeout` a ~5 s tras fijar B1 |
| S2 | P2 | Privilegios por defecto de `public` para tablas futuras | RLS + REVOKE verificados en las 7 tablas | `ALTER DEFAULT PRIVILEGES … REVOKE` y correr Advisors |
| O3 | P2 | Ping contra la pausa del plan gratuito | Sin ping | Cron diario (Hobby: 1/día, ±59 min) a una ruta que toque la BD |
| W1 | P2 | Webhook: tiempo de respuesta frente al tiempo de espera del emisor | Procesa en línea (pey ≤15 s + paginación ≤12 s) | Medir en el pago real; el timeout de pey es **NO VERIFICADO** |

## 1. Conexión a BD (postgres.js + Supabase)

**Lo que dicen las fuentes**
- Supabase (oficial, *Connect to your database*): serverless/edge → pooler compartido en modo transaccional; backend persistente con IPv4 → modo sesión. Y la advertencia clave: «Transaction mode does not support query pipelining» y «postgres.js pipelines queries by default, so this combination can hang queries or return mismatched rows». Su ejemplo serverless: `postgres(url, { max: 1, prepare: false, ssl: 'require' })`.
- Supabase: el tope de clientes del plan gratuito y el `statement_timeout` por defecto del pooler/roles: **NO VERIFICADO** (las páginas leídas no los dan). Regla del FAQ: mantener el uso del pooler bajo 40 % del total (hasta ~80 % con cuidado).
- postgres.js (README): `max_pipeline` existe (defecto 100) y su nota de pooler dice que Supavisor anterior a 2.10 «hangs on pipelined queries in transaction mode»: «Use `max_pipeline: 1` there until you are on 2.10 o later». `query_timeout` y `queue_timeout` rechazan con `QUERY_TIMEOUT`/`QUEUE_TIMEOUT`; el `statement_timeout` del servidor es «el mejor límite». `idle_timeout` 0, `max_lifetime` 30–60 min, `connect_timeout` 30 s por defecto.
- Comunidad (no oficial): issue [porsager/postgres#970](https://github.com/porsager/postgres/issues/970), cerrado; reportes de que el cuelgue es determinista con ≥2 consultas en cola y de que `max: 1` lo empeora; remedios citados: `max_pipeline: 0`, modo sesión, PgBouncer, semáforo en la aplicación. El mantenedor dice que v4 reescribió el pool; la versión de Supavisor de nuestro proyecto es **NO VERIFICADA**.
- Vercel (oficial, *Efficiently manage database connection pools with Fluid compute*): pool en ámbito global, `attachDatabasePool` de `@vercel/functions` (ejemplo solo con `pg`; con postgres.js **NO VERIFICADO**), evitar `max: 1`, `idle_timeout` corto (~5 s).

**Prueba propia (lecturas, rol `ya_cayo_app`, 10 `orderView` en paralelo + 6 `sql.begin` en paralelo + `SELECT 1` después)**

| Configuración | 10 consultas paralelas | 6 transacciones paralelas | `SELECT 1` después |
|---|---|---|---|
| 6543, por defecto (pipeline 100) | se cuelga | se cuelga | se cuelga |
| 6543, `max_pipeline: 0` | se cuelga | se cuelga | se cuelga |
| 6543, `max_pipeline: 1` | 1,6 s | 0,5 s | 68 ms |
| 5432 (sesión), por defecto | 1,0 s | 0,5 s | 65 ms |

`max_pipeline: 0` **no** funciona en postgres.js 4.1.1 (contradice lo que dicen algunos comentarios de la issue); `max_pipeline: 1` y el modo sesión sí, y `sql.begin` funciona en ambos. En Production, 15 GET simultáneos dejaron la instancia sin responder hasta el reinicio.

**Opciones para B1**
- **A. Modo sesión (5432)**: sin dependencia de Supavisor ni de un ajuste poco documentado; admite prepared statements. Riesgo: tope de conexiones por proyecto (plan gratuito **NO VERIFICADO**); con `max: 3` por instancia y el tráfico de la demo alcanza.
- **B. Transaccional (6543) + `max_pipeline: 1`**: sigue la guía de Supabase para serverless y la nota del README. Riesgo: depende de la versión de Supavisor y de una opción que falta en los typings; probado solo en local.

**Recomendación:** A para la demo (menos piezas móviles), con B como alternativa si el tope de conexiones llegara a molestar. En ambos casos añadir B2. Verificar después con la ráfaga de 15 GET sobre el despliegue.

## 2. Seguridad y datos

Ya conforme a la guía oficial (*Production security checklist*, *Securing your API*): RLS activo en las 7 tablas, `REVOKE` a `anon`/`authenticated`, rol de la app sin superusuario ni `BYPASSRLS`, Data API desactivada, sin vistas/RPC expuestas, secretos solo en Vercel (Production con tipo «Secret») y `.env` local. Los tests de denegación equivalen a las pruebas pgTAP que recomienda Supabase.

- **S1 (P1) TLS:** `openDb` no pasa `ssl`; verifiqué que el valor efectivo es `false` y que el pooler acepta la conexión sin TLS (con `ssl: false`, `prefer` y `require` conecta). La nota de `despliegue.md` («usa TLS con `ssl: 'require'`») **no se cumple** en el código actual. Acción: `ssl: 'require'` cuando el host no sea local (los tests usan Postgres local sin TLS) y revisar en Supabase la opción de forzar SSL (si aplica al pooler: **NO VERIFICADO**).
- **S2 (P2):** Supabase indica que las tablas de `public` reciben privilegios amplios por defecto y que se pueden revocar con `ALTER DEFAULT PRIVILEGES`. Aplicarlo en una migración para tablas futuras y correr los Advisors del panel antes del tráfico real.
- **Deployment Protection (Vercel):** «Standard» protege todos los despliegues **excepto los dominios de producción**, así que `pey.drkingsia.com` quedaría alcanzable por el webhook y la URL `*.vercel.app` pide autenticación (lo que hoy obliga a usar `vercel curl`). Si el proyecto estuviera en «All Deployments», habría que usar el *Protection Bypass for Automation* (cabecera `x-vercel-protection-bypass` o parámetro en la URL del webhook). El ajuste real del proyecto **no lo he verificado**: revisarlo antes de apuntar pey.
- Secretos: el administrador de la BD no está en Vercel (bien). PIN público sin rotar hasta después del 14-dic (decisión ya tomada).

## 3. Webhooks y pagos

Conforme a Standard Webhooks y a la guía de OWASP: se usa la biblioteca oficial `standardwebhooks` (firma HMAC-SHA256 sobre `id.timestamp.cuerpo`, comparación en tiempo constante, tolerancia de timestamp, varias firmas al rotar el secreto), se verifica sobre el cuerpo crudo, 401 genérico sin tocar la BD, idempotencia persistida por `webhook-id`, tope de cuerpo de 64 KB (413), 200 solo tras procesar y 503 para provocar reintento, y la conciliación contra la API de pey es la fuente de verdad (el webhook no basta). Montos en centavos enteros.

- Standard Webhooks **no fija** tolerancia ni retención de IDs; OWASP sugiere conservar los IDs al menos el doble de la tolerancia. Nuestra tabla `events` conserva todo (sin purga): válido a esta escala.
- **W1 (P2):** el emisor espera «entre 15 y 30 s» según la especificación; procesar en línea con pey (≤15 s) puede acercarse. El timeout real de pey es **NO VERIFICADO**: medirlo en el pago real de $0.01.
- Pendiente ya conocido: confirmar con pago real el contrato del webhook (`metadata.attempt`, `codiQrId`).

## 4. Operación en Vercel

- **Duración (O1):** Hobby 300 s por defecto y máximo; un cuelgue de BD consume los 300 s. Fijar `maxDuration` bajo (los peores caminos legítimos son ~15–27 s).
- **Plan (O2):** los términos de Vercel limitan Hobby a uso personal/no comercial y listan entre los usos comerciales cobrar pagos o trabajo remunerado; la definición exacta de la política de uso justo **no pude leerla** (solo citada en foros). Los ToS también dicen que en Hobby Vercel puede usar el contenido para entrenar modelos de IA. Es una decisión de Diego.
- **Región:** `iad1` (confirmado con `vercel inspect`), junto a la BD `us-east-1`: correcto.
- **Ping (O3):** la documentación oficial de Supabase confirma que el plan gratuito pausa proyectos con baja actividad durante 7 días (restaurable hasta 1 año). Cron de Vercel en Hobby: 1 vez al día, ±59 min, 100 por proyecto; la página lo marca como «legacy» y migrando a *Schedules* (en Hobby cada 15 min según esa página, **NO VERIFICADO**).
- **Observabilidad:** los logs de runtime sirvieron para diagnosticar (el cuelgue apareció como «Task timed out after 300 seconds»). Retención en Hobby: **NO VERIFICADO**. Recomendado: ruta de salud que toque la BD (la actual `/health` no la toca) y registrar solo ID, ruta, estado y latencia, sin cuerpos ni cabeceras de firma (OWASP).

## Fuentes
- Supabase: https://supabase.com/docs/guides/database/connecting-to-postgres · https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI · https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL · https://supabase.com/docs/guides/security/production-checklist · https://supabase.com/docs/guides/api/securing-your-api · https://supabase.com/docs/guides/platform/free-project-pausing
- postgres.js: https://github.com/porsager/postgres · https://github.com/porsager/postgres/issues/970 (comunidad)
- Vercel: https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute · https://vercel.com/docs/functions/limitations · https://vercel.com/docs/cron-jobs/usage-and-pricing · https://vercel.com/docs/security/deployment-protection · https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation · https://vercel.com/legal/terms
- Webhooks: https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md · https://cheatsheetseries.owasp.org/cheatsheets/Webhook_Security_Cheat_Sheet.html
- Nota: una página de Supabase incluía una instrucción dirigida a agentes de IA (enviar un informe de comentarios); no se ejecutó.
