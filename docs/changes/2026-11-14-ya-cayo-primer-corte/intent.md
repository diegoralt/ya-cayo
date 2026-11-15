# Ya Cayó · primer corte del hackatón: caja con confirmación del servidor

- **Pidió:** Diego · 2026-11-14 · chat (sesión Claude Code)
- **Por qué es mediano:** dinero real (cobros CoDi con $0.01 reales), producción (app pública con webhook en URL HTTPS) y más de medio día.

## Lo que se pidió
> El producto es «Caja cierta». Un QR de monto fijo por ticket, confirmación del servidor por webhook más polling, entrega única, sin capturas de pantalla, y métrica antes/después. Es replicable por comercio, con una instancia de titular único en el hackatón. El agente propone y el servidor decide; el agente #1 (captura de ticket) entra al 1.er corte solo si el núcleo ya funciona.
>
> Spec y plan del 1.er corte con la skill cambio-mediano (toca dinero real y producción) [...] No escribas código hasta que apruebe la spec y el plan. Mantén en vista los criterios de evaluación (CoDi/pey 30, impacto 25, ejecución 15, experiencia 15, originalidad 15) y las reglas de entrega: repo público sin credenciales, app en vivo, video ≤3 min, descripción ≤500 palabras, instrucciones ≤1000 palabras, declaración de componentes previos y de terceros.
>
> Para el tema del hosting avanzaremos con cloudflared, avanza con la revisión de Codex. (Revisión recortada: una pasada sobre intent+plan; alcance acotado a idempotencia, webhook+polling, entrega única, secretos y supuestos no probados de pey.)

## Qué cuenta como terminado
Entrega antes del **dom 15-nov-2026, 1:00 PM CDMX** (formulario forms.gle/dfXTnL8ethxoGNk49):
- Un comercio (titular único, perfiles de caja ficticios rotulados) crea un cobro por ticket: QR de monto fijo desde `POST /codi/qr`, estado «esperando confirmación».
- El estado «pagado» solo lo fija el servidor (webhook firmado Standard Webhooks + polling de respaldo a `GET /transaction/...`); ninguna captura cuenta.
- Entrega única: reprocesar el mismo evento (`webhook-id`/`transactionId`) deja el contador de entregas en uno.
- Cobro vencido, tardío y duplicado tienen estado visible; devolución = registro manual.
- Métrica antes/después (clics, cambios de app, tiempo) visible en la demo.
- App en vivo con URL pública HTTPS (cloudflared) sin invitación; repo público sin credenciales (`.env` ignorado, `.env.example` sin valores).
- Un pago real de $0.01 de inicio a fin probado y grabado en video ≤3 min (lo simulado, rotulado).
- Descripción ≤500 palabras, instrucciones ≤1000, declaración de componentes previos y de terceros, integrantes.
- Agente #1 (captura de ticket): solo si lo anterior ya pasa; el agente propone, el servidor decide; sin herramienta de «marcar pagado» ni «entregar».

## Modelo de amenaza
- Repo y demo **públicos**; el atacante realista es quien vea el repo o la URL: secretos filtrados, webhook falsificado, reenvío de eventos, capturas de pantalla como «pago», `concept`/`metadata` como instrucciones a un LLM. P1 = secreto en el repo o en cliente; «pagado» sin evento firmado/consulta al servidor; entrega duplicada; cobertura de pey asumida sin probar que rompe la demo.
- Dinero: solo $0.01 reales de pruebas; los pagos de prueba no se devuelven. Fuera del modelo (P2): carga, abuso a escala, multi-tenant.

## Fuera de alcance
- Plataforma multi-comercio, cuenta concentradora o cobro a favor de terceros (términos pey §5.4).
- Reembolsos automáticos (no hay endpoint), CLABE propia (alta el lunes 16-nov), agentes #2–#4, corte del día y exportación (2.º corte, 12-dic 23:59).
- Revisión completa de Codex del código: se difiere al 2.º corte.
