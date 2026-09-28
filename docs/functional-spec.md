# Especificación Funcional — Bandeja de Reseñas

> **Rol:** Analista Funcional Senior & Product Owner (SaaS Gastronómico)
> **Producto:** Bandeja de entrada diaria de gestión de reseñas de Google
> **Cliente:** Grupo gastronómico con 2 restaurantes y 3 sedes
> **Estado:** v1.0

---

## 1. Contexto del negocio

Un grupo gastronómico administra dos restaurantes:

| Restaurante | ID | Sedes |
|---|---|---|
| La Parrilla del Sur | `rest-1` | Palermo (`loc-1`), Belgrano (`loc-2`) |
| Sakura Sushi | `rest-2` | Centro (`loc-3`) |

Las reseñas llegan como exportaciones en formato JSON. El objetivo de la herramienta es
**una bandeja de entrada diaria** donde el gerente revisa lo que se publicó, redacta una
respuesta y la guarda, con métricas por sede que le permitan ver de un vistazo cómo viene
la semana.

El producto no se integra con la API de Google. Consume exportaciones JSON. Eso tiene una
consecuencia importante: **la exportación puede traer datos sucios**, y la bandeja tiene que
sobrevivirlo sin mostrar información falsa.

---

## 2. Perfil de usuario

**Nombre:** Gerente de operaciones del grupo.
**Tamaño del equipo:** 1 persona. No hay dedicated ni community manager.
**Frecuencia de uso:** diaria, una vez por día, en horario de mañana.
**Dispositivo:** escritorio o tablet, en sesión larga única.
**Conocimientos técnicos:** ninguno. Nunca ve la base de datos ni un log.

### Qué necesita y qué no

| Necesita | No necesita |
|---|---|
| Saber qué reseñas nuevas hay y responderlas | Un CRM con historial de clientes |
| Un promedio por sede confiable | Un sistema de alertas y notificaciones |
| Saber qué porcentaje ya está respondido | Reportes exportables o graphs históricos |
| Confianza de que los números no mienten | Configuración técnica |

### Su Anxiety principal

Una métrica que se ve "0.0" o "3.6" y en realidad no significa nada porque el denominador
está mal. El gerente no va a auditar la matemática: **si la pantalla muestra un número, ese
número tiene que ser cierto o tiene que decir que no hay datos.**

---

## 3. Rutina diaria matutina

El recorrido real del usuario, en orden:

1. **Abre la app.** Lo primero que ve son las tres tarjetas de métricas, una por sede.
   Lee los promedios y los % de respuesta para detectar si algo se cayó.
2. **Detecta la sede que empeoró.** Si el promedio bajó, necesita ir a esa sede.
3. **Filtra la bandeja.** Por defecto ve las **pendientes** de respuesta. Ajusta por sede
   y por número de estrellas si quiere priorizar.
4. **Redacta respuesta por respuesta.** Para cada reseña:
   - Si la reseña es positiva, agradece y xr.
   - Si es negativa, pide disculpas y se compromete a corregir.
   - Opcionalmente pide un borrador por IA y lo edita antes de guardar.
5. **Guarda.** El borrador desaparece, la respuesta queda escrita, el % de la barra sube.
6. **Repite desde el paso 3** con la siguiente tanda.

### Fricciones que la herramienta debe eliminar

| Fricción | Solución de producto |
|---|---|
| No saber qué cambió desde ayer | Orden por fecha, pendientes primero |
| Perder tiempo escribiendo respuestas repetitivas | Borrador IA como punto de partida |
| No saber si ya respondió algo | Estado responded/pendiente visible en la tarjeta |
| No saber si el promedio es confiable | `Sin datos` explícito cuando no hay base |
| Perder el contexto al filtrar | Filtros en la URL, compartibles y recargables |

---

## 4. Reglas de negocio

### RN-01 — Deduplicación por `updated_at` más reciente

**Regla.** Si dos registros comparten el mismo `id`, gana el que tenga `updated_at` más
reciente. El otro se descarta.

