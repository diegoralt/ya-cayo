# Hackatón CoDi + pey (Cursor Hackatón México, CDMX) · contexto

> Migrado el 2026-11-14 desde `hackathon-cursor-cdmx/` al proyecto **ya-cayo**. Punto de entrada: `arranque.md`.
> Recopilado el 2026-11-13 de las páginas oficiales y del correo de los organizadores. Lo marcado ⚠️ no está verificado.

## Evento
- Sede CDMX, sábado 2026-11-14, 10:00–17:00. Laptop propia; llegar cerca de las 10 (comida y merch por orden de llegada). WiFi en sede.
- Organiza AI Builders México; programa nacional con pey (operada por Koshi SA de CV). Kickoff en 7 ciudades.
- En el evento dan cuentas de prueba de pey. Créditos de IA (SpaceXAI) solo para quien asista al kickoff; créditos: aibuilders.mx/cursor-hackathon.
- Equipos de 1 a 5, mayores de 18. Un solo registro por persona, con nombre real.
- Fuentes: https://hackatonmexico.com/ · https://hackatonmexico.com/reglas · https://luma.com/bkk88q1q · https://docs.pey.mx

## ⚠️ Fechas contradictorias (preguntar mañana a los organizadores)
- Correo: entrega por formulario a más tardar **domingo 15-nov 1:00 PM CDMX**.
- Reglas del sitio: postulación 10-dic 23:59, entrega **12-dic 23:59**, resultados 14-dic. Bounties publicados a más tardar 30-nov.
- Tratar la del correo como la vigente hasta confirmar.

## Reto
- Tema libre. Obligatorio: usar la API de pey para generar al menos un cobro CoDi (QR, push o link) y **reaccionar al resultado** (webhook o consulta). Real, funcional y demostrable, en producción; la integración debe construirse durante el hackatón.
- Cursor y las herramientas de IA: permitidas sin restricción ni declaración (reglas 9.3). Cursor no es requisito en las reglas ⚠️ confirmar en sede.
- Terceros: declarar y respetar licencias.

## Evaluación (1–10, promedio ponderado)
| Criterio | Peso |
|---|---|
| Uso de CoDi y API de pey | 30% |
| Impacto y relevancia | 25% |
| Ejecución técnica (calidad, solidez, seguridad) | 15% |
| Experiencia y diseño (incluye el momento de pagar) | 15% |
| Originalidad | 15% |
Desempate: puntaje CoDi/pey, luego impacto. Revisión por 2+ jurados; posible demo de hasta 20 min.

## Entrega
- Correo: nombre y descripción, **repo público (obligatorio)**, app en vivo (preferida), video demo (opcional), correos de integrantes.
- Reglas: descripción ≤ 500 palabras con cómo se usa pey; demo pública sin invitación (credenciales de prueba si pide login); video ≤ 3 min con el cobro de inicio a fin; declaración de componentes previos y de terceros; instrucciones de prueba ≤ 1000 palabras; integrantes.
- Nombre del proyecto no puede sugerir que es oficial de pey o Banxico ("Usa CoDi" sí; "CoDi Pagos" o "pey Wallet" no).

## Restricciones
- Prohibido: engañar al pagador sobre quién cobra, cobros masivos no solicitados, cobrar a cuentas que no son del titular, eludir límites o pruebas de estrés, revender la API o sustituir la generación de cobros CoDi, cobrar a favor de terceros / agregar pagos de otros negocios (dispersión directa a terceros sí).
- Giros prohibidos o con autorización de pey (legal@pey.mx): apuestas, cripto, casas de cambio, préstamos, farmacias, entidades financieras, actividades vulnerables.
- Admitidos: puntos de venta, sistemas de gestión, e-commerce, conciliadores.
- Credenciales: nunca en repo público ni en código cliente; no compartir fuera del equipo.
- Dinero real: devoluciones, impuestos y atención son del equipo.
- Premio en efectivo por SPEI a la representante del equipo (CLABE a su nombre), en 30 días naturales. ⚠️ Estas reglas (premios, bounties, conducta) vienen de un resumen del modelo, no del texto literal; el Documento de Premios no se leyó.

