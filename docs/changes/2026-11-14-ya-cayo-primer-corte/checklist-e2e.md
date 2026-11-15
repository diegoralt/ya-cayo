# Checklist e2e · cobro real de $0.01 en la URL pública

Requiere H0 (app tras el túnel) y H1 (alguien con CoDi que pague). Marcar cada fila con fecha/hora y resultado real; lo no observado se queda como NO VERIFICADO.

## Preparación
- [ ] `curl -fsS https://pey.drkingsia.com/health` → `{"ok":true,"app":"ya-cayo"}` (no «sonda viva»).
- [ ] `.env` con `PEY_API_KEY`, `PEY_WEBHOOK_SECRET`, `DEMO_PIN`, `TITULAR`; un solo webhook en el portal apuntando a `/webhook`.
- [ ] Caja abierta en celular/tablet; PIN incorrecto → rechazado; PIN correcto → entra.

## Por estado
| Estado | Cómo provocarlo | Resultado esperado |
|---|---|---|
| Esperando | Crear cobro de $0.01 | QR visible (confirmar que `qrImage` se ve), cuenta regresiva ≥ 06:00, «Entregar» desactivado; `/pagar/<token>` muestra titular, concepto, monto y QR |
| Pagado | Otra persona paga el QR con CoDi | ≤ 15 s: caja y pagador pasan a «Ya cayó»; voz dice el monto; «Entregar» activo |
| Entregado | Pulsar «Entregar» | «1 entrega registrada»; segundo clic no hace nada |
| Reenvío | Reenviar el mismo webhook desde el portal | Entregas siguen en 1 |
| Sin webhook | Apagar el túnel, pagar, encenderlo | El polling lo descubre en ≤ 15 s |
| Vencido | Dejar vencer un QR (preparado y rotulado en el video) | «QR vencido», QR apagado, sin entrega |
| Tardío | Pagar un QR ya vencido, si pey lo permite | «Pago tardío», sin entrega (NO VERIFICADO si pey rechaza el pago) |
| Duplicado | Pagar dos veces el mismo QR, si pey lo permite | «Posible duplicado», entregas = 1 (NO VERIFICADO si pey lo impide) |
| Consulta fallida | Quitar `PEY_API_KEY` válida o cortar red | Aviso «reintentando», nada habilitado |
| Tope y vivos | Monto > $50; 4.º cobro vivo | Rechazados con mensaje |
| Tarjeta o efectivo | Pulsar la opción | No crea cobro; «Aceptación de CoDi» cambia |

## Métricas (después de un cobro)
- [ ] Tiempo de cobro y latencia de confirmación con valor numérico; entregas máx. por orden = 1.
- [ ] Comisión evitada rotulada como estimada (supuesto 3 %).
- [ ] «Antes»: 3 cronometrajes manuales anotados por Diego (captura + app del banco).

## Contrato real de pey (anotar en `evidencia-pey.md`)
- [ ] Forma del webhook (¿`data` o raíz?), firma válida con el SDK, `datePaid`, formato de `qrImage`.
