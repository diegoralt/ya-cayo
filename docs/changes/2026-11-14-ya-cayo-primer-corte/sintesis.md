# Síntesis fase 1 · intent.md

Manda `intent.md`. Antecedentes: `revision-claude.md`, `revision-codex.md` (hash 3abe849…). Revisión recortada, una pasada.

## Coincidencias
- Contrato del webhook sin probar → compuerta previa con $0.01 antes de construir el estado «pagado».
- URL única del webhook con cloudflared: una URL que cambie rompe la demo → túnel con nombre o URL estable, polling como respaldo.
- QR pagado dos veces: la entrega única no puede depender de lo que pey permita.

## Solo Codex (aceptado)
- P1 entrega única: transición atómica por orden compartida por webhook, polling y acción de entregar; dedup persistente por evento y transacción; segunda transacción del mismo ticket = excepción sin entrega.
- P1 el polling no puede usar el id del QR en `/transaction/{id}`: descubrir pagos por `GET /transaction/codi/qr/{id}`; validar pertenencia al ticket, monto y moneda antes de marcar pagado.
- P2 secretos: revisión de contenido/historial/cliente/video antes de publicar, no solo `.env` ignorado. P2 «app en vivo»: dueño de la ventana del túnel y hora de congelación antes del dom 13:00.

## Desacuerdos con la decisión de Diego
Ninguno material. «Polling solo» no cumple el intent: si el webhook no valida el sábado, hay que aprobar el recorte por escrito.

## Mapa hueco → paso del plan → verificación
| Hueco | Paso del plan | Verificación |
|---|---|---|
| Contrato webhook real | H1 compuerta de pey | pago $0.01 recibido en la URL; cabeceras/cuerpo crudo guardados saneados |
| QR pagado dos veces | H1 | resultado observado o NO VERIFICADO + prueba sintética |
| Entrega única | H2 núcleo | test: reenvío, concurrencia webhook/polling, reinicio, 2 transacciones |
| Polling por QR | H3 | webhook ausente → polling confirma |
| Secretos | H6 publicación | barrido repo+historial+cliente+video |
| App en vivo | H6 | acceso desde otra conexión, congelar alcance antes del dom 13:00 |