## CoDi y pey en una línea
- CoDi: cobro por transferencia instantánea de Banxico (QR o solicitud al teléfono), sin comisión por transacción según la home.
- pey: API pública y gratuita que envuelve CoDi (más links de pago con tarjeta, Apple Pay, Google Pay). Sin sandbox: probar en producción con $0.01 MXN; CLABE de prueba `[CLABE de prueba de los organizadores]` (pagos no reembolsables). Cuenta CoDi propia: 5 días hábiles de registro con Banxico, por eso usar las cuentas de prueba del evento.

## API pey (OpenAPI 3.1.1, versión 2026-10-20) · base `https://api.pey.mx` · `Authorization: Bearer <api-key>`
Error común: `{"error":{"message","type","requestId"}}`. Códigos: 400/404/409/500/503. No documenta 401.

**POST /codi/qr** → 201 `{id (folio IDC), qrString, qrImage|null}`
- `amount` number ≥0 (**requerido**; 0 = el pagador captura monto), `concept` string, `expiration` int segundos (0 = sin expiración; si se define, mín. 360), `numRef` string `^[0-9]{1,7}$` (default "0"), `generateImage` bool (default false; PNG base64, puede ralentizar), `bankAccountId` ULID de cuenta `ACTIVE` (si no, la cuenta de la API key), `metadata` objeto (≤50 pares, clave ≤40, valor escalar ≤500, se devuelve como string).

**POST /codi/pn** → 200 `{transactionId (ULID), codiId (20 dígitos)}`
- `amount` >0 y ≤1,000,000 (**req.**), `phoneNumber` `^[0-9]{10}$` (**req.**), `concept`, `expiration` mín./default 360, `numRef`, `bankAccountId`, `metadata`.

**POST /bank-account** → 200 `{id, codiStatus}`: `alias`, `name`, `clabe` (18 dígitos, verificador válido), `entity` (`BUSINESS|PERSON`), todos requeridos. `codiStatus`: PENDING | PROCESSING | ACTIVE | ERROR (hasta 5 días hábiles). **GET /bank-account/{id}** agrega `taxId`, `errorMessage`, `dateCreated`.

**POST /payment-link/create** → 200 `{id, url}`: `amount` >0, `successUrl` y `backUrl` (HTTPS) requeridos; `hasTip`, `clientReferenceId` ≤255, `metadata`.
**POST /payment-link/update**: solo `amount`, solo si el link está `pending` (409 si no). **GET /payment-link/{id}**: `status` pending|processing|paid|partial, `paymentMethods`, `transactions[]`.

**Transacciones** (campos: `id`, `status` PENDING|PAID, `amount`, `amountBreakdown{base,tip,fee}`, `currency`, `paymentMethod` CARD|CODI, `payableType` PAYMENT_LINK|API_CODI_QR|API_CODI_PN, `payableId`, `description`, `applicationFee`, `dateCreated`, `datePaid` solo si pagada, `metadata`):
- GET `/transaction/{id}` · GET `/transaction/api-key` (80/pág., `nextToken`) · GET `/transaction/bank-account/{id}` (80/pág., solo pagadas; `metadata.externalMetadata`) · GET `/transaction/codi/qr/{id}` (20/pág., sin `payableType`/`payableId`).

**Webhooks**: el spec los deja vacíos (`"webhooks": {}`). Por la doc: un webhook por API key (portal → Desarrollador), firma Standard Webhooks (`webhook-signature: v1,…`), secreto rotable. Evento de ejemplo en la home: `codi.qr.payment_received` con `amount, apiKeyId, codiQrId, concept, datePaid, numRef, transactionId`. Hay también pago de push recibido y estatus de link. ⚠️ No leído: webhook "Bank Account Updated" ni `/docs/types/*`. Recomendación: webhook **y** polling a `GET /transaction/...` como respaldo.

Portal: portal.mipey.mx (perfil → Finanzas: cuenta `stripe` o `codi` → Desarrollador: API key). Registro: pey.build/signup.

## Implicaciones de diseño
- El cobro debe ser el centro de la experiencia (30% + parte del 15% de diseño); un cobro de adorno pierde el criterio más pesado.
- `numRef` (7 dígitos) y `metadata` amarran cada cobro a la orden/cliente sin estado extra.
- Un QR no puede expirar en menos de 6 min.
- Giros admitidos: POS, gestión, e-commerce, conciliación.