**Justificación.** Una exportación puede contener la misma reseña en dos versiones porque
el negocio la editó en Google. La versión nueva es la que refleja la realidad. Conservar la
vieja mostraría al gerente un problema ya resuelto, o resolvería uno que ya existía.

**Caso de prueba.** `rv-205` aparece dos veces: rating 1 con `updated_at`
`2026-09-11T22:40:00Z`, y rating 3 con `updated_at` `2026-09-13T09:05:00Z`. Gana la segunda:
el delivery terminó resolviéndose.

**Consecuencia observable.** Centro tiene 6 reseñas, no 7.

---

### RN-02 — Descarte de sede inexistente, sin creación automática

**Regla.** Si `reviews[].location_id` no existe en la tabla `locations`, el registro se
**descarta** y se genera un log de omisión. **Nunca se crea la sede.**

**Justificación.** Este es el límite más importante de la herramienta. Un error de tipeo en
el `id` de una sede no puede fabricar un restaurante nuevo en el catálogo: produciría una
sede fantasma con métricas propias, que el gerente leería como real. La pérdida de una
reseña es un costo aceptable; un dato inventado no.

**Caso de prueba.** `rv-301` referencia `loc-99`, que no está en el catálogo. Se descarta.

**Consecuencia observable.** El catálogo tiene 3 sedes. Nunca 4.

---

### RN-03 — `rating: null` cuenta en el total, no en el promedio

**Regla.** Una reseña sin calificación suma al **total de opiniones recibidas** pero queda
**excluida del cálculo del promedio de estrellas**.

**Justificación.** Son dos preguntas distintas. "Cuántas personas nos escribieron" y "qué
tan bien nos calificaron". Una persona que no dejó estrellas **sí nos escribió** — ignorarla
en el total la esconde del gerente. Pero incluirla en el promedio con valor 0 (el default de
SQL) contamina la métrica hacia abajo y castiga al restaurante por un problema del cliente
que no pudo completar laStars.

**Caso de prueba.** `rv-108` tiene `rating: null`.

**Consecuencia observable.** Palermo tiene 9 reseñas pero solo 8 calificadas. El promedio es
`29 / 8 = 3.63`, no `29 / 9 = 3.22`.

> **Trampa de implementación:** en SQL, `AVG(rating)` ignora los `NULL` automáticamente, pero
> `COUNT(rating)` también. El danger real es usar `COALESCE(rating, 0)` antes de agregar, que
> convierte "noanghai.opinó" en "opinó 0 estrellas".

---

### RN-04 — `text: ""` es una reseña válida y habilita respuesta

**Regla.** Una reseña sin texto pero con calificación se importa, se muestra y se puede
responder. En la respuesta, la IA (o el usuario) genera un **agradecimiento general por la
puntuación**, sin referencias al contenido porque no hay contenido.

**Justificación.** Un cliente que deja 5 estrellas sin escribir nada igual está opinando: el
puntaje es el mensaje. La calificación es información valiosa, y descartar el registro
perdería una señal positiva de la sede. Además es un caso habitual en delivery: el cliente
escribió poco porque no encontró nada que reportar.

**Caso de prueba.** `rv-105`, rating 5, `text: ""`.

**Consecuencia observable.** En la tarjeta de la reseña el texto se renderiza como un
placeholder, no como un espacio en blanco que parece un bug de carga.

---

### RN-05 — Sede sin reseñas muestra "Sin datos", nunca "0.0"

**Regla.** Si la sede no tiene reseñas, o tiene reseñas pero ninguna con `rating` distinto de
`null`, el promedio se renderiza como la cadena `Sin datos`. El % de respondidas se
renderiza como `0%`. **Nunca se muestra `0.0`, `0`, `-` ni un ícono vacío.**

**Justificación.** `0.0` es una **afirmación falsa**. Dice "recibimos reseñas y todas fueron
de 0 estrellas", cuando la verdad es "no sabemos". Es la diferencia entre un restaurante malo
y un restaurante del que no tenemos datos. Un gerente que ve `0.0` en Belgrano va a tomar una
decisión comercial basada en nada.

