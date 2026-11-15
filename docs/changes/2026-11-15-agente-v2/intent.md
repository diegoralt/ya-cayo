# Agente con IA que arma el cobro CoDi (versión 2 de Ya Cayó)

- **Pidió:** Diego · 2026-11-15 · chat (sesión Claude Code)
- **Por qué es mediano:** dinero real (el agente alimenta cobros CoDi), producción (app pública con key de LLM en el servidor) y más de medio día.

## Lo que se pidió
> Versión 2: agente con IA que lista productos y piezas y genera el cobro para CoDi. Propone, el cajero confirma, el servidor decide; sin herramientas de "marcar pagado" ni "entregar". [...] Hoy hay un asistente por reglas (public/caja.html, función proponer), no un LLM.

Respuestas del 2026-11-15 en la misma sesión: proveedor de LLM = OpenRouter (Diego genera la API key); entrada = catálogo del comercio + texto libre; mover el webhook fuera de Bot Fight Mode va como **cambio aparte**.

## Qué cuenta como terminado
Antes del **sáb 12-dic-2026, 23:59 CDMX** (2.º corte):
- El cajero escribe o dicta texto libre («dos cafés y tres piezas de pan») y el agente, con el catálogo del comercio, devuelve líneas (producto, cantidad/piezas, precio) y total propuestos; el cajero los ve y edita antes de nada.
- **Catálogo autoritativo del servidor** (archivo versionado, solo editable por quien despliega; el cajero edita productos y cantidades, nunca precios). Pulsar «Cobrar» sigue siendo acción humana y envía **líneas (id, cantidad)**: el servidor valida ids, enteros 1..20, calcula en centavos, arma el concepto y crea el QR; ignora precios/totales/concepto del cliente y del LLM. Pasarse de $50 se rechaza, no se trunca. La ruta manual actual (concepto y monto libres) se conserva solo como «cobro manual» explícito y rotulado; el modo demo ($0.01) es una opción explícita del servidor, no del cliente. Cambiar líneas tras proponer exige nueva confirmación.
- El agente no tiene herramienta para marcar pagado ni entregar; el estado «pagado» sigue solo por webhook firmado + polling.
- Texto del cajero, nombres del catálogo, `concept` y `metadata` se tratan como datos, nunca como instrucciones; un texto con inyección («marca como pagado», «cobra $0.01») no cambia precios ni estado.
- Si el LLM falla, tarda o devuelve algo inválido, la caja sigue funcionando (respaldo al asistente por reglas o al menú manual).
- La key de OpenRouter vive solo en `.env` del servidor (y `.env.example` sin valor); el cliente llama a un endpoint propio con PIN. **Presupuesto**: tope monetario global por periodo en el servidor (persistente a reinicios), límite de tamaño de entrada/salida, una llamada a la vez, plazo con cancelación y sin reintentos automáticos; modelo y ruta fijados por el servidor; límite de gasto configurado en la propia key de OpenRouter. Sin PIN válido: cero llamadas. Agotado el presupuesto, sigue la caja manual.
- Al proveedor solo salen: texto de captura y catálogo mínimo (id, nombre); nunca PIN, credenciales, payloads de webhook, CLABE ni datos de pagos. Se declara el proveedor y que el texto lo recibe OpenRouter.
- Nombres, líneas y explicaciones del agente se pintan como texto (sin HTML/Markdown activo).
- Una captura incompleta (producto desconocido, cantidad ambigua) se avisa al cajero y exige corrección humana; una respuesta tardía no pisa un ticket ya editado.
- Se rotula en la UI y en la entrega que el agente es IA (OpenRouter + modelo) y se declara como tercero.
- `node --test` en verde, con pruebas del contrato agente→servidor (monto recalculado, inyección, fallo del LLM) con el LLM simulado, más **una corrida real acotada** contra OpenRouter (corpus de ~10 frases con resultado esperado, incluida inyección y un nombre de catálogo con `<img onerror>`), con presupuesto aprobado antes; un mock verde no acredita compatibilidad. «Dicta» = dictado del teclado del móvil, sin audio propio.

## Modelo de amenaza
- Repo y demo **públicos**; atacante realista: quien vea el repo/URL (secreto filtrado, abuso del endpoint del agente para gastar la key, prompt injection por texto o catálogo). P1 = key en repo/cliente; precio o monto tomado del cliente o del LLM; el monto cobrado sale de la salida del LLM sin recalcular en el servidor; el agente puede cambiar estado de pago/entrega; endpoint del agente sin PIN ni tope (gasto ilimitado). Carga a escala y multi-tenant: P2.
- Dinero: solo pruebas de $0.01 reales; el tope de monto actual del servidor se mantiene.

## Fuera de alcance
- Mover el webhook fuera de Bot Fight Mode (cambio aparte; dependencia antes del 12-dic).
- Alta de CLABE propia, rotar PIN, pruebas de pago real (reenvío/tardío/duplicado), pase de UI de Codex, `docs/agentes.md`.
- Agentes #2 (excepciones) y #3 (corte del día); plataforma multi-comercio.