## Pendiente
1. Proponer 2–3 candidatos de solución, contrastados con los criterios y las restricciones (Mostrador, el POS para gimnasios multi-tenant en `[ruta local]`, encaja con los giros admitidos; decide Diego si lo usa).
2. Elegir solución y nombre (sin sugerir oficialidad de pey/Banxico).
3. Crear el proyecto y migrar este contexto a su `docs/`.
4. Mañana en sede: confirmar fecha de entrega, si Cursor es requisito, recibir cuentas de prueba, leer el Documento de Premios.

## Actualización 2026-11-14 (hojas impresas en la sede)
- **Entrega confirmada: domingo 15-nov 1:00 PM CDMX** (formulario forms.gle/dfXTnL8ethxoGNk49 o QR de la hoja). Un proyecto por equipo.
- **Dos cortes** (según Diego): 1.º domingo 15-nov 1 PM; 2.º **sábado 12-dic 23:59** (confirmado por Diego el 14-nov, coincide con las reglas del sitio), con la misma solución mejorada y optimizada. Resultados el 14-dic.
- **Activación pey:** el alta CoDi propia tarda ~5 días con Banxico. Para probar hoy: CLABEs preautorizadas de los organizadores (en la hoja física; una de ellas ya está documentada). Darlas de alta en portal.pey.mx, transacciones de $0.01, los pagos de prueba no se devuelven. Para publicar, registrar CLABEs propias. Créditos: QR "disponibles pronto".
- **Pistas de la hoja de ideas:** "una pantalla, un cobro y una acción verificable"; confirmar el pago **desde el servidor**; **evitar ejecutar dos veces la misma orden** (idempotencia); si se simula equipo, indicarlo en la demo; probar las notificaciones en el banco elegido; "un pago no prueba identidad ni entrega"; definir qué pasa con **pagos tardíos, fallas y devoluciones**.
- **20 ideas oficiales** (no obligatorias): 1 QR→solicitud de pago · 2 pedidos por WhatsApp · 3 cotización que arranca el trabajo · 4 anticipo que confirma una cita · 5 cobro al entregar · 6 imprime al pagar (impresora) · 7 cabina de retratos · 8 tiempo de uso (equipo) · 9 casillero (cerradura) · 10 acceso por sesión · 11 historia que paga el público · 12 mural colectivo · 13 música que responde al dinero · 14 robot por turno (robot) · 15 fábrica de encargos con IA · 16 cuenta entre varias personas · 17 regalo colectivo · 18 taller con lugares pagados · 19 facturas que se concilian solas · 20 comidas patrocinadas.
- No se guardan aquí las contraseñas de WiFi de la hoja.

## Análisis de soluciones (2026-11-14) · ver `analisis-soluciones/`
- `brief.md` (encargo a Codex, a ciegas) · `analisis-claude.md` · `codex-hallazgos.md` (8 candidatos, precedentes, refutación de WhatsApp, plan de 24 h).
- **Convergencia:** el núcleo de pagos común (pendiente/vencido/pagado/pago tardío/duplicado/devolución; el servidor manda; idempotencia por `transactionId`; polling de respaldo) y "cupo pagado" (ideas 18+4+10) como la mejor base. Codex lo puntúa 8.70 (factibilidad 9); yo lo dejé 2.º.
- **Divergencia:** yo puse "Mesa compartida" 1.º; Codex la deja última (factibilidad 5: concurrencia, parciales y varios pagadores en vivo). Se acepta su crítica.
- **Alternativas finalistas:** Rescate de Lote (8.55, requiere un comercio real y su lote), EntregaLista (8.45, cotización + anticipo + saldo + descarga).
- **Hallazgos que cambian el plan:** no hay endpoint de reembolso documentado (devolución = registro manual); no usar `amount: 0` en precio cerrado; el contrato del webhook no está verificado (polling por defecto, webhook si se valida a tiempo); un webhook tardío no prueba pago tardío; no esperar 360 s en el video (preparar el caso vencido y rotularlo); primeras 2 h = confirmar CLABE/API key/app bancaria, bloqueo común a todos los candidatos.
- Fuentes de Codex (Interledger, Kotak, Stripe/Briefcase, PayPal, políticas de WhatsApp) sin verificar por mí.

