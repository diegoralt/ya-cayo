Implementó: claude · Revisó: codex · gpt-6/high
Fecha: 2026-11-19
Hash revisado: 127204de73e19a13eac8d15e00eccdc6b7ecc914
Base: 2d2d9e0550078ab3191b3a8124140e8c1492549f
Destino: main
esfuerzo: high · P0/P1/P2: 0/0/3

## Veredicto

Sin bloqueantes P0/P1; conviene corregir los tres P2 antes de publicar.

Revisión independiente del diff `Base...HEAD`, sin leer informes de otros revisores. HEAD y base comprobados; sin diferencias locales en archivos versionados revisables. Se leyeron las instrucciones globales, «Revisión cruzada» y «Modelo y esfuerzo» del workflow, la referencia de idioma, `CLAUDE.md`, `docs/arranque.md`, `docs/contexto.md`, intent y plan. No existe `AGENTS.md` en la raíz; `CLAUDE.md` no declara contrato de agentes. Rige el modelo de app/repo públicos y pagos de prueba de $0.01 de `docs/changes/2026-11-15-hosting-vercel/intent.md:24`.

Hashes de los documentos leídos: intent `43aafe52114d44779489cc6514a6fcf62925c2f4`; plan `e5bb7de125e0fe840c9590c8cdd1654875bd9c32`.

Verificación: copia del HEAD en `/private/tmp/ya-cayo-review-4p7ncobq`, excluyendo archivos de entorno originales; Postgres 16 propio en puerto 54330. Migraciones desde cero y `node --test`: **88/88**, sin omisiones ni fallos. Incluye concurrencia, entrega única, PIN, firma, conciliación, importación y denegación a roles públicos. `git diff --check` sin errores. Contenedor y volumen propios eliminados al terminar; no se modificaron los contenedores existentes.

## Bloqueantes

Ninguno.

## Debería

- P2 — **No convertir recepción antigua en procesamiento confirmado.** `scripts/migrar-sqlite-a-pg.js:41` asigna `processed_at = recibido_en` a todos los eventos SQLite. Sin embargo, el servidor original registraba el evento **antes** de consultar pey y podía devolver 503 después (`0258ea2:src/conciliacion.js:20` y `:28`, comprobados en el historial). Condición: un evento pendiente de conciliación al cortar SQLite. Tras importarlo, su reintento se descarta en `src/reconciliation.js:35`; si ya transcurrieron los 30 minutos de respaldo, la lectura tampoco lo recupera (`src/reconciliation.js:67`). Reproducción con código SQLite original, firma válida y Postgres local: respuesta original 503 → importación → reenvío 200, **0 consultas a pey**, orden todavía `pending`. No comprobé que ese estado exista en el respaldo real; por ello no lo trato como bloqueante del corte efectuado. **Arreglo:** importar esos eventos con `processed_at = NULL` salvo evidencia de procesamiento; las restricciones de transacciones y entregas permiten reconciliarlos de nuevo sin duplicar hechos. Añadir el caso al ensayo de migración. Contrato: `intent.md:16`, recibido y procesado deben distinguirse.

- P2 — **El barrido sigue omitiendo la credencial PostgreSQL.** El plan afirma que ahora compara `DATABASE_URL` (`docs/changes/2026-11-15-hosting-vercel/plan.md:33`), pero `CLAVES_SECRETAS` sigue siendo `KEY|SECRET|TOKEN|PIN|PASS|CREDENTIAL` (`scripts/barrido-secretos.sh:19`), y el filtro de `:35` excluye `DATABASE_URL`. El patrón de `:17` tampoco detecta una URL PostgreSQL corriente con contraseña. Reproduje el script en un fixture con una credencial sintética en su archivo de entorno, la misma URL expuesta en un archivo y en un diff de historial; con las respuestas de git simuladas, terminó **0 / «OK: sin hallazgos»**. Esto demuestra una brecha del control, no una filtración real. **Arreglo:** seleccionar explícitamente las variables de conexión, incluida `DATABASE_URL`, tanto para árbol/historial como para respuestas HTTP, y verificar con fixtures que una URL filtrada provoca salida distinta de cero.

- P2 — **Restaurar el español en los mensajes de la caja.** El renombrado sustituyó texto visible: «Una captura de keepAwake no cuenta como pago» (`public/caja.html:168`) y «si alguien pagó justo before» (`:172`). Se muestran en los estados normales Esperando y Vencido a través de `paintDetail` (`:200` y `:204`); el primer mensaje pierde la referencia a una captura de pantalla, una regla central de la caja (`CLAUDE.md:20`). **Arreglo:** restaurar «pantalla» y «antes» en las cadenas visibles, conservando los identificadores técnicos en inglés. La regla global distingue expresamente código en inglés y mensajes para la persona usuaria en español.

## NO VERIFICADO

- No se accedió a producción, secretos ni respaldos reales. Las afirmaciones operativas de `docs/changes/2026-11-15-hosting-vercel/despliegue.md:55` —DNS, certificado, variables, pooler, webhook, pago y entrega reales— se leyeron como evidencia del autor, sin reproducirlas.
- No se ejecutó el barrido con valores reales: requiere leer el archivo de entorno restringido (`scripts/barrido-secretos.sh:28`). El fixture descrito usa exclusivamente datos sintéticos.
- No se probó renderizado en navegador, Vercel, arranque en frío, Supabase remoto ni TLS real. La suite usa Postgres local y dobles de pey; no acredita esos comportamientos del destino.
- La prueba desde otra red y la rotación de PIN están diferidas en `despliegue.md:65`; no se presentan aquí como comprobadas.