**Caso de prueba.** `loc-2` (Belgrano) existe en el catálogo, está activa, y no tiene ninguna
reseña en la carga.

**Consecuencia observable.** El promedio de Belgrano es `null` en el modelo, y la tarjeta
muestra `Sin datos`.

---

### RN-06 — Borrador no es respuesta (derivada de la interacción con RN-04)

**Regla.** Un borrador generado por IA vive en estado de cliente. Nunca se escribe en
`reviews.reply_text` hasta que el usuario confirma el guardado. Mientras exista sin guardar,
se marca de forma inequívoca.

**Justificación.** El borrador es una propuesta de un modelo externo. Si se persistiera
automáticamente, un error de la IA quedaría publicado como respuesta oficial del
restaurante, con el nombre del restaurante abajo. Además la auditoría no podría distinguir
qué escribió una persona y qué escribió el modelo.

**Consecuencia observable.** Borde punteado violeta + indicador que nunca afirma que el texto
vino de la IA si salió del fallback local: `Borrador generado por IA`, `Borrador local (sin IA
configurada)`, `Borrador local (la IA falló...)` con alerta `Fallo borrador IA`, o `Borrador local
(límite de generación IA alcanzado)` con nota ámbar cuando se cortó la IA por protección de costos.

---

### RN-07 — Toda mutación queda auditada (derivada de la confianza en los datos)

**Regla.** Toda operación que cree, modifique o rechace datos escribe un registro en
`audit_logs`.

**Justificación.** Es el respaldo de la promesa central del producto: los números son
verificables. Incluye los rechazos, no solo los éxitos: una reseña descartada sin log es
indistinguible de una que nunca llegó, y esa es exactamente la duda que el gerente no puede
resolver solo.

---

### RN-08 — Listado público en modo lectura; escribir exige sesión

**Regla.** Ver la bandeja (métricas, filtros y listado) no requiere sesión: la URL se puede
compartir y quien la reciba ve exactamente la misma vista, en modo lectura. Generar
borradores y guardar respuestas exige iniciar sesión con el usuario único configurado en el
servidor (`REVIEWS_LOGIN_USER` / `REVIEWS_LOGIN_PASS`); las escrituras envían el token
(`REVIEWS_REPLY_TOKEN`) como `Authorization: Bearer <token>`.

**Justificación.** Los filtros viven en la URL (HU-02) justamente para poder pasarle el
link a un colega; si la autenticación tapara toda la pantalla, ese caso de uso moriría. La
escritura es la parte no compartible: un visitante puede ver qué filtros usamos, pero no
contestar en nombre del restaurante.

**Consecuencias observables.**
- Al abrir la app se ve el spinner "Verificando usuario…" mientras se valida el token
  guardado.
- Sin sesión (o con token inválido), las tarjetas muestran "Modo lectura. Iniciá sesión
  para generar borradores y contestar." y un botón flotante "Iniciar sesión".
- `POST /api/save-reply` y `POST /api/generate-draft` sin token responden 401.
- Sin la configuración en el servidor, la app queda de solo lectura y el login responde
  503 (fail-closed: nunca se deja pasar una escritura por un accidente de entorno).

---

## 5. Historias de usuario

### HU-01 — Importación idempotente

> Como gerente, quiero que la carga de reseñas se pueda repetir sin miedo, para poder
> reconectar la herramienta con una exportación nueva sin duplicar nada ni perder lo ya respondido.

