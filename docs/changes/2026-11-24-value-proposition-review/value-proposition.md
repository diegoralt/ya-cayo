# Propuesta de valor · borrador 1 (para refutar)

> Hipótesis **no validada con comercios** (sin acceso a ellos). Cada cifra sale de [`sources.md`](sources.md) y está confirmada en el documento oficial; ninguna cifra no verificada entra aquí. Pendiente: refutación a ciegas de Codex (`decision-review`).

## En una línea
**Ya Cayó convierte la transferencia que el comercio ya acepta en un cobro confirmado por el servidor, sin quitarle el efectivo ni la tarjeta.**

## Para quién
El comercio de mostrador (micro o pequeño) que ya cobra en efectivo y recibe transferencias, y que hoy confirma el pago mirando una captura o su app del banco.

## Por qué ahora (evidencia oficial)
- **La transferencia ya es la vía digital del comercio.** Las ventas cobradas por transferencia pasaron de 8.8% a 16.7% de las unidades económicas entre 2018 y 2023, por encima de la tarjeta (15.1%) (INEGI, Censos Económicos 2024). El 78.4% de las empresas acepta transferencias, contra 54.3% que acepta tarjeta (ENAFIN 2024).
- **El efectivo no se va.** 98% de la población urbana objetivo lo usa en gastos diarios (Banxico, 2025) y el 83.8% de los negocios cobra con él. Una caja que solo acepte CoDi no se adoptaría.
- **La tarjeta tiene un freno de costo.** De las empresas que no aceptan tarjeta, 16.3% dice que «es costoso» (ENAFIN 2024).
- **CoDi se conoce, pero casi no se usa.** 38.0% lo conoce y solo el 12.8% de ellos lo usó (ENIF 2024). El empuje tiene que venir del mostrador, sin pedirle al pagador que cambie de hábito más allá de escanear con su banco.
- **El cambio también cuesta ventas.** 12% de la población objetivo dejó de hacer una compra en efectivo por falta de cambio (Banxico, 2025).

## Qué ofrece
1. **Certeza:** «pagado» solo por webhook firmado o consulta a pey; una captura nunca cuenta. Una sola entrega por cobro.
2. **Sin cambiar la caja:** CoDi aparece junto a «tarjeta o efectivo», que se registra sin cobrar. Así el comercio ve qué parte de sus tickets acepta CoDi (métrica de adopción propia, ya implementada).
3. **Sin costo por transacción de la API:** pey es gratuita hoy y sus términos excluyen tarifas como porcentaje del monto (§6.1). La comisión del banco del comercio por recibir transferencias es aparte (§6.4).
4. **Monto exacto, sin cambio:** el QR es de monto fijo.

## Qué no afirmamos
- Ninguna cifra de fraude con comprobantes falsos: no hay fuente oficial reciente.
- Que la Circular 9/2026 regule el cobro: estandariza el envío desde la app del banco.
- Ahorros, tiempos o tasas de adopción del comercio: no hay datos de comercios; la demo los mide solo para sí misma.
- «Plataforma multi-comercio»: es replicable por comercio, cada uno con su cuenta y API key (§3.8, §5.4).

## Preguntas para la refutación
1. ¿El «para quién» se sostiene con Censos y ENAFIN, o mezcla universos distintos?
2. ¿Es honesto presentar la transferencia como puerta de entrada a CoDi, cuando CoDi es otra experiencia para el pagador (QR en su banco)?
3. ¿Qué parte de la rúbrica (CoDi/pey 30, impacto 25) no está cubierta por esta propuesta?
4. ¿Qué ajuste o integración de pey (`/codi/pn`, link de tarjeta) cambiaría la propuesta?
