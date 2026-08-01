# Notas — Fase 2 (Actividades y Participaciones), sesión overnight

Rama: `fase-2-actividades`, creada desde `origin/main`. No se tocó `main`, no se abrió PR, no se corrió ninguna migración ni comando de Prisma contra una base real (no se usaron las credenciales presentes en `.env.local`, que están gitignoreadas — `npm run build`/`lint`/`tsc` se corrieron con variables de entorno dummy pasadas inline).

## Qué se construyó

### Catálogo y datos
- `prisma/seed.ts`: se agregó el catálogo `TipoActividad` (Repaso, Grupo de estudio, Simulacro, Congreso, Capacitación, Charla, Jornada — con color de referencia), mismo patrón `upsert` que `Carrera`. **No se corrió el seed contra la base real** — falta ejecutar `npm run prisma:seed` con credenciales reales antes de que el catálogo exista en producción. El schema de `Actividad`/`Participacion`/`TipoActividad` ya estaba migrado según el enunciado, así que no hizo falta ninguna migración nueva.

### Capa de servicios (`lib/servicios/`)
- `actividades.service.ts`: `listarActividades` (paginado server-side), `listarActividadesEnRango` (para el calendario), `obtenerActividad`, `crearActividad`, `actualizarActividad` (edición inline campo a campo, con `HistorialCambio` por campo), `cambiarEstadoActividad` (valida transiciones del ciclo de vida de la sección 3 de `06-modulo-actividades.md`), `cancelarActividad`, y `obtenerTasaAsistenciaPromedioPorTipo`. Incluye `generariaCiclo()` para prevenir que una actividad padre cree un ciclo en la jerarquía (regla explícita de la sección 8 del doc 06).
- `participaciones.service.ts`: `inscribirPersona` (aplica RN-4 — reactiva en vez de duplicar), `inscribirMasivo` (con el flujo de confirmación de sobrecupo de la sección 6 de `07-modulo-participaciones.md`), `cambiarEstadoParticipacion` (valida transiciones de la sección 5, completa `fechaAsistencia` automáticamente al marcar `asistio`), `cancelarParticipacion`, `buscarPersonasParaInscribir`, `listarParticipacionesDeActividad`, `listarParticipacionesDePersona`.
- Ambos servicios registran en `HistorialCambio` vía `auditoria.service.ts` existente, mismo patrón que `personas.service.ts`.

### Validaciones (`lib/validaciones/`)
- `actividad.validation.ts`: esquema base sin reglas cruzadas (soporta `.partial()` para edición inline) + esquema completo con `superRefine` para el alta (lugar condicional a modalidad, fechaFin ≥ fechaInicio).
- `participacion.validation.ts`: esquemas para cambio de estado e inscripción individual/masiva.

### UI
- `components/ui/Textarea.tsx`: no existía en el design system de Fase 1; se agregó siguiendo el mismo patrón que `Input.tsx` (label/error/ayuda, mismos tokens de color).
- `components/actividades/CalendarioMensual.tsx`: calendario mensual real (grid lunes-domingo, navegación mes anterior/siguiente, chips de actividad coloreados por `TipoActividad.color`, enlaza a la actividad).
- `components/actividades/CampoEditableActividad.tsx`: mismo patrón que `CampoEditable.tsx` de Personas, extendido con tipos `textarea` y `datetime-local`.
- `components/actividades/ParticipacionesPanel.tsx`: buscador de personas para agregar a la actividad, tabla de inscriptos con cambio de estado y cancelación, indicador de excedente de cupo (lista de espera visual, no un estado nuevo — sección 3.3 del doc 07).
- `components/actividades/ModoAsistencia.tsx`: pantalla mobile-first de carga rápida de asistencia — un botón grande por persona que alterna asistió/ausente sin pasos intermedios, búsqueda local instantánea por nombre/DNI (sección 4 del doc 07).
- `components/personas/TablaPersonasSeleccionable.tsx`: reemplaza la tabla estática de `/personas` cuando el usuario tiene `participaciones.gestionar_masivo` — selección múltiple + modal "Inscribir a actividad..." que usa `inscribirMasivoAction`, con el flujo de confirmación explícita cuando el cupo no alcanza.
- Se reutilizó `PersonaTabs.tsx` tal cual (es genérico pese al nombre) para las pestañas de la ficha de Actividad, en vez de crear un componente nuevo — cumple la instrucción de "usar los componentes existentes tal cual".