```gherkin
Escenario: Primera carga
  Dado el catálogo con 2 restaurantes y 3 sedes
  Y la base de datos vacía de reseñas
  Cuando se importa reviews.json
  Entonces la importación responde success = "ok"
  Y quedan 15 reseñas almacenadas
  Y quedan 3 restaurantes y 3 sedes almacenados
  Y se registra un evento IMPORT_REVIEWS con response_status = "ok"

Escenario: Deduplicación por fecha de actualización
  Dado que rv-205 aparece dos veces
  Y la primera versión tiene rating 1 y updated_at 2026-09-11T22:40:00Z
  Y la segunda versión tiene rating 3 y updated_at 2026-09-13T09:05:00Z
  Cuando se importa reviews.json
  Entonces rv-205 se almacena una sola vez
  Y su rating es 3
  Y su updated_at es 2026-09-13T09:05:00Z

Escenario: Descartar sede inexistente sin crearla
  Dado que rv-301 referencia loc-99
  Y loc-99 no existe en el catálogo de sedes
  Cuando se importa reviews.json
  Entonces rv-301 no se almacena
  Y loc-99 no se crea en locations
  Y se registra un evento SKIP_REVIEW con response_status = "fail"
  Y el error indica que la sede no existe

Escenario: Reimportación sin duplicados
  Dado que ya se ejecutó una importación completa
  Y rv-103 tiene una respuesta guardada
  Cuando se importa reviews.json por segunda vez
  Entonces la cantidad total de reseñas sigue siendo 15
  Y la respuesta de rv-103 no se sobrescribe
  Y rv-105 sigue con rating 5
```

---

### HU-02 — Filtros sincronizados con la URL

> Como gerente, quiero que el filtro que elegí quede en la URL, para poder mandar el link a
> mi colega y que vea exactamente la misma vista.

```gherkin
Escenario: Filtrar por restaurante
  Dado que la URL es /
  Cuando selecciono el restaurante "La Parrilla del Sur" en el filtro de Restaurante
  Entonces la URL contiene ?restaurante=rest-1
  Y la lista muestra solo reseñas de Palermo y Belgrano

Escenario: Filtrar por restaurante y sede (AND)
  Dado que la URL es /?restaurante=rest-1
  Cuando agrego el filtro sede=loc-1
  Entonces la lista muestra solo reseñas de Palermo
  Y la URL contiene ?restaurante=rest-1&sede=loc-1
  Y el filtro de Sede muestra solo Palermo y Belgrano (las sedes de rest-1)

Escenario: Cambiar de restaurante limpia una sede incompatible
  Dado que la URL es /?restaurante=rest-1&sede=loc-1
  Cuando selecciono el restaurante "Sakura Sushi" (rest-2)
  Entonces la URL pasa a contener ?restaurante=rest-2 sin sede
  Y el filtro de Sede muestra solo Centro (la sede de rest-2)
  Y la lista muestra las reseñas de Centro

Escenario: Filtrar por sede
  Dado que la URL es /
  Cuando selecciono la sede "Palermo" en el filtro de Sede
  Entonces la URL contiene ?sede=loc-1
  Y la lista muestra solo reseñas de Palermo

Escenario: Filtrar por estado
  Dado que la URL es /
  Y el filtro de Estado por defecto es "pendientes"
  Cuando selecciono "respondidas"
  Entonces la URL contiene ?estado=respondidas
  Y la lista muestra solo reseñas con respuesta guardada

Escenario: Recargar preserva la vista
  Dado que la URL es /?sede=loc-3&estrellas=baja
  Cuando recargo la página
  Entonces los filtros muestran Palermo reemplazado por Centro y "1–2 estrellas"
  Y la lista muestra solo reseñas de Centro con rating 1 o 2

Escenario: Filtros combinados
  Dado que la URL es /?sede=loc-1&estado=pendientes
  Cuando agrego el filtro estrellas=media
  Entonces la URL contiene los tres parámetros
  Y la lista muestra reseñas de Palermo de 3 estrellas sin respuesta
```

---

### HU-03 — Borrador IA adaptativo según el puntaje

> Como gerente, quiero un borrador que ya tenga el tono correcto según la calificación, para
> no arrancar cada respuesta desde cero ni mandar un texto alegre a alguien que se quejó.

