# Módulo: Dashboards

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Principios de diseño de los dashboards](#2-principios-de-diseño-de-los-dashboards)
3. [Dashboard administrativo](#3-dashboard-administrativo)
4. [Dashboard personal](#4-dashboard-personal)
5. [Filtros comunes](#5-filtros-comunes)
6. [Rendimiento de los dashboards](#6-rendimiento-de-los-dashboards)
7. [Permisos relevantes](#7-permisos-relevantes)

---

## 1. Objetivo del módulo

Convertir los datos que el resto del sistema acumula en información accionable, sin que la conducción tenga que pedir "el reporte de la semana" a nadie, y sin que un militante tenga que abrir cinco pantallas distintas para saber qué tiene pendiente hoy.

El sistema tiene **dos dashboards con audiencias y objetivos distintos**, no un único dashboard configurable — la mezcla de ambos en una sola pantalla diluye la utilidad de los dos (ver sección 2).

## 2. Principios de diseño de los dashboards

- **No son solo números.** Cada indicador relevante se acompaña, donde tenga sentido, de su tendencia (¿subió o bajó respecto del período anterior?) y de una comparación (¿contra qué se lo compara?). Un número aislado sin contexto temporal no informa una decisión.
- **Cargados de servidor, no calculados en el cliente.** Las agregaciones (conteos, promedios, series temporales) se calculan en consultas de base de datos o en la capa de servicios, nunca trayendo todos los registros crudos al navegador para sumarlos ahí — ver [`03-arquitectura.md`](./03-arquitectura.md#11-rendimiento).
- **Con insights narrados, no solo gráficos.** Además de los gráficos, el sistema muestra una sección de "lo más relevante de este período" generada por IA a partir de los mismos datos agregados (ver [`15-ia.md`](./15-ia.md#6-generación-automática-de-insights)) — una o dos frases en lenguaje natural que resumen lo que el gráfico ya muestra, para quien tiene treinta segundos y no cinco minutos.

## 3. Dashboard administrativo

Visible con permiso `dashboard.ver_administrativo`. Vista agregada de toda la organización.

### 3.1 Indicadores principales (KPIs de cabecera)

| KPI | Cálculo | Tendencia mostrada |
|---|---|---|
| Personas activas totales | Conteo de `Persona` con `estado_ficha = activa` | vs. mes anterior |
| Personas habilitadas en el padrón activo | Conteo de `Persona` con `estado_padron = en_padron_habilitado` | vs. padrón anterior cerrado |
| Actividades realizadas (período) | Conteo de `Actividad` con `estado = finalizada` en el rango de fechas filtrado | vs. período anterior equivalente |
| Tasa de asistencia promedio | Asistieron / Inscriptos, agregado del período | vs. período anterior |
| Personas nuevas cargadas (período) | Conteo de `Persona.fecha_creacion` en el rango | vs. período anterior |
| Cobertura de punteo | % de personas en el padrón activo con al menos un `PunteoPersona` cargado por algún usuario | vs. período anterior |

### 3.2 Gráficos y visualizaciones

- **Evolución temporal de personas cargadas** (línea, por semana/mes según el rango elegido).
- **Participación por tipo de actividad** (barras, usando el color de cada `TipoActividad` para consistencia visual con el resto del sistema — ver [`19-ux-ui.md`](./19-ux-ui.md)).
- **Distribución de personas por carrera y año** (mapa de calor o barras apiladas) — cruza directamente con el catálogo `Carrera` de [`18-configuracion-sistema.md`](./18-configuracion-sistema.md).
- **Ranking de actividades por asistencia** (tabla ordenable, top 10).
- **Ranking de militantes por volumen de punteo activo** (cantidad de personas en seguimiento activo, **no** el contenido de esa clasificación — respeta el principio de privacidad de [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md)).
- **Distribución agregada de clasificación de punteo** (cuántas personas están en cada categoría de clasificación, sumando a través de todos los usuarios, sin identificar qué usuario clasificó a quién de qué forma en esta vista agregada).
- **Comparativa entre padrones** (altas/bajas de personas habilitadas entre el padrón activo y el anterior, ver [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md#8-vista-del-padrón)).

### 3.3 Panel de estado operativo

Sección adicional, más orientada a la gestión del día a día que a la analítica: actividades planificadas para los próximos 7 días, importaciones recientes con errores pendientes de revisión, duplicados detectados sin resolver — es, en esencia, una bandeja de "cosas que requieren atención", alimentada por el mismo motor que las [notificaciones](./13-notificaciones.md) pero presentada de forma agregada.

## 4. Dashboard personal

Visible con permiso `dashboard.ver_personal` (otorgado por defecto a todo rol operativo). Vista centrada exclusivamente en la actividad del usuario que la consulta — nunca muestra datos de otros usuarios, ni siquiera agregados, salvo que ese usuario tenga además `dashboard.ver_administrativo`.

### 4.1 Contenido

| Sección | Contenido |
|---|---|
| Mi punteo | Cantidad de personas en cada `estado_seguimiento` propio, con acceso directo a la lista de "sin iniciar" y "requiere reintento" — las dos categorías más accionables |
| Mis actividades | Actividades de las que el usuario es responsable, próximas primero, con estado de inscripción/cupo de un vistazo |
| Mis pendientes | Combinación de notificaciones accionables dirigidas al usuario (ver [`13-notificaciones.md`](./13-notificaciones.md)) |
| Mi historial reciente | Últimas acciones propias relevantes (altas, ediciones), como registro personal de "qué hice esta semana" |

Este dashboard es, junto con la vista de punteo, la pantalla que un militante debería poder abrir desde el celular y entender en menos de diez segundos qué tiene para hacer hoy.

## 5. Filtros comunes

Ambos dashboards comparten un selector de rango de fechas (con atajos: "esta semana", "este mes", "este cuatrimestre", "todo"), y el dashboard administrativo suma filtro por carrera y por tipo de actividad, para poder responder preguntas como "¿cómo viene la participación de Enfermería este cuatrimestre?" sin salir del dashboard.

## 6. Rendimiento de los dashboards

Dado que agregan datos de toda la organización, las consultas del dashboard administrativo deben diseñarse contemplando el volumen esperado a varios años (ver supuesto S4 en [`01-vision-alcance.md`](./01-vision-alcance.md)):

- Las agregaciones pesadas (series temporales largas, rankings) son candidatas a cachearse por un período corto (minutos, no horas, para no mostrar datos desactualizados) en lugar de recalcularse en cada carga de pantalla.
- Ningún widget del dashboard debe requerir traer registros individuales al cliente para calcular un agregado — todo agregado se resuelve en la consulta a base de datos.

## 7. Permisos relevantes

| Permiso | Habilita |
|---|---|
| `dashboard.ver_personal` | Ver el dashboard personal propio |
| `dashboard.ver_administrativo` | Ver el dashboard administrativo agregado |

---

### Documentos relacionados

- [`15-ia.md`](./15-ia.md) — generación automática de insights narrados
- [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) — límites de privacidad que rigen las vistas agregadas de punteo
- [`13-notificaciones.md`](./13-notificaciones.md) — origen de los pendientes mostrados en el dashboard personal
