# Descripción del proyecto (≤ 500 palabras)

**Ya Cayó** es una caja de mostrador que cobra con CoDi mediante la API de pey y solo da por pagado lo que el servidor confirma. Hoy «ya pagué» se prueba con una captura de pantalla, que no es un pago.

**Cómo usa pey**
1. Al crear un ticket, el servidor llama a `POST /codi/qr` con monto fijo, concepto y vigencia de 6 minutos; el monto lo fija el servidor.
2. El pagador escanea el QR; `/pagar/<token>` le muestra quién cobra, el concepto y el monto.
3. El servidor reacciona con el webhook `codi.qr.payment_received` (firma Standard Webhooks verificada) y un polling de respaldo a `GET /transaction/codi/qr/{id}`. El webhook solo dispara una consulta; nunca marca pagado.
4. Cuenta como pago solo una transacción `PAID` con monto correcto y anterior al vencimiento. Un pago posterior queda «tardío» y un segundo pago, «duplicado», sin nueva entrega.
5. La caja habilita **una sola entrega** por orden, en una misma transacción SQLite; reenviar el evento deja el contador en uno.

**Qué hace distinto**
- «Pagado» sale solo del servidor, con sello y alerta de voz.
- Métricas del servidor: tiempo de cobro, latencia de confirmación, entregas por orden, aceptación de CoDi.
- Estima la comisión de tarjeta evitada (supuesto configurable; el vendedor decide).
- Asistente de captura **por reglas, sin IA**: de «dos cafés y un pan» propone concepto y total. El cajero confirma y el servidor fija el cobro; no puede marcar pagado ni entregar.
- Guía «¿Aún no tienes CoDi?» para el pagador.

**Versión 2 (planeada, no implementada)**
Un agente con IA recibirá los productos y piezas a cobrar, calculará el total y generará el cobro de pago para CoDi con la API de pey. Misma regla: el agente propone, el cajero confirma y el servidor decide; sin herramientas para marcar pagado ni entregar, y el texto de los productos se trata como dato, nunca como instrucción.

**Real y simulado**
- El 15-nov-2026 se verificaron pagos reales de $0.01: el servidor los confirmó por polling en 1 a 3 s y el webhook llegó con firma válida. Reenvío, pago tardío, duplicado y consulta fallida solo se probaron con 27 pruebas automáticas y un pey simulado.
- En el video el total de lista ($75) es ilustrativo y el cobro real es de $0.01; la pantalla lo indica. El perfil de caja es de ejemplo. Las mediciones «antes» son 3 cronometrajes manuales.
- Limitación: Bot Fight Mode de Cloudflare (plan gratuito) puede desafiar el webhook; el polling confirma igual.

**Alcance**
Una instancia con un único titular (CLABE de prueba de los organizadores; el titular se muestra en la demo). Cada comercio despliega la suya con cuenta y API key propias; no es multi-comercio ni cobra a nombre de terceros. Sin reembolso por API (devolución = registro manual). La demo tiene PIN, tope de $50 y máximo 3 cobros vivos.

**Tecnología:** Node 24 (`node:http`, `node:sqlite`), HTML y JS sin framework, SDK `standardwebhooks`, túnel de Cloudflare. Hecho con Claude Code y Codex.
