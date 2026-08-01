# Módulo: Notificaciones

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Tipos de notificación](#2-tipos-de-notificación)
3. [Catálogo de disparadores (triggers)](#3-catálogo-de-disparadores-triggers)
4. [Canales](#4-canales)
5. [Preferencias por usuario](#5-preferencias-por-usuario)
6. [Interfaz](#6-interfaz)
7. [Reglas de negocio del módulo](#7-reglas-de-negocio-del-módulo)
8. [Permisos relevantes](#8-permisos-relevantes)

---

## 1. Objetivo del módulo

Que el sistema **le avise proactivamente al usuario correcto lo que necesita saber**, en lugar de depender de que cada usuario recuerde revisar manualmente cada pantalla. El enunciado original pide explícitamente un sistema "inteligente" que "sugiera información útil automáticamente" — este módulo es tanto un sistema de avisos reactivos (algo pasó) como de sugerencias proactivas (algo necesita tu atención aunque nada "haya pasado" en sentido estricto).

## 2. Tipos de notificación

| Tipo | Ejemplo | Comportamiento |
|---|---|---|
| **Informativa** | "Se activó un nuevo padrón electoral" | Solo informa, no requiere acción, se puede descartar sin más |
| **Accionable** | "Tenés 12 personas en tu punteo sin contactar hace más de 30 días" | Incluye un enlace directo a la acción sugerida (en este caso, el listado filtrado correspondiente) |
| **Alerta** | "La importación #482 finalizó con 15 errores" | Requiere atención más urgente, se destaca visualmente distinto de las informativas |

## 3. Catálogo de disparadores (triggers)

| Disparador | Tipo | Destinatario |
|---|---|---|
| Persona en `PunteoPersona` propio con `estado_seguimiento` sin actualizar hace más de N días (configurable, ver [`18-configuracion-sistema.md`](./18-configuracion-sistema.md)) | Accionable | El usuario dueño de ese punteo |
| Actividad de la que soy responsable a menos de 48hs de empezar, con cupo sin completar | Accionable | El responsable de la actividad |
| Actividad reprogramada o cancelada | Informativa | Todos los inscriptos con `Participacion.estado` activo |
| Se liberó un cupo en una actividad con lista de espera | Accionable | La siguiente persona en la lista de espera (a través de su responsable, dado que las Personas no reciben notificaciones directas — ver nota abajo) |
| Importación finalizada, con o sin errores | Informativa / Alerta según corresponda | El usuario que ejecutó la importación |
| Duplicado de alta confianza detectado, pendiente de revisión | Accionable | Usuarios con permiso `personas.fusionar_duplicados` |
| Padrón nuevo activado | Informativa | Todos los usuarios activos |
| Cambio de rol o permisos propios | Informativa | El usuario afectado |

> **Nota**: las `Persona` (estudiantes) no son destinatarias de notificaciones del sistema — no tienen cuenta ni acceso (ver [`01-vision-alcance.md`](./01-vision-alcance.md#7-usuarios-objetivo)). Cualquier disparador que involucre a una Persona (por ejemplo, aviso de actividad cancelada) notifica al `Usuario` responsable, quien es finalmente responsable de la comunicación externa a esa persona por los canales propios de la organización (fuera del alcance del sistema).

## 4. Canales

- **Campana en la interfaz** (in-app), canal principal y obligatorio para todo tipo de notificación.
- **Resumen por email**, opcional, configurable por usuario (sección 5): un digest periódico (diario o semanal, a elección) en lugar de un email por cada evento individual, para no generar fatiga de notificaciones.

No se contempla, en el alcance actual, notificación push a dispositivo móvil (requeriría una app nativa, explícitamente fuera de alcance según [`01-vision-alcance.md`](./01-vision-alcance.md#6-fuera-de-alcance-v1)) ni integración con WhatsApp.

## 5. Preferencias por usuario

Cada usuario puede, desde su perfil, activar o desactivar el resumen por email y elegir su frecuencia. Las notificaciones in-app no se pueden desactivar por completo (son la garantía mínima de que la información llega), aunque sí se pueden marcar como leídas masivamente.

## 6. Interfaz

- Ícono de campana con contador de no leídas, siempre visible en la barra superior.
- Panel desplegable con las notificaciones más recientes, agrupadas por fecha, con acción rápida de "marcar todas como leídas".
- Vista de historial completo de notificaciones (no solo las recientes), útil para reconstruir "qué pasó esta semana" si el usuario estuvo desconectado unos días.

## 7. Reglas de negocio del módulo

- Una notificación no se genera dos veces para el mismo evento y el mismo destinatario (idempotencia del disparador — por ejemplo, el aviso de "punteo sin actualizar" se genera una vez por persona por período de recordatorio configurado, no en cada visita del usuario al sistema).
- Las notificaciones no se eliminan automáticamente; se archivan (dejan de contar como "no leídas") pero quedan disponibles en el historial, coherente con el principio de cero pérdida de datos.

## 8. Permisos relevantes

| Permiso | Habilita |
|---|---|
| `notificaciones.gestionar_reglas` | Configurar umbrales de los disparadores (ej. "cuántos días sin actividad de punteo antes de avisar") — la recepción de notificaciones en sí no requiere permiso adicional, es inherente a cada rol operativo |

---

### Documentos relacionados

- [`11-dashboards.md`](./11-dashboards.md) — el dashboard personal muestra un resumen de pendientes que se origina en este módulo
- [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) — origen del disparador de punteo sin actualizar
- [`18-configuracion-sistema.md`](./18-configuracion-sistema.md) — configuración de umbrales de los disparadores
