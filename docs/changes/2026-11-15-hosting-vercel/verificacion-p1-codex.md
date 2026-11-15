# Verificación de cierre de P1 · fase 2

Revisor: Codex · GPT-6 (variante exacta no expuesta en esta sesión) · esfuerzo high  
Fecha: 2026-11-15  
Hash revisado: ea8a49394c267017cf559b3b697b1dc7f89f259c  
esfuerzo: high · P0/P1/P2: 0/0/0

## Veredicto

**Los tres P1 quedan cerrados en el plan. No identifico un P0/P1 nuevo introducido por las correcciones.** El hash calculado con `git hash-object plan-candidato.md` coincide con la entrada. Este cierre evalúa el procedimiento previsto; no acredita su implementación ni autoriza producción.

| P1 anterior | Corrección comprobada | Estado |
|---|---|---|
| Rollback y corte (`revision-plan-codex.md:32`) | H8a exige restaurar el respaldo, repetir la importación, cotejar relaciones/secuencias/métricas, impedir reentrega y ensayar rollback conservando pago, evento y entrega añadidos en PG. Elige mantener PG como base durante la reversión; el túnel solo revierte transporte (`plan-candidato.md:31`). H8b exige aprobación justo antes, congelación de escrituras del origen —webhook/polling/entregas—, copia final, verificación, conciliación del intervalo y único escritor (`plan-candidato.md:32`). | **Cerrado.** Elimina la vuelta al SQLite desactualizado y añade ensayo verificable antes del corte. |
| Corte mínimo que omite H7–H8 (`revision-plan-codex.md:34`) | H9 exige H7 aprobado con evidencia, H8b verificado, revisión del SHA sin P0/P1, suite/barrido verdes y aprobación por operación (`plan-candidato.md:33`). El apartado de riesgos prohíbe recortar H7, H8 o la entrada de H9 (`plan-candidato.md:43`). | **Cerrado.** La ruta abreviada objetada desaparece. |
| QR incierto sin mecanismo ni compuerta (`revision-plan-codex.md:36`) | H4 incorpora un paso inicial de comprobación de capacidades; el experimento real necesita aprobación previa de Diego. Define UUID desde el cliente, persistencia única y bloqueo por intento, conservación del webhook anticipado y conciliación al enlazar el QR. Si no hay idempotencia/búsqueda, prohíbe recrear el intento incierto y exige resolverlo manualmente en el portal o volver a revisar el alcance (`plan-candidato.md:15`). H4 mantiene su validación mediante `test/qr.test.js` (`plan-candidato.md:27`); tests/Preview excluyen la key real y H7 prohíbe cambiar el webhook real (`plan-candidato.md:20–21`, `plan-candidato.md:30`). | **Cerrado en diseño.** Ya no depende exclusivamente de una capacidad supuesta: existe una salida que bloquea el segundo cobro. |

El cierre del tercer punto no da por existente la búsqueda en el portal ni por aprobado el experimento. H4 debe comprobar la vía elegida; si la recuperación manual tampoco resulta viable, aplica la revisión de alcance que el propio plan prescribe (`plan-candidato.md:15`). Siguen siendo las validaciones del P1 original los cortes tras aceptación, tras persistir y antes de responder, reintentos simultáneos y webhook anticipado (`revision-plan-codex.md:36`); no se consideran ejecutadas por nombrar el archivo de tests.

En las correcciones no aparece una autorización para marcar pagado manualmente: la resolución manual del intento debe recuperar su vínculo, conservando la decisión del pago por el servidor (`CLAUDE.md:20`). Mantener PG durante el rollback conserva la fuente de hechos; tampoco implica devolver escrituras al servidor SQLite congelado. Las aprobaciones de H4 y H8b son expresas, y el webhook único permanece protegido en H7/H9 (`plan-candidato.md:15`, `plan-candidato.md:30–33`; `CLAUDE.md:30`).

## Bloqueantes

Ninguno dentro del alcance solicitado: cero P1 anteriores pendientes y cero P0/P1 nuevos detectados en estas correcciones. No se reabrieron ni se verificó el cierre de los P2 de la revisión anterior.

## NO VERIFICADO

Fuentes contrastadas en este cierre: `plan-candidato.md` corregido, los tres P1 de `revision-plan-codex.md:32–36`, criterios relacionados de `intent.md:13–17` y reglas de `CLAUDE.md:15`, `CLAUDE.md:20–21`, `CLAUDE.md:30`. Se mantienen las instrucciones globales y las secciones «Revisión cruzada» y «Modelo y esfuerzo» leídas durante esta sesión. Rol efectivo comprobado: `rev`.

NO VERIFICADO: implementación de los scripts/tests futuros; ejecución del ensayo y del corte; aplicación compatible con PG durante rollback; recuperación real en pey/portal; capacidades de idempotencia/búsqueda; conservación efectiva de eventos y exclusión concurrente; configuración y aprobaciones reales de los entornos. La declaración de aprobación en `plan-candidato.md:4` no se tomó como autorización para ejecutar operaciones productivas ni como evidencia de que los hitos estén cumplidos.

No se repitieron las pruebas SQLite anteriores: no verifican estas correcciones documentales. No se consultaron secretos, bases de datos ni servicios productivos, y no se ejecutó ningún experimento de pago. Único archivo del repo escrito en este cierre: `docs/changes/2026-11-15-hosting-vercel/verificacion-p1-codex.md`.
