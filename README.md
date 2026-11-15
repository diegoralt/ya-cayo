# Ya Cayó

Caja de mostrador que cobra con CoDi mediante la API de pey y solo da por pagado lo que el servidor confirma (webhook firmado + polling de respaldo). Una entrega por cobro; ninguna captura de pantalla cuenta como pago.

- **Demo en vivo:** https://pey.drkingsia.com (el PIN va en el formulario de entrega).
- **Descripción e instrucciones de prueba:** `docs/entrega/`.
- **Ejecutar:** copia `.env.example` a `.env`, completa los valores y corre `npm install && npm start`. Pruebas: `node --test`.

## Versión 1 (este repositorio)
Cobro con QR de monto fijo, confirmación por el servidor, entrega única, métricas medidas por el servidor y un asistente de captura **por reglas, sin IA** que propone concepto y total a partir de un texto como «dos cafés y un pan».

## Versión 2 (planeada, no implementada)
Un agente con IA recibirá la lista de productos y piezas a cobrar, calculará el total y generará el cobro de pago para CoDi con la API de pey. Regla de diseño: el agente propone, el cajero confirma y el servidor decide; el agente no tiene herramientas para marcar pagado ni entregar, y el texto de los productos se trata como dato, nunca como instrucción.

## Alcance
Una instancia por comercio, con su propia cuenta y API key de pey. No es una plataforma multi-comercio ni cobra a nombre de terceros. Sin reembolso por API (la devolución es un registro manual). No es un producto oficial de pey ni de Banxico.