```gherkin
Escenario: Borrador para reseña positiva
  Dado una reseña de Palermo con rating 5 y texto "La provoleta es lo mejor que probé en años"
  Cuando pido un borrador
  Entonces el borrador agradece
  Y el borrador menciona el restaurante por su nombre

Escenario: Borrador para reseña negativa
  Dado una reseña de Centro con rating 1 y texto "Dos horas de demora en el delivery. Llegó frío"
  Cuando pido un borrador
  Entonces el borrador pide disculpas
  Y el borrador no es un agradecimiento

Escenario: Borrador para reseña sin texto
  Dado una reseña de Palermo con rating 5 y text vacío
  Cuando pido un borrador
  Entonces el borrador agradece
  Y el borrador no hace referencia a ningún comentario

Escenario: El borrador no se persiste solo
  Dado que generé un borrador para rv-101
  Y todavía no lo guardé
  Cuando consulto la base de datos
  Entonces reviews.reply_text de rv-101 sigue siendo null
  Y la tarjeta muestra el indicador de borrador sin guardar
  Y se registró un evento GENERATE_AI_DRAFT con response_status = "ok"

Escenario: Falta la API Key del proveedor
  Dado que no hay API Key configurada del proveedor de IA
  Cuando pido un borrador
  Entonces el endpoint responde success = "ok"
  Y el borrador viene del template local (fromFallback = true)
  Y la tarjeta lo marca como "Borrador local (sin IA configurada)"
  Y la aplicación sigue siendo utilizable

Escenario: El proveedor de IA falla
  Dado una API Key configurada
  Y el proveedor responde con error o no responde
  Cuando pido un borrador
  Entonces el endpoint responde success = "ok" con el template local
  Y la respuesta incluye aiError con el motivo del fallo
  Y la tarjeta muestra la alerta "Fallo borrador IA"
  Y no se finge que el texto vino de la IA

Escenario: Límite de generación IA alcanzado
  Dado una API Key configurada
  Y se alcanzó el límite de generaciones IA de la ventana (por hora o por día)
  Cuando pido un borrador
  Entonces el endpoint responde success = "ok" con el template local
  Y la respuesta incluye budgetReason con el motivo
  Y la tarjeta lo marca como "Borrador local (límite de generación IA alcanzado)"
  Y no se llamó al proveedor de IA
```

---

### HU-04 — Persistencia de respuestas

> Como gerente, quiero que la respuesta que escribo quede guardada y no se pierda si cierro la
> pestaña, para no tener que volver a escribirla.

```gherkin
Escenario: Guardar una respuesta nueva
  Dado una reseña de Palermo sin respuesta
  Cuando escribo "Gracias por avisarnos, ya lo vamos a revisar"
  Y presiono Guardar
  Entonces el endpoint responde success = "ok"
  Y reviews.reply_text de esa reseña es el texto escrito
  Y reviews.replied_at es la hora actual
  Y el porcentaje de respondidas de Palermo sube de 22.2% a 33.3%
  Y la tarjeta pierde el indicador de borrador
  Y se registra un evento SAVE_REPLY con response_status = "ok"

Escenario: Editar una respuesta ya guardada
  Dado la reseña rv-103 con una respuesta guardada
  Cuando modifico el texto y presiono Guardar
  Entonces el endpoint responde success = "ok"
  Y el texto queda actualizado
  Y replied_at se actualiza

Escenario: Respuesta vacía
  Dado una reseña sin respuesta
  Cuando presiono Guardar con el campo vacío
  Entonces el endpoint responde success = "fail"
  Y el mensaje explica que la respuesta no puede estar vacía
  Y no se escribe nada en la base de datos
  Y se registra un evento SAVE_REPLY con response_status = "fail"

Escenario: Reseña inexistente
  Dado que no existe ninguna reseña con id "rv-999"
  Cuando intento guardar una respuesta
  Entonces el endpoint responde success = "fail"
  Y se registra un evento SAVE_REPLY con response_status = "fail"
```

---

### HU-05 — Tarjetas Bento con promedios correctos

> Como gerente, quiero ver de un vistazo cómo viene cada sede, y confiar en lo que veo, para
> saber a dónde dirigir la atención antes de la reunión de mañana.

