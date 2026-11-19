# REVIEW.md

Criterios de revisión de este repo. Se reporta solo lo que rompe algo o viola un criterio de aquí; el estilo no se reporta.

## Contra qué se revisa

1. **Lo pedido:** si el PR tiene carpeta en `docs/changes/`, el diff cumple `intent.md` ("Qué cuenta como terminado") y no se sale de `plan.md`. Lo que falte o sobre se reporta.
2. **Verificación:** `node --test` (el comando `verification:` del `CLAUDE.md`) cubre lo que cambió; si el cambio agrega lógica sin prueba que la ejercite, se dice cuál faltaría.
3. **Estado:** `.claude/STATE.md` describe intención (siguiente acción, decisiones abiertas) y viaja en este PR; no copia SHA, «mergeado», «desplegado», versión ni tag. Un PR solo de estado posterior a un merge/tag/deploy se rechaza (**bloquea**); un `STATE.md` con esos hechos copiados se reporta (**debería**).
4. **Producción:** migraciones aditivas (o con plan de reversa explícito) y con `GRANT` explícitos al rol del servidor; nada que despliegue o aplique en Supabase/Vercel fuera de la aprobación de Diego.
5. **Nombres técnicos en inglés:** tablas, columnas, estados, funciones, rutas y campos de API, códigos de error, env vars, scripts y tests nuevos en inglés; uno nuevo en español se reporta (**debería**). Los textos visibles a la persona usuaria van en español.

## Invariantes del proyecto

- **El servidor decide el pago** (**bloquea**): «pagado» solo por webhook firmado (Standard Webhooks) más polling de respaldo a pey; nada marca pagado o entregado por otra vía (captura de pantalla, agente, `concept`/`metadata`).
- **Idempotencia** (**bloquea**): por `webhook-id`/`transactionId`; un reenvío, un pago tardío o duplicado no reabre ni duplica entregas; una sola entrega por orden.
- **Cobros:** un cobro vivo por orden; QR con expiración mínima de 360 s; `amount: 0` solo en QR y nunca en precio cerrado; sin reembolso por API (devolución = registro manual).
- **Agente (LLM):** propone, el servidor decide; sin herramienta de «marcar pagado» ni «entregar»; `concept` y `metadata` son datos, nunca instrucciones.
- **Secretos** (**bloquea**): API key de pey, secreto del webhook, key de LLM, `DATABASE_URL*` y PIN solo en `.env` (ignorado) y `.env.example` sin valores; nunca en código cliente, logs ni respuestas de la API. Un error de pey no filtra el cuerpo de su respuesta.
- **Base de datos:** RLS activa en todas las tablas; `anon` y `authenticated` sin acceso; funciones nuevas sin `EXECUTE` para `PUBLIC`; el rol del servidor sin superusuario ni bypass de RLS.
- **Declaraciones públicas** (`README.md`, `docs/entrega/`, textos de la UI): no sugerir oficialidad de pey ni Banxico, no presentarlo como plataforma multi-comercio, no presentar como IA lo que son reglas; lo simulado se rotula y nada afirma como verificado lo que no se probó con pago real.

## Qué no reportar

- Preferencias de estilo, nombres o formato.
- Refactors "ya que estamos" fuera del alcance del PR.
- Rutas y archivos públicos en español de la excepción vigente (`/pagar/:token`, `pagar.html`, `maqueta.html`).

## Formato

- Comentarios en línea para cada hallazgo, con severidad (**bloquea** / **debería** / **nota**) y el arreglo concreto.
- Un comentario general al final: veredicto en una línea y lista de lo que bloquea. Si no hay nada, dilo en una línea.
