# 19. UX/UI

[← Índice general](./00-README.md)

## Índice

1. [Principios rectores](#1-principios-rectores)
2. [Sistema visual](#2-sistema-visual)
3. [Tipografía](#3-tipografía)
4. [Iconografía](#4-iconografía)
5. [Navegación](#5-navegación)
6. [Estrategia responsive](#6-estrategia-responsive)
7. [Componentes base](#7-componentes-base)
8. [Estados de carga, vacío y error](#8-estados-de-carga-vacío-y-error)
9. [Accesibilidad](#9-accesibilidad)
10. [Modo oscuro](#10-modo-oscuro)
11. [Rendimiento percibido](#11-rendimiento-percibido)
12. [Tono de los textos de interfaz](#12-tono-de-los-textos-de-interfaz)

## 1. Principios rectores

Heredados directamente de los principios de diseño transversales definidos en [`01-vision-alcance.md`](./01-vision-alcance.md#8-principios-de-diseño-rectores), traducidos aquí a decisiones visuales e interactivas concretas:

1. **Rapidez de campo por sobre densidad de escritorio**: las tareas que un militante hace parado en la puerta de la facultad (registrar un contacto, marcar asistencia, actualizar un punteo) deben poder completarse en pocos toques, con inputs grandes y sin scroll excesivo.
2. **Privacidad visible, no solo aplicada**: cuando un dato está restringido (por ejemplo, punteo ajeno), la interfaz lo comunica explícitamente en vez de simplemente omitirlo sin explicación — evita que un usuario piense que el dato "no existe" cuando en realidad no tiene permiso de verlo.
3. **Un sistema serio, no un sistema frío**: la identidad de ATP (color, tipografía) está presente de forma consistente, pero en un registro sobrio apropiado para una herramienta de uso diario, no en el registro de festival que la agrupación usa para piezas de difusión puntuales.

## 2. Sistema visual

Paleta y tipografía ya decididas como parte de la identidad de ATP y adaptadas aquí a una herramienta de uso diario, en el mismo registro minimalista que la agrupación ya usa para su evento anual EFS:

| Token | Valor | Uso |
|---|---|---|
| `color-primario` | `#f969d7` (fucsia) | Acciones principales, elementos activos, marca |
| `color-secundario` | `#2e5699` (azul) | Elementos de apoyo, enlaces, información |
| `color-exito` | `#29A843` (verde) | Confirmaciones, estados positivos |
| `color-alerta` | `#F9C900` (amarillo) | Advertencias, estados pendientes |
| `color-error` | `#E8231A` (rojo) | Errores, acciones destructivas |
| `radio-borde` | `5px` | Border-radius estándar de todos los componentes |

Estos mismos cinco colores son los que ATP usa en su identidad "Festival ATP" para piezas de difusión; aquí se reutilizan exclusivamente como colores **semánticos de estado**, nunca como paleta decorativa múltiple en una misma pantalla — es la traducción directa de la identidad de la agrupación al registro sobrio que un CRM de uso diario requiere.

Los tokens se definen como variables CSS (Tailwind `theme.extend.colors`, ver [`03-arquitectura.md`](./03-arquitectura.md#3-stack-tecnológico)) para permitir ajustes centralizados.

## 3. Tipografía

- Familia tipográfica: **Montserrat**, consistente con el resto de las piezas de comunicación de ATP.
- Escala tipográfica limitada a 6 tamaños (de texto auxiliar a título de página), evitando la proliferación de tamaños ad-hoc.
- Peso `600` (semibold) para títulos y elementos interactivos, `400` (regular) para texto de cuerpo — sin uso de peso `700` o superior, que se reserva para piezas de difusión, no para la interfaz de la herramienta.

## 4. Iconografía

Set de **Material Design Icons**, consistente con el resto de la identidad visual de ATP. Uso consistente: un mismo concepto (por ejemplo, "editar", "eliminar", "más opciones") usa siempre el mismo ícono en todo el sistema, sin variación entre módulos.

## 5. Navegación

- **Barra lateral** (desktop) / **barra inferior** (mobile) con los módulos de mayor uso diario: Personas, Actividades, Punteo, Buscador.
- El resto de los módulos (Dashboards, Padrón, Usuarios, Configuración, Auditoría) viven bajo un menú secundario, priorizando que la navegación principal no se sature para el perfil Militante, que es el más numeroso y el que menos módulos administrativos usa.
- El buscador global (ver [`12-buscador-global.md`](./12-buscador-global.md)) es accesible desde cualquier pantalla mediante un ícono fijo, dado que es la vía de acceso más rápida a un registro puntual durante una tarea de campo.
- Breadcrumbs simples en las vistas de detalle anidadas (por ejemplo, Actividad → Participación → Persona).

## 6. Estrategia responsive

Estrategia dual, explícita por tipo de tarea, en vez de un enfoque responsive genérico único:

- **Mobile-first** para los flujos de campo: alta rápida de Persona, registro de asistencia, actualización de punteo (ver [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md#3-vista-de-trabajo-mobile-first)). Estos flujos se diseñan primero para pantalla chica y se expanden hacia desktop, no al revés.
- **Desktop-first** para los flujos de análisis y administración: dashboards (ver [`11-dashboards.md`](./11-dashboards.md)), configuración de catálogos, matriz de permisos. Estas pantallas asumen una pantalla de escritorio como caso principal y ofrecen una versión mobile funcional pero no optimizada como prioridad.
- Punto de corte único (`768px`, equivalente al breakpoint `md` de Tailwind) entre disposición mobile y desktop en todo el sistema, evitando múltiples breakpoints ad-hoc por pantalla.

## 7. Componentes base

Biblioteca de componentes reutilizables, construida una sola vez y consumida por todos los módulos (ver estructura de carpetas `components/` en [`03-arquitectura.md`](./03-arquitectura.md#4-estructura-de-carpetas)):

- Formulario de campo simple (input, select, fecha) con estado de error inline.
- Tabla con paginación, ordenamiento por columna y selección múltiple, reutilizada en todos los listados (Personas, Actividades, Usuarios, etc.).
- Tarjeta de resumen (usada en dashboards y en la vista de trabajo de punteo).
- Selector de etiquetas con autocompletado y creación inline.
- Línea de tiempo (reutilizada en historial, ver [`17-auditoria-historial.md`](./17-auditoria-historial.md#6-vista-de-línea-de-tiempo-por-entidad)).
- Modal de confirmación para acciones destructivas o irreversibles (baja lógica, fusión, cierre de padrón).

## 8. Estados de carga, vacío y error

Cada vista de listado o detalle contempla explícitamente tres estados además del estado con datos:

- **Cargando**: esqueletos de contenido (*skeleton screens*) en vez de un spinner genérico, para comunicar la forma aproximada del contenido que está por aparecer.
- **Vacío**: mensaje contextual específico por pantalla (no un genérico "no hay datos"), con una acción sugerida cuando aplica (por ejemplo, "Todavía no cargaste ninguna Persona — dar de alta la primera").
- **Error**: mensaje en lenguaje simple, sin jerga técnica ni códigos de error crudos, con una acción de reintento cuando es técnicamente posible.

## 9. Accesibilidad

Objetivo: cumplimiento de **WCAG 2.1 nivel AA** como estándar mínimo, dado que es un sistema de uso interno pero con perfiles de usuario diversos:

- Contraste de color mínimo 4.5:1 para texto de cuerpo, verificado especialmente en el fucsia primario sobre fondos claros y oscuros.
- Navegación completa por teclado en todos los formularios y tablas.
- Etiquetas (`aria-label`) en todo ícono usado como único contenido de un botón interactivo.
- Tamaño mínimo de área táctil de 44×44px en la interfaz mobile, relevante especialmente para los flujos de campo de la sección 6.

## 10. Modo oscuro

Soportado desde v1 como preferencia de usuario (no como detección automática del sistema operativo únicamente, aunque se respeta como valor por defecto inicial), dado el uso frecuente de la interfaz mobile en exteriores y en horarios nocturnos durante actividades de territorio. Los tokens de color de la sección 2 tienen su variante equivalente para modo oscuro, manteniendo el mismo fucsia y azul de marca ajustados en luminosidad para mantener el contraste mínimo de la sección 9.

## 11. Rendimiento percibido

- Las mutaciones simples (marcar asistencia, cambiar una clasificación de punteo) se reflejan en la interfaz de forma optimista (actualización visual inmediata, confirmación en segundo plano), revirtiendo visualmente solo si el servidor responde con un error — crítico para los flujos de campo con conectividad inestable.
- Las listas largas (Personas, Actividades) usan paginación o scroll virtualizado, nunca carga completa sin límite.
- Uso de React Server Components (ver [`03-arquitectura.md`](./03-arquitectura.md#3-stack-tecnológico)) para minimizar el JavaScript enviado al cliente en vistas mayormente de lectura.

## 12. Tono de los textos de interfaz

Convención de copy ya establecida por ATP para sus comunicaciones, aplicada aquí a todos los textos de la interfaz (botones, mensajes, ayudas contextuales):

- Español rioplatense estándar (uso de "vos", no "tú").
- Sin uso de la "x" como marca de género neutro en los textos generados por el sistema (por ejemplo, "el militante" en textos genéricos de interfaz, no "el/la militantx") — esto no restringe cómo un usuario puede nombrar a una Persona en campos de texto libre, que quedan a su propio criterio.
- Sin modismos regionales ajenos al español rioplatense.
- Mensajes de error y ayuda en tono directo y claro, sin lenguaje corporativo ni eufemismos innecesarios.

---

### Documentos relacionados

- [`01-vision-alcance.md`](./01-vision-alcance.md) — principios de diseño rectores de los que este documento deriva
- [`03-arquitectura.md`](./03-arquitectura.md) — stack técnico (Tailwind, React Server Components) que implementa estas decisiones
- [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) — ejemplo de vista mobile-first de campo
- [`11-dashboards.md`](./11-dashboards.md) — ejemplo de vista desktop-first de análisis