```gherkin
Escenario: Sede con datos suficientes
  Dado la sede Palermo con 9 reseñas, de las cuales 8 tienen calificación
  Y 2 de esas 9 tienen respuesta guardada
  Cuando abro el dashboard
  Y la tarjeta de Palermo muestra
  Entonces el total de reseñas es 9
  Y el promedio es 3.63
  Y el porcentaje de respondidas es 22.2%
  Y la barra de progreso de respondidas está en 22.2%

Escenario: Sede con reseñas sin calificación suficiente
  Dado la sede Centro con 6 reseñas, todas calificadas
  Y 1 de esas 6 tiene respuesta guardada
  Cuando abro el dashboard
  Y la tarjeta de Centro muestra
  Entonces el total de reseñas es 6
  Y el promedio es 3.67
  Y el porcentaje de respondidas es 16.7%

Escenario: Sede sin reseñas
  Dado la sede Belgrano, que no tiene ninguna reseña
  Cuando abro el dashboard
  Y la tarjeta de Belgrano muestra
  Entonces el total de reseñas es 0
  Y el promedio muestra "Sin datos"
  Y NO muestra 0.0
  Y NO muestra 0
  Y el porcentaje de respondidas es 0%

Escenario: Sede con reseñas pero ninguna calificada
  Dado una sede con 4 reseñas, todas con rating null
  Cuando abro el dashboard
  Y la tarjeta de esa sede muestra
  Entonces el total de reseñas es 4
  Y el promedio muestra "Sin datos"
  Y el porcentaje de respondidas refleja las respuestas guardadas

Escenario: Reseña sin calificación no altera el promedio
  Dado la sede Palermo
  Y la reseña rv-108 tiene rating null
  Cuando se calcula el promedio de Palermo
  Entonces el denominador es 8
  Y el numerador es 29
  Y el promedio es 3.63
  Y el total de reseñas sigue siendo 9
```

---

### HU-06 — Trazabilidad y auditoría

> Como responsable del negocio, quiero poder auditar qué se cargó y qué se respondió, para
> poder explicar un número que me cuestionen.

```gherkin
Escenario: Se audita la importación exitosa
  Dado que se importa reviews.json de forma completa
  Cuando termina el proceso
  Entonces existe un registro en audit_logs
  Y su action es IMPORT_REVIEWS
  Y su response_status es "ok"
  Y su method es "POST"
  Y su request_payload contiene la cantidad de registros recibidos

Escenario: Se auditan los descartes
  Dado que rv-301 fue descartado por referenciar loc-99
  Cuando se consulta audit_logs
  Entonces existe un registro con action SKIP_REVIEW
  Y su entity_name es "reviews"
  Y su entity_id es "rv-301"
  Y su response_status es "fail"
  Y su error_message explica que la sede loc-99 no existe

Escenario: Se audita el guardado de una respuesta
  Dado que guardé una respuesta para rv-101
  Cuando se consulta audit_logs
  Entonces existe un registro con action SAVE_REPLY
  Y su entity_id es "rv-101"
  Y su request_payload contiene el texto de la respuesta
  Y su response_status es "ok"

Escenario: Se auditan los errores del proveedor de IA
  Dado una API Key configurada
  Y el proveedor de IA falla
  Cuando pido un borrador
  Entonces existe un registro con action GENERATE_AI_DRAFT
  Y su response_status es "fail"
  Y su error_message contiene el motivo del fallo
  Y su response_data contiene aiError

Escenario: Ninguna auditoría expone credenciales
  Dado cualquier registro de audit_logs
  Cuando inspecciono su request_payload
  Entonces no contiene ninguna API Key
  Y no contiene la service role key de Supabase
```

---

### HU-07 — Sesión de escritura con modo lectura público

> Como gerente, quiero que el link de la bandeja se pueda compartir sin exponer la
> posibilidad de contestar, y entrar con usuario y contraseña cuando quiero escribir.

