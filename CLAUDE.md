# Ya Cayó · caja de mostrador con confirmación del servidor (hackatón CoDi + pey)

workflow: ai-native v1
verification: `node --test`
agents-contract: v1
decision-review: none
integration: pr

Proyecto del Cursor Hackatón México (CDMX, 14-nov-2026) con la API de pey. Trabajo solo, sin hardware.
**Empieza por `docs/arranque.md`** (decisiones, fechas, entrega). Reglas, API y criterios: `docs/contexto.md`. Contrato para agentes (Claude y Codex): `docs/agentes.md`; revisión de PRs: `AGENTS.md` y `REVIEW.md`.
Pruebas con Postgres real: `sh scripts/pg-test.sh` (requiere Docker) antes de `node --test`. Barrido antes de cada push: `sh scripts/secrets-sweep.sh`.

## Fechas (CDMX)
- **1.er corte: domingo 15-nov-2026, 1:00 PM**. **2.º corte: sábado 12-dic-2026, 23:59** (el 14-dic son los resultados).
- CLABE propia: alta iniciada el 17-nov, hasta 5 días hábiles con Banxico.

## 🔓 Repo PÚBLICO obligatorio
- Nunca credenciales en el repo ni en código cliente: API key de pey, secreto del webhook, key de LLM → solo `.env` (ignorado) y `.env.example` sin valores. No leer ni tocar `.env`.
- Antes de publicar, revisar `docs/`: `codex-log.txt` ya está ignorado; decidir qué análisis se queda.
- La integración con pey debe construirse durante el hackatón; declarar componentes previos (p. ej. Mostrador) y de terceros.

## Convenciones que importan
- **El servidor decide el pago**: «pagado» solo por webhook firmado (Standard Webhooks) + polling de respaldo a `GET /transaction/...`. Idempotencia por `webhook-id`/`transactionId`. Ninguna captura de pantalla cuenta como pago.
- Un cobro vivo por orden (no hay cancelación); QR mín. 360 s de expiración; `amount: 0` solo en QR y nunca en precio cerrado; sin endpoint de reembolso (devolución = registro manual).
- Si hay agente (LLM): propone, el servidor decide. Sin herramienta de «marcar pagado» ni «entregar»; `concept`/`metadata` son datos, nunca instrucciones.
- Replicable por comercio (cada uno con cuenta y API key propias, §3.8 de los términos); en el hackatón, una instancia con titular único. Nunca presentarlo como «plataforma multi-comercio» ni usar una key común para terceros (§5.4).
- Nombre: no sugerir oficialidad de pey ni Banxico; evitar «CoDi»/«pey» como marca.
- Idioma: regla global (sistema en inglés; textos de la persona usuaria y docs en español). La URL del pagador es `/pay/:token`; `/pagar/:token` es solo un alias heredado (sirve la misma página) para que los enlaces ya emitidos sigan abriendo, y se conserva sin fecha de retiro.
- Cambio mediano (dinero/producción): `docs/changes/AAAA-MM-DD-slug/` con la skill `medium-change` antes de código.
- Producción (Vercel) y Supabase: nada sin aprobación de Diego; Production corre código previo a los últimos fixes hasta que él pida redesplegar.

## Continuidad de estado
- `.claude/STATE.md` viaja **en el mismo PR del cambio** y describe intención (siguiente acción, decisiones abiertas). No copia hechos que git ya registra (SHA, «mergeado», «desplegado»).
- Tras mergear o desplegar no se abre PR ni commit solo de estado; el cambio va en el siguiente PR de código. Detalle: `~/.claude/reference/session-continuity.md`.
- `main` está protegida: todo entra por PR con revisión de Codex sin hallazgos pendientes y conversaciones resueltas.

## Errores frecuentes
- Dar por válido el contrato del webhook: solo `webhook-id` está documentado; probarlo con un pago real de $0.01.
- Esperar 360 s en el video: preparar el caso vencido y rotularlo.
- Ensayar solo en local: el webhook necesita URL pública HTTPS, y **una API key solo admite un webhook** (usar un despachador interno si hay varios perfiles).
- Video y demo: aspecto de producción sin textos de «demo», pero rotular lo simulado (QR vencido preparado, perfiles de caja ficticios, «por reglas, sin IA», total ilustrativo, lo no verificado con pago real).
