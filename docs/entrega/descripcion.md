# Descripción del proyecto (≤ 500 palabras)

**Ya Cayó** acaba con el «ya te pagué» de las capturas de pantalla. Es una caja de mostrador que cobra con CoDi usando la API de pey y solo da por pagado lo que el servidor confirma.

**Cómo funciona**
1. El cajero crea el cobro y el servidor genera el QR en pey (`POST /codi/qr`), con monto fijo y 6 minutos de vigencia.
2. El cliente paga con su banco. El servidor confirma con el webhook firmado `codi.qr.payment_received` y un polling de respaldo a pey.
3. Aparece el sello «Ya cayó» con alerta de voz y se habilita **una sola entrega**. Reenviar el evento no la duplica, y un pago tardío o repetido queda marcado sin nueva entrega.

**Por qué es distinto**
- **Certeza:** el estado lo decide el servidor, nunca el cliente ni una captura.
- **Medible:** tiempo de cobro, latencia de confirmación y entregas por orden salen del servidor.
- **Asistente de captura:** de «dos cafés y un pan» propone concepto y total. Funciona por reglas, sin IA; no puede marcar pagado ni entregar.
- **Listo para crecer (versión 2):** un agente con IA listará los productos y piezas, y generará el cobro para CoDi con la API de pey. Seguirá la misma regla: el agente propone, el cajero confirma y el servidor decide.

**Qué está verificado**
El 15-nov-2026 se cobraron y confirmaron pagos reales de $0.01 por polling (1 a 3 s) y por webhook con firma válida. Reenvío, pago tardío y duplicado se probaron con 27 pruebas automáticas y un pey simulado. En el video el total de lista es ilustrativo y el cobro real es de $0.01.

**Alcance:** una instancia con un único titular (CLABE de prueba de los organizadores; el titular se muestra en la demo); cada comercio despliega la suya con su propia cuenta y API key. Sin reembolso por API.

**Acceso a la demo:** URL y PIN de la caja en el README y en las instrucciones de prueba.

**Tecnología:** Node 24, SQLite, HTML y JS sin framework, `standardwebhooks`, túnel de Cloudflare. Hecho con Claude Code y Codex.
