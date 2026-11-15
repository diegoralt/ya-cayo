# Síntesis · fase 1 (hosting-vercel)

## Índice
- `intent.md` (manda; revisado tras la fase 1) · `revision-codex.md` (antecedente, hash 53fe2c9…). No se escribió `revision-claude.md` (informe de implementador) en este cambio: omisión mía respecto al skill; Codex hizo la revisión a ciegas.

## Hallazgos de Codex (6 P1, 3 P2) → destino
| Hallazgo | Respuesta en el intent |
|---|---|
| PIN en memoria + cabecera falsificable (comprobado: 12×401, sin 429) | contador compartido atómico + IP de Vercel |
| Conciliar solo vivas pierde pagos tardíos y caja cerrada | misma ventana de 30 min, reserva atómica, registro pendiente, límite declarado |
| Idempotencia sin `BEGIN IMMEDIATE` en Postgres | restricciones únicas, bloqueo por orden, recibido≠procesado |
| Migración de datos | respaldo, import repetible, cotejo, único escritor, rollback |
| RLS vs «ocultar anon key» | denegación verificable con roles públicos |
| QR creado en pey y función muerta | intento durable e idempotente |
| P2: máx. 3 vivos concurrente; prueba de entorno; evidencia DNS | criterios añadidos |

## Desacuerdos con Diego
- Ninguno. Aviso: el alcance es mayor que «mover a Vercel»: es portar `core.js` a Postgres asíncrono y endurecerlo. Puede pesar sobre el 12-dic.