### Rutas (`app/(app)/actividades/`)
- `page.tsx`: listado con vista de calendario (default) y vista de lista intercambiables (`?vista=lista|calendario`), filtros por tipo/estado/modalidad/responsable/texto, paginado server-side en la vista de lista.
- `nueva/page.tsx` + `FormularioActividad.tsx`: alta con todos los campos de la sección 4.1 del doc 06, incluida selección de actividad padre.
- `[id]/page.tsx`: ficha con pestañas Datos generales (edición inline), Inscriptos (`ParticipacionesPanel`), Sub-actividades (solo si la actividad es padre — resumen de asistencia por sub-actividad, sección 6 del doc 06), Estadísticas (tasa de asistencia propia vs. promedio de actividades finalizadas del mismo tipo) e Historial. Botones de cambio de estado (planificada → en curso → finalizada) y "Cancelar actividad" respetando el ciclo de vida.
- `[id]/asistencia/page.tsx`: modo asistencia dedicado.
- `actions.ts` / `participaciones.actions.ts`: Server Actions, cada una empieza con `requerirPermiso` antes de cualquier lógica, según la convención de `/CLAUDE.md` sección 4.

### Integraciones con Fase 1
- `app/(app)/layout.tsx`: se agregó el link "Actividades" con `<MdEvent size={18} />` instanciado como JSX en el Server Component antes de pasarlo a `Sidebar`/`BottomNav` (siguiendo al pie de la letra la advertencia del enunciado sobre el bug de serialización RSC con íconos).
- `app/(app)/personas/[id]/page.tsx`: la pestaña "Actividades" (antes un placeholder "disponible desde Fase 2") ahora lista las participaciones reales de la persona.
- `app/(app)/personas/page.tsx`: listado de Personas ahora soporta selección múltiple e inscripción masiva a actividad cuando el usuario tiene el permiso correspondiente (antes no existía ningún flujo de inscripción masiva en el código).

## Permisos usados (ya sembrados, no se tocó el seed de permisos)
`actividades.ver/crear/editar/eliminar/gestionar_todas`, `participaciones.gestionar/gestionar_masivo`. Un usuario sin `actividades.gestionar_todas` solo puede editar/cambiar estado/cancelar actividades de las que es responsable (`requerirGestionActividad` en `actions.ts`).

## Decisiones de producto / ambigüedades encontradas y cómo se resolvieron

