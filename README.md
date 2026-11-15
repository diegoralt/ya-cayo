# Ya Cayó

Caja de mostrador que cobra con CoDi mediante la API de pey y solo da por pagado lo que el servidor confirma (webhook firmado + polling de respaldo). Una entrega por cobro; ninguna captura de pantalla cuenta como pago.

- **Demo en vivo:** https://pey.drkingsia.com · **PIN de la caja: `147369`** (PIN de demo, solo para evaluar; se rota al terminar la evaluación).
- **Descripción e instrucciones de prueba:** `docs/entrega/`.
- **Ejecutar:** copia `.env.example` a `.env`, completa los valores y corre `npm install && npm start`. Pruebas: `node --test`.

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

**Qué no se probó con pago real:** reenvío del evento, pago tardío, duplicado y consulta fallida; están cubiertos por `node --test` con un pey simulado. La confirmación se hace por webhook firmado y por polling de respaldo; Bot Fight Mode de Cloudflare puede desafiar el webhook, y el polling confirma igual.

**Si algo falla:** recarga la caja; si el PIN se rechaza con «Demasiados intentos», espera un minuto. Para correrlo en local: `.env.example` → `.env`, `npm install && npm start`.

## Versión 1 (este repositorio)
Cobro con QR de monto fijo, confirmación por el servidor, entrega única, métricas medidas por el servidor y un asistente de captura **por reglas, sin IA** que propone concepto y total a partir de un texto como «dos cafés y un pan».

## Versión 2 (planeada, no implementada)
Un agente con IA recibirá la lista de productos y piezas a cobrar, calculará el total y generará el cobro de pago para CoDi con la API de pey. Regla de diseño: el agente propone, el cajero confirma y el servidor decide; el agente no tiene herramientas para marcar pagado ni entregar, y el texto de los productos se trata como dato, nunca como instrucción.

## Alcance
Una instancia por comercio, con su propia cuenta y API key de pey. No es una plataforma multi-comercio ni cobra a nombre de terceros. Sin reembolso por API (la devolución es un registro manual). No es un producto oficial de pey ni de Banxico.
