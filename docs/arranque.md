# Arranque · leer primero en una sesión nueva (2026-11-14)

## Decisiones tomadas (no reabrir sin motivo)
- **Foco: adopción de CoDi** (facilitar a quien cobra sin dejar fuera a quien paga). Producto para varios comercios, el comercio primero, adopción como filtro.
- **Producto: «Caja cierta»**: el comercio crea un cobro por ticket (QR de monto fijo desde pey), ve «esperando confirmación», el servidor confirma (webhook firmado + polling) y habilita una **entrega única**; sin capturas de pantalla; alerta de voz; corte del día. El pagador ve beneficiario real, concepto y monto, y recibo. **Métrica antes/después** (clics, cambios de app, tiempo); contador de entregas que se queda en uno al reprocesar un evento.
- **Nombre: Ya Cayó** (slug `ya-cayo`; «cobra con certeza»). «Ya cayó el pago» = el momento que el producto garantiza.
- **«Replicable por comercio» aceptado**: términos de pey §3.8 (el titular conserva cuenta, credenciales y cuentas destino; informar a Koshi quién es el proveedor). Prohibido sin contrato §5.4: plataforma que registra comercios ajenos, cuenta concentradora, cobrar a favor de terceros. Detalle verificado en `contexto.md` («Términos API de pey verificados»).
- **Agente (propone, el servidor decide)**: #1 captura de ticket por dictado/texto con confirmación humana del monto (1.er corte solo si el núcleo ya funciona); #2 asistente de excepciones (tardío, duplicado, vencido, devolución) y #3 corte del día, para el 2.º corte; #4 guía del pagador sin LLM.

## Qué se evalúa (1–10 ponderado)
Uso de CoDi y API de pey 30 · Impacto 25 · Ejecución técnica 15 · Experiencia y diseño (incluye el momento de pagar) 15 · Originalidad 15. Desempate: CoDi/pey, luego impacto.

## Entrega (lista de verificación)
- [ ] Repo público · [ ] app en vivo pública sin invitación (credenciales de prueba si pide login) · [ ] video ≤ 3 min con el cobro de inicio a fin · [ ] descripción ≤ 500 palabras con cómo se usa pey · [ ] instrucciones de prueba ≤ 1000 palabras · [ ] declaración de componentes previos y de terceros · [ ] integrantes y correos · [ ] formulario enviado antes del dom 15-nov 1:00 PM.

## Primeras tareas (en este orden)
1. **Bloqueo común:** confirmar cuenta/CLABE preautorizada/API key en portal.pey.mx; ¿hay sandbox (§3.5 dice que sí)?; app bancaria del pagador distinta a la del cobro.
2. **Probar si un QR de monto fijo se puede pagar dos veces** (condiciona el diseño de entrega única).
3. Probar el webhook con un pago real de $0.01 (cabeceras, firma, ¿`webhook-id` se repite en reintentos?) con URL pública.
4. Spec + plan del 1.er corte con `cambio-mediano` (toca dinero real y producción): `docs/changes/2026-11-14-ya-cayo-primer-corte/`. **Decidir antes si la revisión de Codex va completa o recortada**: la entrega es mañana 1:00 PM y esa revisión consume tiempo.
5. **Lunes 16-nov: iniciar el alta de tu CLABE propia** (`POST /bank-account`, hasta 5 días hábiles con Banxico). Las CLABEs de los organizadores solo sirven para probar; para la demo pública del 2.º corte hace falta la tuya en `ACTIVE`. El webhook `bank.account.updated` solo avisa al pasar a ACTIVE; PENDING/ERROR se consultan con `GET /bank-account/{id}`.
6. **Pagador del jurado:** probar el pago desde un banco distinto al de la cuenta que cobra, y dejar el **link de pago con tarjeta** como respaldo por si el jurado no tiene CoDi en su app.

## Abierto
- Si Cursor es requisito (el 2.º corte cierra el **12-dic 23:59**, confirmado por Diego; resultados el 14-dic); Documento de Premios sin leer (bounties a más tardar 30-nov); consulta a legal@pey.mx (sin enviar).
- Créditos de IA solo para asistentes al kickoff: confirmar si cubren el agente.

## Mapa de `docs/`
`contexto.md` (evento, reglas, API, términos verificados) · `analisis-soluciones/` (rondas 1–3 y puntuaciones; `ronda3/sintesis.md` es el resumen; `ronda3/webhooks.md` lo leído de webhooks; `auditoria-sesgos.md`, `foco-adopcion.md`).
