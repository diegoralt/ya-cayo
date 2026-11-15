# Instrucciones de prueba (≤ 1000 palabras)


**URL de la demo (pública, sin invitación):** https://pey.drkingsia.com
**PIN de la caja:** [PIN de demo: se indica solo en el texto del formulario, no en el repo] · **Repo:** https://github.com/diegoralt/ya-cayo

## Qué necesitas
Un celular con la app de un banco con CoDi activo, para pagar $0.01 MXN real. Si no tienes CoDi, puedes recorrer toda la interfaz sin pagar (pasos 1 a 3) y ver el video.

## Paso a paso
1. Abre la URL en un celular o tablet y escribe el PIN. Verás la **caja** (perfil de ejemplo).
2. En el asistente escribe «dos cafés y un pan» y pulsa **Proponer cobro** (por reglas, sin IA): propone el concepto y un total de lista ilustrativo; con «Cobro de prueba» marcado se cobra $0.01. Pulsa **Cobrar con CoDi**. Aparece el QR con cuenta regresiva de 6 minutos y el estado «Esperando confirmación». **Entregar** está desactivado.
3. Abre el **enlace del pagador** que aparece bajo el QR (o escanéalo desde otro dispositivo). Verás quién cobra, concepto y monto, y la guía «¿Aún no tienes CoDi?».
4. En tu app de banco elige pagar con CoDi y escanea el QR. Se cobran $0.01.
5. En unos segundos la caja cambia a **«Ya cayó el pago · confirmado por el servidor»**, suena una alerta de voz y **Entregar** se activa. La página del pagador muestra «Pago confirmado».
6. Pulsa **Entregar**: el contador queda en **1 entrega**. Pulsarlo de nuevo no hace nada.
7. En **Métricas** verás tiempo de cobro, latencia de confirmación y entregas por orden (máx. 1).

## Casos que puedes revisar
- **Una captura de pantalla no cuenta:** con el QR sin pagar, la caja sigue en «Esperando» y no deja entregar.
- **QR vencido:** si lo dejas pasar 6 minutos sin pagar, pasa a «QR vencido» sin entrega.
- **«Paga con tarjeta o efectivo»:** solo registra la elección (no cobra) para medir cuántos aceptan CoDi.
- **Límites:** un monto mayor a $50 o un 4.º cobro vivo se rechazan con mensaje.
- **Recomendación al vendedor:** es una estimación con supuesto (3 %) y el sistema no cambia el precio.

## Lo que no hace
No reembolsa (pey no lo permite por API: una devolución es un registro manual). Un pago hecho después del vencimiento queda como «tardío» y un segundo pago del mismo ticket como «duplicado»; ninguno genera otra entrega. Con pago real se verificaron la confirmación por polling y el webhook firmado; el reenvío, el pago tardío, el duplicado y la consulta fallida están cubiertos solo por pruebas automáticas con un pey simulado. Si no tienes CoDi, esta es la forma de revisar ese comportamiento (`node --test`).

## Pruebas automáticas
`npm install` y `node --test` (27 pruebas: entrega única, firma del webhook, polling, límites). Para correr local: copiar `.env.example` a `.env`, completar valores y `npm start`.

## Declaración
- **Componentes previos:** ninguno; la integración con pey se construyó durante el hackatón.
- **De terceros:** Node.js, `standardwebhooks` (SDK oficial), cloudflared (túnel), API de pey. Ilustraciones SVG propias, sin marcas.
- **Integrantes:** Diego (contacto en el formulario). **Cuenta que cobra:** CLABE de prueba de los organizadores (el titular se muestra en la demo).
