# Seguridad, Privacidad y Cumplimiento

[← Índice general](./00-README.md)

## Índice

1. [Alcance de este documento](#1-alcance-de-este-documento)
2. [Autenticación](#2-autenticación)
3. [Autorización: defensa en profundidad](#3-autorización-defensa-en-profundidad)
4. [Row Level Security por entidad](#4-row-level-security-por-entidad)
5. [Marco legal de protección de datos personales](#5-marco-legal-de-protección-de-datos-personales)
6. [El punteo como dato sensible: implicancias de diseño](#6-el-punteo-como-dato-sensible-implicancias-de-diseño)
7. [Cifrado y transporte](#7-cifrado-y-transporte)
8. [Gestión de secretos y credenciales](#8-gestión-de-secretos-y-credenciales)
9. [Minimización de datos hacia servicios de IA externos](#9-minimización-de-datos-hacia-servicios-de-ia-externos)
10. [Backups y recuperación ante desastres](#10-backups-y-recuperación-ante-desastres)
11. [Auditoría](#11-auditoría)
12. [Recuperación ante errores de aplicación](#12-recuperación-ante-errores-de-aplicación)
13. [Checklist de seguridad previo a producción](#13-checklist-de-seguridad-previo-a-producción)

---

## 1. Alcance de este documento

Este documento centraliza todas las decisiones de seguridad y privacidad del sistema. Otros documentos (particularmente [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) y [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md)) hacen referencia a las políticas definidas acá en lugar de redefinirlas, para que exista una única fuente de verdad sobre seguridad.

**Aviso**: las secciones de esta documentación que tratan sobre marco legal (sección 5) son información general orientativa, recogida y verificada al momento de redactar este documento, **no un dictamen legal**. Antes de operar el sistema con datos reales de personas, se recomienda una revisión puntual con asesoría legal profesional, en particular sobre el módulo de punteo (sección 6).

## 2. Autenticación

- Delegada íntegramente a **Supabase Auth**. La aplicación no implementa ni almacena lógica propia de contraseñas.
- Método de autenticación recomendado: email + contraseña, con la opción de habilitar *magic link* (enlace de acceso sin contraseña) para reducir fricción de onboarding de militantes nuevos.
- **Autenticación de múltiple factor (MFA)** recomendada como obligatoria para el rol Administrador, dado su acceso a punteo completo y configuración del sistema; opcional pero disponible para el resto de los roles.
- Política de contraseñas: mínimo 10 caracteres, sin composición forzada de caracteres especiales (las reglas de complejidad forzada generan peor higiene de contraseñas en la práctica que exigir simplemente longitud suficiente).
- Expiración de sesión: sesión persistente con renovación automática de token mientras haya actividad; cierre de sesión forzado tras un período configurable de inactividad (recomendado: 30 días) vía la configuración de Supabase Auth.

## 3. Autorización: defensa en profundidad

El sistema implementa autorización en **dos capas independientes**, deliberadamente redundantes:

| Capa | Dónde vive | Qué previene |
|---|---|---|
| **Aplicación** | Servicios en `lib/servicios/`, verificados en cada Server Action antes de ejecutar cualquier lógica (ver [`03-arquitectura.md`](./03-arquitectura.md#8-autenticación-y-autorización-a-nivel-de-arquitectura)) | La mayoría de los escenarios de uso normal; es la capa que conoce el detalle completo de los permisos definidos en [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md) |
| **Base de datos (RLS)** | Políticas de Row Level Security en PostgreSQL, evaluadas en cada consulta sin importar desde dónde se origine | Un error de lógica en la capa de aplicación, una consulta directa no prevista, o un futuro punto de acceso a la base de datos que se agregue sin pasar por la capa de servicios |

Ninguna de las dos capas reemplaza a la otra. La capa de aplicación es más expresiva (puede evaluar reglas de negocio complejas); la capa de RLS es más difícil de eludir por error humano, porque vive en la base de datos misma.

## 4. Row Level Security por entidad

| Entidad | Política de RLS |
|---|---|
| `PunteoPersona` | Un usuario solo puede `SELECT`/`INSERT`/`UPDATE` filas donde `usuario_id` = su propio ID, **salvo** que su rol tenga el permiso `punteo.ver_todos`, verificado contra la tabla `RolPermiso` desde la política misma |
| `PunteoComentario` | Igual criterio, evaluado a través del `punteo_persona_id` al que pertenece cada comentario |
| `Persona`, `Actividad`, `Participacion` | Lectura permitida a cualquier usuario autenticado con el permiso `*.ver` correspondiente; escritura restringida por permiso de la misma forma |
| `PadronElectoral`, `PadronEntrada` | Lectura/escritura condicionada a `padron.ver` / `padron.gestionar` respectivamente |
| `HistorialCambio` | Solo lectura, y solo para usuarios con `auditoria.ver`; sin política de escritura vía cliente (los `INSERT` solo se ejecutan desde la capa de servicios con la *service role key*, nunca desde el cliente) |
| `ConfiguracionSistema` | Lectura amplia para valores no sensibles necesarios en la UI (ej. catálogos), escritura restringida a `configuracion.gestionar` |

Estas políticas se implementan como parte de las migraciones de Prisma/Postgres durante la etapa de desarrollo (fuera del alcance de este documento, que define **qué** política debe existir, no el SQL que la implementa).

## 5. Marco legal de protección de datos personales

El sistema procesa datos personales de estudiantes de una universidad pública argentina, por lo que aplica la **Ley 25.326 de Protección de Datos Personales** (también conocida como Ley de Hábeas Data), su decreto reglamentario, y las resoluciones vigentes de la **Agencia de Acceso a la Información Pública (AAIP)**, autoridad de aplicación de la ley.

Puntos relevantes para el diseño de este sistema:

- **Datos sensibles (Art. 2°)**: la ley define como datos sensibles a los que revelan origen racial o étnico, opiniones políticas, convicciones religiosas, filosóficas o morales, afiliación sindical, o información de salud o vida sexual. **La clasificación de punteo (afinidad política) cae bajo esta categoría.**
- **Prohibición general y excepción para organizaciones políticas (Art. 7°)**: la ley prohíbe, como regla general, formar archivos o bases de datos que revelen datos sensibles. Contempla una excepción explícita para que las organizaciones políticas y sindicales lleven un **registro de sus propios miembros**. Ver el desarrollo completo de esta excepción y su zona de ambigüedad respecto del punteo en [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md#10-consideraciones-legales).
- **Autoridad de aplicación**: la AAIP sucede a la antigua Dirección Nacional de Protección de Datos Personales, y sus resoluciones (entre ellas, disposiciones sobre niveles de seguridad reforzados para datos sensibles) son de cumplimiento obligatorio.
- **Derechos de los titulares**: toda persona tiene derecho de acceso, rectificación, actualización y supresión de sus propios datos personales. El sistema debe poder, operativamente, responder a un pedido de este tipo por parte de una Persona (por ejemplo, mediante el flujo de archivado/edición ya descripto en [`05-modulo-personas.md`](./05-modulo-personas.md)), aunque no exista un portal de autoservicio para que la persona lo solicite directamente (fuera de alcance según [`01-vision-alcance.md`](./01-vision-alcance.md)) — el canal de solicitud es externo al sistema (contacto directo con la organización).
- **Estado del marco normativo**: existen, a la fecha de esta documentación, proyectos de reforma de la Ley 25.326 en debate legislativo, orientados a modernizarla frente a los desafíos de la IA y la economía de datos, pero la ley continúa plenamente vigente en su redacción actual. Se recomienda revisar el estado de esa reforma antes de cambios mayores al tratamiento de datos sensibles del sistema.

## 6. El punteo como dato sensible: implicancias de diseño

Como consecuencia directa de la sección 5, el módulo de punteo (ver [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md)) se diseña bajo un estándar de protección más estricto que el resto del sistema:

- Aislamiento estricto por usuario (sección 4), sin excepciones salvo el permiso `punteo.ver_todos`, cuyo otorgamiento debe ser deliberado y acotado.
- Sin cesión a terceros: el sistema no exporta, comparte ni sincroniza datos de punteo con ningún servicio externo (ninguna integración de redes sociales, ningún envío a servicios de marketing).
- Auditoría de **lectura**, no solo de escritura, sobre este módulo específicamente: cada vez que un usuario con `punteo.ver_todos` accede al punteo de otro usuario, ese acceso queda registrado en `HistorialCambio` (ver [`17-auditoria-historial.md`](./17-auditoria-historial.md)) — es el único módulo del sistema donde la simple lectura, no solo la modificación, se audita explícitamente.
- Minimización: solo se solicita al usuario la información estrictamente necesaria para el seguimiento (clasificación, estado, comentario libre) — no se agregan campos estructurados adicionales de perfilado político más allá de lo que el enunciado original define.

## 7. Cifrado y transporte

- **En tránsito**: TLS/HTTPS en toda comunicación, tanto entre el navegador y Vercel como entre Vercel y Supabase (provisto por defecto por ambas plataformas, verificado explícitamente en la configuración de despliegue).
- **En reposo**: cifrado de disco provisto por defecto por la infraestructura de Supabase/PostgreSQL. No se requiere cifrado adicional a nivel de aplicación para los campos actuales del modelo de datos, salvo que la organización decidiera en el futuro almacenar un dato de sensibilidad mayor a la contemplada hoy (en cuyo caso correspondería evaluar cifrado a nivel de columna).
- **Archivos** (padrones en PDF, planillas importadas): almacenados en Supabase Storage con las mismas garantías de cifrado en reposo, con *buckets* de acceso privado (nunca públicos), accedidos únicamente mediante URLs firmadas de corta duración generadas por el servidor.

## 8. Gestión de secretos y credenciales

- Ninguna credencial (claves de Supabase, clave de API de Anthropic) se incluye en el código fuente ni en el repositorio, bajo ninguna circunstancia — se gestionan como variables de entorno en Vercel, separadas por entorno (desarrollo/preview/producción).
- La *service role key* de Supabase (con capacidad de saltear RLS) se usa exclusivamente en procesos de servidor estrictamente necesarios (por ejemplo, la escritura en `HistorialCambio` desde la capa de servicios) y nunca se expone al cliente ni se usa como credencial general de la aplicación.
- Rotación de credenciales ante sospecha de exposición: procedimiento documentado y probado al menos una vez antes de ir a producción (no dejarlo como ejercicio teórico).

## 9. Minimización de datos hacia servicios de IA externos

Dado que varias funcionalidades de [`15-ia.md`](./15-ia.md) envían datos a la API de Anthropic:

- Los procesos de **insights** (sección 6 de `15-ia.md`) envían agregados estadísticos, no listados de personas identificables, salvo que la funcionalidad puntual lo requiera de forma inherente (por ejemplo, la lectura de un PDF de padrón necesariamente procesa datos identificables de cada fila, porque esa es la naturaleza de la tarea).
- El **chatbot** solo accede a datos dentro del alcance de permisos del usuario que pregunta (ver [`15-ia.md`](./15-ia.md#73-el-chatbot-respeta-los-mismos-permisos-que-el-resto-del-sistema)), nunca a la base completa sin ese filtro.
- Se recomienda revisar los términos de tratamiento de datos y retención de la API de Anthropic vigentes al momento de la implementación, como parte del checklist de la sección 13.

## 10. Backups y recuperación ante desastres

- **Backups automáticos** de la base de datos de producción, provistos por Supabase, con retención mínima recomendada de 7 días para *point-in-time recovery*, ajustable según el plan de Supabase contratado.
- Dada la naturaleza políticamente sensible de parte de los datos (padrón activo, punteo), se recomienda **complementar** los backups automáticos de la plataforma con una exportación periódica adicional (por ejemplo, semanal) hacia un almacenamiento controlado directamente por la organización, como salvaguarda independiente ante un eventual problema con el proveedor.
- **Objetivo de punto de recuperación (RPO)** recomendado: no más de 24 horas de datos perdidos ante un desastre. **Objetivo de tiempo de recuperación (RTO)** recomendado: sistema restaurado y operativo en menos de 4 horas.
- El procedimiento de restauración debe probarse al menos una vez antes de la puesta en producción (un backup nunca probado es, en la práctica, un backup no confiable).

## 11. Auditoría

El detalle funcional completo del sistema de auditoría está en [`17-auditoria-historial.md`](./17-auditoria-historial.md). Desde la perspectiva de seguridad, los puntos clave son:

- La tabla `HistorialCambio` es de solo inserción (*append-only*) a nivel de base de datos — ni siquiera el rol Administrador puede editar o borrar una entrada ya escrita desde la aplicación.
- Los eventos de autenticación (login, cambios de contraseña) quedan reflejados vía los logs propios de Supabase Auth, complementarios a `HistorialCambio` (que se enfoca en acciones dentro de la aplicación, no en el detalle de infraestructura de autenticación).

## 12. Recuperación ante errores de aplicación

- Toda operación que modifique múltiples entidades relacionadas (por ejemplo, la fusión de dos Personas, o la activación de un padrón con recálculo masivo de `estado_padron`) se ejecuta dentro de una **transacción de base de datos**: o se completa por entero, o no se aplica ningún cambio parcial.
- Los errores no controlados se capturan y registran con contexto suficiente para depuración (ver [`03-arquitectura.md`](./03-arquitectura.md#13-observabilidad-y-manejo-de-errores)), sin exponer detalles técnicos internos al usuario final.
- Toda importación masiva es reanudable por fila (ver [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md#7-manejo-de-errores-y-filas-parcialmente-inválidas)), de forma que un error a mitad de un archivo grande no obligue a reprocesar todo desde cero.

## 13. Checklist de seguridad previo a producción

Esta lista debe revisarse explícitamente, ítem por ítem, antes de operar el sistema con datos reales de personas (no como sugerencia general, sino como condición de salida de la fase de hardening del [roadmap](./20-roadmap.md)):

- [ ] Políticas de RLS activas y probadas para las entidades de la sección 4, con pruebas automatizadas que confirmen que un usuario sin permiso efectivamente no puede leer datos ajenos.
- [ ] MFA habilitado y exigido para todos los usuarios con rol Administrador.
- [ ] Backups automáticos verificados y procedimiento de restauración probado al menos una vez.
- [ ] Revisión legal puntual del módulo de punteo (sección 6) completada con asesoría profesional.
- [ ] Rotación de credenciales documentada y probada.
- [ ] Ningún secreto presente en el repositorio de código (verificación automatizada, no solo revisión manual).
- [ ] Auditoría de acceso a punteo ajeno (sección 6) funcionando y verificada con un caso de prueba real.
- [ ] Revisión de los términos de tratamiento de datos del proveedor de IA vigentes al momento del despliegue.

---

### Documentos relacionados

- [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) — módulo con el estándar de protección más estricto del sistema
- [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md) — definición de los permisos que las políticas de RLS refuerzan
- [`17-auditoria-historial.md`](./17-auditoria-historial.md) — detalle funcional del sistema de auditoría
- [`15-ia.md`](./15-ia.md) — funcionalidades que interactúan con servicios de IA externos