1. **Notificaciones automáticas** (cambio de fecha con inscriptos confirmados, cancelación de actividad, sugerencia a la lista de espera al liberarse un cupo — todas mencionadas en los docs 06 y 07): el módulo de Notificaciones (`13-notificaciones.md`) todavía no está implementado en el código (es una fase posterior del roadmap, no incluida en Fase 2). **No se implementó ningún envío**; queda pendiente explícito para cuando exista `notificaciones.service.ts`. No lo interpreté como algo a resolver ahora porque hacerlo hubiera significado construir parte de un módulo fuera de alcance sin la infraestructura documentada.
2. **Reinscripción (RN-4)**: la documentación no especifica qué pasa con `fechaInscripcion` y `fechaAsistencia` al reactivar una `Participacion` cancelada. Decisión tomada: se actualiza `fechaInscripcion` a la fecha de reactivación y se limpia `fechaAsistencia` (vuelve a `null`), tratando la reinscripción como un nuevo ciclo de participación. Si esto no es lo esperado, es un cambio de una línea en `inscribirPersona()`.
3. **"Pasaporte" de asistencia acumulada** (ejemplo de la sección 5 del doc 06, "3 de 5 talleres completados"): se construyó el requisito explícito de la sección 6 (listado de sub-actividades con su propio resumen de asistencia dentro de la ficha del evento padre), pero **no** una pantalla dedicada de progreso por persona a través de un evento — la doc lo presenta como un ejemplo de lo que el modelo habilita, no como una pantalla obligatoria de esta fase. Queda como candidato natural para una iteración chica sobre lo ya construido (los datos ya están disponibles).
4. **Vista de calendario por defecto**: se implementó un calendario mensual real (grid), no una vista de agenda simplificada, porque la sección 7 del doc 06 lo pide explícitamente como default.
5. **Precedente de acceso directo a Prisma desde `app/`**: `/CLAUDE.md` sección 3 dice "nada en `app/` llama a Prisma directamente", pero el código ya existente de Fase 1 (`personas/page.tsx`, `personas/[id]/page.tsx`) hace `prisma.carrera.findMany(...)` directo para catálogos de solo lectura. Mantuve la misma práctica para `TipoActividad` y listados de `Usuario` activos en las páginas nuevas, por consistencia con el patrón ya establecido en el repo — no es una decisión nueva, es continuar la inconsistencia ya presente. Si se quiere corregir, conviene hacerlo de forma unificada en ambos módulos a la vez (mover esas lecturas a servicios), no solo en el nuevo.
6. **`actividades.eliminar` no está acoplado al filtro de "solo mis actividades"**: la acción de cancelar (`cancelarActividadAction`) solo valida el permiso `actividades.eliminar`, no la propiedad de la actividad (a diferencia de editar/cambiar estado, que sí pasan por `requerirGestionActividad`). Con la matriz de permisos sembrada actual esto no abre ningún hueco real, porque todos los roles con `actividades.eliminar` (Administrador, Coordinador) también tienen `actividades.gestionar_todas`. Si en el futuro se crea un rol con `eliminar` pero sin `gestionar_todas`, ese rol podría cancelar actividades ajenas — señalado para revisar si aparece esa combinación.
7. **Selector de "actividad padre"** (alta y edición inline): lista todas las actividades sin filtrar del lado del cliente las que ya son descendientes de la actividad que se está editando (lo que evitaría mostrar una opción que el servidor va a rechazar). La prevención real de ciclos ocurre en el servidor (`ActividadCicloError`) y el error se muestra inline si el usuario elige una opción inválida. Se dejó así para no agregar otra consulta recursiva en cada carga de la página de edición; es una mejora de UX pendiente, no un problema de integridad de datos.

## Qué quedó sin probar contra datos reales

Ningún flujo se probó contra Supabase real (no hay acceso a credenciales de producción en este entorno). Recomendación de smoke test manual antes de mergear, en este orden:
1. Correr `npm run prisma:seed` para cargar `TipoActividad` (y confirmar que no rompe nada existente — usa `upsert`, debería ser seguro).
2. Alta de una actividad simple, y de una actividad padre con 2-3 sub-actividades (caso EFS del criterio de aceptación de la Fase 2).
3. Edición inline de cada campo de una actividad, incluida la reasignación de actividad padre (probar también el caso que debería fallar por ciclo).
4. Ciclo de vida completo: planificada → en curso → finalizada, y por separado planificada → cancelada.
5. Inscripción individual desde la ficha de la actividad (buscador), reactivación de una participación cancelada (RN-4).
6. Modo asistencia desde un celular real: marcar asistencia de 20+ personas y medir el tiempo (criterio de aceptación de la Fase 2: menos de 5 minutos).
7. Inscripción masiva desde `/personas` con y sin superar el cupo, confirmando el flujo de "cupo no alcanza".
8. Permisos: probar con un usuario Militante (sin `actividades.gestionar_todas`) que no pueda editar/cancelar una actividad de la que no es responsable.

## Build y lint

- `npm run lint` — sin errores ni warnings.
- `npm run build` — compila y tipa correctamente (Next 16 + TypeScript estricto), generando todas las rutas nuevas (`/actividades`, `/actividades/nueva`, `/actividades/[id]`, `/actividades/[id]/asistencia`).
- `npx tsc --noEmit` sobre todo el repo (incluye `prisma/seed.ts` y `scripts/`) — sin errores.
- Ambos se corrieron con variables de entorno dummy (`DATABASE_URL`/`DIRECT_URL` apuntando a `localhost` inexistente, claves de Supabase dummy), nunca contra la base real.

## Cambios de schema

Ninguno. El schema de `Actividad`, `Participacion` y `TipoActividad` ya estaba migrado en la base real según el enunciado de la tarea, y no se identificó ninguna necesidad de campo o modelo adicional durante la implementación.
