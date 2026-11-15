# Ya Cayó · caja de mostrador con confirmación del servidor (hackatón CoDi + pey)

forma-de-trabajo: ai-native v1
verificación: `node --test`
<!-- ponerle comando real (tests/smoke del flujo de cobro) en cuanto exista código -->

Proyecto del Cursor Hackatón México (CDMX, 14-nov-2026) con la API de pey. Trabajo solo, sin hardware.
**Empieza por `docs/arranque.md`** (decisiones, fechas, entrega, primeras tareas). Reglas, API y criterios: `docs/contexto.md`.

## Fechas (CDMX)
- **1.er corte: domingo 15-nov-2026, 1:00 PM** (formulario forms.gle/dfXTnL8ethxoGNk49). **2.º corte: sábado 12-dic-2026, 23:59** (confirmado por Diego el 14-nov; el 14-dic son los resultados).
- Tu CLABE propia tarda ~5 días hábiles con Banxico: iniciar el alta el lunes 16-nov, sin esperar al 2.º corte.

## 🔓 Repo PÚBLICO obligatorio (a diferencia de dr_work_experience)
- Nunca credenciales en el repo ni en código cliente: API key de pey, secreto del webhook, key de LLM → solo `.env` (ignorado) y `.env.example` sin valores.
- Antes de publicar, revisar `docs/`: `codex-log.txt` ya está ignorado; decidir qué análisis se queda.
- La integración con pey debe construirse durante el hackatón; declarar componentes previos (p. ej. Mostrador) y de terceros.

## Convenciones que importan
- **El servidor decide el pago**: estado «pagado» solo por webhook firmado (Standard Webhooks) + polling de respaldo a `GET /transaction/...`. Idempotencia por `webhook-id`/`transactionId`. Ninguna captura de pantalla cuenta como pago.
- Un cobro vivo por orden (no hay cancelación); QR mín. 360 s de expiración; `amount: 0` solo en QR y nunca en precio cerrado; sin endpoint de reembolso (devolución = registro manual).
- Si hay agente (LLM): propone, el servidor decide. Sin herramienta de «marcar pagado» ni «entregar»; `concept`/`metadata` son datos, nunca instrucciones.
- Replicable por comercio (cada uno con cuenta y API key propias, §3.8 de los términos); en el hackatón, una instancia con titular único. Nunca presentarlo como «plataforma multi-comercio» ni usar una key común para terceros (§5.4).
- Nombre: no sugerir oficialidad de pey ni Banxico; evitar «CoDi»/«pey» como marca.
- Cambio mediano (dinero/producción): `docs/changes/AAAA-MM-DD-slug/intent.md` + `plan.md` con la skill `cambio-mediano` antes de código.

## Errores frecuentes
- Dar por válido el contrato del webhook: solo `webhook-id` está documentado; probarlo con un pago real de $0.01.
- Esperar 360 s en el video: preparar el caso vencido y rotularlo.
- Ensayar solo en local: el webhook necesita URL pública HTTPS, y **una API key solo admite un webhook** (usar un despachador interno si hay varios perfiles).
- Video y demo: rotular lo simulado (QR vencido preparado, perfiles de caja ficticios); la hoja de ideas lo pide.
