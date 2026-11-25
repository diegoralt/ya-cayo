# Propuesta de valor · borrador 2

> Hipótesis **no validada con comercios** (sin acceso a ellos). Cada cifra sale de [`sources.md`](sources.md), confirmada en el documento oficial y con su universo al lado. El borrador 1 pasó por la refutación a ciegas de Codex (`docs/changes/2026-11-24-revision-value-proposition/review-codex.md`, P0/P1/P2: 0/1/4); este borrador atiende los cinco hallazgos (tabla al final).

## En una línea
**Ya Cayó añade al mostrador cobros CoDi de monto fijo que el servidor confirma, con una sola entrega por ticket; el comercio conserva efectivo, tarjeta y transferencia como hoy.**

Alcance: la confirmación automática cubre **solo los pagos iniciados con un QR de Ya Cayó**. Una transferencia SPEI convencional, el efectivo y la tarjeta siguen con su propio cobro y comprobación, fuera de Ya Cayó.

## Para quién (hipótesis)
El comercio de mostrador que ya cobra en efectivo y recibe transferencias, y cuyos clientes tienen CoDi activo en la app de su banco. No hay fuente que identifique a los comercios que hoy confirman pagos con capturas: es la hipótesis principal sin validar.

## Por qué ahora (evidencia oficial, con su universo)
- **La transferencia ya está en el mostrador.** Entre 2018 y 2023, las unidades económicas que usan transferencia para cobrar sus ventas pasaron de 8.8% a 16.7%; tarjeta, de 9.8% a 15.1% (INEGI, Censos Económicos 2024, resultados oportunos; cuenta unidades, no importe ni número de pagos).
- **El efectivo no se va.** 98% de las personas de 18 a 79 años en localidades de 50 mil habitantes o más lo usa en gastos diarios (Banxico, 2025), y el 83.8% de las unidades económicas lo usa para cobrar. Hipótesis: una caja que solo acepte CoDi no se adoptaría.
- **La tarjeta tiene un freno de costo en parte de las empresas.** De las empresas con 6 o más personas ocupadas que no aceptan tarjeta, 16.3% dice que «es costoso» (ENAFIN 2024; no representa a micronegocios).
- **CoDi se conoce, pero casi no se usa.** 38.0% lo conoce y solo el 12.8% de ellos lo usó (ENIF 2024).

## Evidencia que limita la propuesta
- **El pagador prefiere tarjeta a transferencia en tickets chicos:** en compras de $500 o menos, 10.4% usa tarjeta como medio frecuente y 4.4% transferencia o app (ENIF 2024, cuadro 5). Que el comercio acepte transferencias no implica que el pagador las prefiera.
- **CoDi está concentrado:** el 78.3% de sus pagos de 2024 fue a comercios y gobiernos que son solo el 0.3% de las cuentas beneficiarias (Banxico, informe de infraestructuras 2024). No hay evidencia de difusión entre pequeños comercios.
- **Pagar con CoDi pide más que escanear:** el pagador debe tener CoDi activo en su banco, y en el mismo celular no puede escanear su propia pantalla (la página del pagador ya lo advierte y explica la activación).

## Qué ofrece
1. **Certeza para el cobro CoDi:** «pagado» solo por webhook firmado o consulta a pey; una captura nunca cuenta. Una sola entrega por cobro.
2. **Convivencia con los otros medios:** el botón «tarjeta o efectivo» registra la elección sin cobrar. Hoy el indicador compara **QR generados contra registros de otros medios**; no mide aceptación ni adopción (cuenta QR no pagados y no vincula un registro con su ticket).
3. **Sin costo por transacción de la API:** pey es gratuita hoy y sus términos excluyen tarifas como porcentaje del monto (§6.1). La comisión del banco del comercio por recibir transferencias es aparte (§6.4). No hay garantía de gratuidad futura.
4. **Monto exacto:** el QR es de monto fijo.

## Opciones para el 2.º corte (por decidir)

| Opción | Qué caso resuelve | Prueba pendiente | Se incorpora si |
|---|---|---|---|
| Push CoDi (`/codi/pn`) | Pagador que no puede escanear porque usa el mismo celular | Un cobro real por push con el teléfono del pagador; confirmar el evento del webhook | El push llega y se confirma igual que el QR, sin cobros concurrentes para el mismo ticket |
| Link de pago con tarjeta (`/payment-link/create`) | Pagador sin CoDi; respaldo ya decidido en `docs/arranque.md` | Un link real; contrato de su webhook o polling por `GET /payment-link/{id}` | Mantiene la confirmación del servidor y un solo cobro vivo por ticket |
| Indicador de adopción por ticket | Medir de verdad cuántos aceptan CoDi | Definir ticket único, ofrecimiento, elección, pago confirmado, abandono y cambio de método | Se puede medir sin datos de terceros y sin inflar la demo |

## Condiciones que cambiarían la propuesta
- El pagador no puede completar el pago con un solo celular → priorizar push.
- Pagadores sin CoDi habilitable → priorizar el respaldo con tarjeta y segmentar.
- Sin mejora frente a mirar la app del banco → revisar el beneficio de certeza y operación.

## Qué no afirmamos
- Que Ya Cayó confirme transferencias SPEI convencionales, efectivo o tarjeta.
- Ninguna cifra de fraude con comprobantes falsos: no hay fuente oficial reciente.
- Que la Circular 9/2026 regule el cobro o mejore las apps antes del 12-dic: estandariza el envío desde la app del banco, con plazo al 14-dic.
- Ahorros, tiempos o tasas de adopción de comercios: no hay datos.
- «Plataforma multi-comercio»: es replicable por comercio, cada uno con su cuenta y API key (§3.8, §5.4).

## Cobertura de la rúbrica (sin puntuar)
- **CoDi/pey (30):** núcleo concreto (QR, webhook, polling). Push y link de tarjeta, por decidir.
- **Impacto (25):** contexto estadístico, sin efecto demostrado.
- **Ejecución (15):** diseño descrito y pagos reales declarados en el README.
- **Experiencia (15):** quedan las barreras del pagador (CoDi activo, mismo celular).
- **Originalidad (15):** sin comparación que la sustente.

La puntuación a ciegas (capa 1) sigue pendiente; esta revisión no la sustituye.

## Atención a la revisión de Codex

| Hallazgo | Decisión | Cambio |
|---|---|---|
| P1: la promesa sugiere confirmar transferencias habituales; el pagador necesita CoDi activo | Acepto | Nueva línea y alcance; «Para quién» exige CoDi activo; barreras del pagador en «Evidencia que limita» |
| P2: universos y causalidad | Acepto | Universo junto a cada cifra; Censos rotulado como resultados oportunos y unidades; ENAFIN sin micronegocios; predicciones como hipótesis |
| P2: la métrica cuenta QR creados | Acepto (verificado en `src/core.js:185` y `:197`) | Indicador renombrado; medición por ticket queda como opción |
| P2: alternativas y rúbrica | Acepto | Tabla de opciones con prueba y condición; cobertura de la rúbrica sin puntuar |
| P2: condición de refutación y evidencia limitante | Acepto (cuadro 5 y 0.3% verificados en el original) | Secciones «Evidencia que limita» y «Condiciones que cambiarían la propuesta» |