```gherkin
Escenario: Abrir la app sin sesión
  Dado que no guardé ninguna sesión en este navegador
  Cuando abro la bandeja
  Entonces veo el spinner "Verificando usuario…"
  Y el dashboard se muestra completo con las métricas y los filtros
  Y las tarjetas muestran "Modo lectura. Iniciá sesión para generar borradores y contestar."
  Y hay un botón flotante "Iniciar sesión"

Escenario: Login con credenciales correctas
  Dado el botón flotante "Iniciar sesión"
  Cuando ingreso usuario y contraseña correctos
  Entonces el endpoint responde success = "ok" con el token
  Y se registra un evento AUTH_LOGIN con response_status = "ok"
  Y las tarjetas muestran los botones de responder y generar borrador

Escenario: Login con credenciales incorrectas
  Dado el botón flotante "Iniciar sesión"
  Cuando ingreso usuario o contraseña incorrectos
  Entonces el endpoint responde success = "fail" con status 401
  Y se registra un evento AUTH_LOGIN con response_status = "fail"
  Y la interfaz muestra "Usuario o contraseña incorrectos."
  Y la bandeja sigue en modo lectura

Escenario: Escribir sin sesión queda cerrado
  Dado que no hay sesión
  Cuando llamo a save-reply o generate-draft sin token
  Entonces el endpoint responde success = "fail" con status 401
  Y se registra un evento SAVE_REPLY / GENERATE_AI_DRAFT con response_status = "fail"
  Y su error_message es "No autorizado: iniciá sesión para responder."

Escenario: Sesión válida al recargar
  Dado que inicie sesión en este navegador
  Cuando recargo la página
  Entonces el token guardado se valida contra /api/auth/verify
  Y la bandeja se muestra con escritura habilitada

Escenario: Servidor sin autenticación configurada
  Dado que el servidor no tiene REVIEWS_LOGIN_USER/PASS/REPLY_TOKEN configurados
  Cuando intento iniciar sesión
  Entonces el endpoint responde success = "fail" con status 503
  Y ninguna escritura puede pasar (fail-closed)
```

---

## 6. Datos de referencia

Valores esperados con el dataset actual. Sirven como contrato de aceptación: si el código
produce otra cosa, hay un bug.

| Sede | Restaurante | Total | Calificadas | Suma | Promedio | Respondidas |
|---|---|---|---|---|---|---|
| Palermo `loc-1` | La Parrilla del Sur | 9 | 8 | 29 | **3.63** | 2 (22.2%) |
| Centro `loc-3` | Sakura Sushi | 6 | 6 | 22 | **3.67** | 1 (16.7%) |
| Belgrano `loc-2` | La Parrilla del Sur | 0 | 0 | — | **null** | 0 (0%) |

Reseñas ya respondidas en el dataset: `rv-103`, `rv-107` (Palermo), `rv-201` (Centro).
Reseña descartada: `rv-301`.

### Casos sucios cubiertos

| ID | Tipo | Regla | Efecto en métricas |
|---|---|---|---|
| `rv-205` | Duplicado | RN-01 | Centro tiene 6, no 7 |
| `rv-301` | FK inválida | RN-02 | Ninguna. Se audita |
| `rv-108` | `rating: null` | RN-03 | Palermo: total 9, promedio sobre 8 |
| `rv-105` | `text: ""` | RN-04 | Palermo: cuenta en el total y promedio |
| `loc-2` | Sede vacía | RN-05 | Belgrano: `null` / 0% |

---

## 7. Fuera de alcance (v1)

Explícitamente fuera, para que no se cuelgue:

- Integración con la API de Google My Business (la v1 consume exportaciones)
- Autenticación multi-usuario y roles (la v1 usa un usuario único de escritura, RN-08)
- Envío real de la respuesta a Google
- Gráficos históricos y tendencias
- Exportación de métricas a Excel o PDF
- Respuestas privadas
- Moderación automática de reseñas ofensivas

## 8. Preguntas abiertas

| # | Pregunta | Impacto | Quién decide |
|---|---|---|---|
| 1 | ¿Qué proveedor de IA para los borradores? | Resuelto: OpenRouter (API compatible con OpenAI) | Producto |
| 2 | ¿Se puede editar una respuesta ya guardada, o es inmutable? | HU-04 asume editable | Producto |
| 3 | ¿La fecha de "hace 2 días" usa zona horaria del restaurante o del servidor? | Afecta a la percepción de frescura | Producto |
