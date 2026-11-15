# Estado — ya-cayo

> Se sobrescribe cada sesión. Última actualización: 2026-11-14.

## Siguiente acción
Seguir `docs/changes/2026-11-14-ya-cayo-primer-corte/plan.md` desde la primera casilla vacía: **H0** (curl a `/health` por el túnel de Diego), **H1** (bloqueado: no hay quien pague el QR de prueba; desbloquear con otra persona que pague $0.01) y **H4** (UI de caja + métrica, sin tocar H1). H2 cerrado; H3 con tests locales en verde pero abierto hasta validar la firma real. Entrega: dom 15-nov 1:00 PM CDMX; congelar alcance 10:30.

## Decisiones abiertas
- H1 bloqueado por pagador sin CoDi: ¿quién paga el QR de prueba?; «polling solo» requiere aprobación escrita de Diego.
- Host fijo (Railway/Fly/VPS) para H7 tras el envío; no urgente.
- Agente #1 (H5): decide dom 9:00. `docs/agentes.md`/`contrato-agentes: v1`, `integración: push`: sin confirmar.
