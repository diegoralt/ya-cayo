# Descripción del proyecto (≤ 500 palabras) · BORRADOR

> Antes de enviar: quitar este aviso y resolver cada `[PENDIENTE]`. No afirmar nada de lo que H1 no haya verificado.

**Ya Cayó** es una caja de mostrador que cobra con CoDi a través de la API de pey y solo da por pagado lo que el servidor confirma. Hoy «ya pagué» se prueba con una captura de pantalla, que no es un pago, y el cajero cambia de app para revisar el banco.

**Cómo usa pey**
1. Al crear un ticket, el servidor llama a `POST /codi/qr` con monto fijo, concepto y vigencia de 6 minutos. El monto lo fija el servidor, no el cliente.
2. El pagador abre `/pagar/<token>`, ve quién cobra, el concepto y el monto, y escanea el QR con su banco.
3. El servidor reacciona al resultado de dos maneras: el webhook `codi.qr.payment_received` (firma Standard Webhooks verificada con el SDK oficial) y un polling de respaldo a `GET /transaction/codi/qr/{id}` cada 5 s mientras el cobro vive. El webhook solo dispara una consulta; nunca marca pagado por sí mismo.
4. Cuenta como pago solo una transacción `PAID` con monto y moneda correctos y `datePaid` anterior al vencimiento; un pago posterior queda «tardío» y un segundo pago, «duplicado», sin nueva entrega.
5. La caja habilita **una sola entrega** por orden. Estado y registro de entrega van en una misma transacción SQLite; reenviar el evento deja el contador en uno.

**Qué hace distinto**
- Ninguna captura cuenta como pago; «pagado» solo sale del servidor, con alerta de voz.
- Métrica antes/después medida por el servidor: tiempo de cobro, latencia de confirmación, entregas por orden, aceptación de CoDi.
- Recomendación al vendedor: estima la comisión de tarjeta evitada y sugiere un bono por usar CoDi (supuesto configurable y rotulado; el vendedor decide, el precio no cambia).
- Guía «¿Aún no tienes CoDi?» para el pagador, con ilustraciones genéricas.

**Qué es real y qué es simulado**
- Los cobros son de $0.01 MXN. Al cierre de este corte no se ha verificado un pago real de punta a punta: la firma real del webhook y el formato real del QR de pey están sin validar. La lógica se probó con 26 pruebas automáticas y un pey simulado; el pago real queda para el 2.º corte.
- Los perfiles de caja son ficticios y el QR vencido del video está preparado; ambos se rotulan.
- Las mediciones «antes» son 3 cronometrajes manuales.

**Alcance y límites**
En el hackatón es una instancia con un único titular: los cobros caen a la CLABE de prueba que dieron los organizadores (el nombre del titular se muestra en la demo); al dar de alta mi cuenta CoDi propia, caerán a ella. Cada comercio despliega la suya con cuenta y API key propias; no es una plataforma multi-comercio ni cobra a nombre de terceros. Sin reembolso por API: una devolución es un registro manual. La demo tiene PIN, tope de $50 y máximo 3 cobros vivos.

**Tecnología**: Node 24 (`node:http`, `node:sqlite`), HTML y JS sin framework, SDK `standardwebhooks`, túnel de Cloudflare. Desarrollado con Claude Code y Codex.