## Ronda 2 (2026-11-14) · ver `analisis-soluciones/ronda2/sintesis.md`
Tres puntuadores a ciegas (Claude, Codex, Opus) sobre 38+ ideas con rúbrica con anclas. **Convergencia:** Mesa compartida (C2) es la única en el top 4 de los tres; Visita firme (N3) y "servicio con autorizaciones pagadas" (P3/X2, propuesta por Opus y por Codex de forma independiente) siguen. Fiado digital (N7) depende de aclarar "préstamos" con legal@pey.mx. Correcciones de API: amount 0 solo en QR; sin cancelación de cobros (un cobro vivo por orden); demo debe declarar el titular real; link de pago como respaldo si el jurado no tiene CoDi.

## Términos API de pey verificados (2026-11-14; pey.mx/legal/terminos-api, «Última actualización: 13-oct-2026»)
Leídos por un subagente de lectura; las citas largas vienen parafraseadas (límite de cita), cláusulas y frases clave textuales. Releer la página antes de apoyar una afirmación legal en el pitch.
- **Confirmado lo de Codex:** §5.4 plataforma que registra cuentas de comercios propios = «autorización por escrito, mediante Contrato Particular»; cada comercio validado, recibe «exclusivamente en Cuentas Destino de su titularidad»; cuenta concentradora «estrictamente prohibida». §3.3 y §5.2(d): prohibido cobrar a favor de terceros o actuar como intermediario/agregador/dispersor sin esa autorización. Anexo C.2 lo repite.
- **§3.8 (el camino de la solución replicable):** el negocio titular puede dejar que un proveedor tecnológico opere su integración si sigue siendo el único titular de la cuenta, las credenciales y las Cuentas Destino, obliga al tercero, e **informa a Koshi la identidad del tercero**. Sin contrato.
- **§4.1–4.3:** licencia solo para integrar cobros en «sus propios productos»; prohibido revender o «ofrecer a terceros acceso al API como servicio propio»; permitido desarrollar y comercializar POS, sistemas de gestión, e-commerce y conciliación que integren el API.
- **Corrección a este contexto:** §3.5 dice que **sí hay sandbox** («no genera Mensajes de Cobro reales»; basta nombre y correo verificado, §3.2). Las páginas de docs decían lo contrario. Confirmar en el portal.
- **Ambigüedad:** la 2.ª frase de §3.5 dice que los proveedores que integran para terceros «podrán utilizar sus Credenciales productivas propias para registrar a sus clientes» si el titular autorizó su Cuenta Destino; choca con §3.3/§5.4. No apoyarse en ella; preguntar a legal@pey.mx.
- **Costos:** §6.1 gratis hoy; tarifas futuras por uso de software, «en ningún caso como porcentaje, comisión o participación» sobre los montos; aviso de 30 días. La comisión del banco del comercio por recibir transferencias es aparte (§6.4). Límite por operación: el que fije Banxico y cada banco (§2.5); sin cifra diaria.
- **Devoluciones (§2.7):** Koshi no cancela ni revierte; las hace el integrador desde su cuenta. Coincide con «devolución = registro manual».
- **No aparece:** reutilización de QR (probarlo), garantías de webhooks (§8.1 y §11.1: sin nivel de servicio garantizado).

## Ronda 3 (2026-11-14) · foco adopción · ver `analisis-soluciones/foco-adopcion.md` y `ronda3/sintesis.md`
Decisiones del usuario: varios comercios, el comercio primero, adopción como filtro. Webhooks leídos (`ronda3/webhooks.md`). Los tres puntuadores coinciden en la **caja de mostrador con confirmación del servidor** como mejor candidato. Codex señala que los términos de pey exigen autorización escrita para plataformas que registran comercios: diseño defendible = replicable por comercio (key propia), una instancia con titular único en el hackatón. Pendiente: que el usuario confirme ese ajuste a «varios comercios» y el nombre; luego crear el proyecto.
