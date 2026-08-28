# Flota de Transportes — Dashboard (full stack con Supabase)

Dashboard de flota de vehículos de Grupo Partequipos S.A.S., ahora conectado a una
base de datos real en Supabase en vez de datos hardcodeados + localStorage.

## Archivos

- `index.html` — estructura y estilos del dashboard (sin cambios funcionales frente al original).
- `app.js` — toda la lógica: carga los datos desde Supabase al abrir la página y
  guarda cada edición, alta o baja directamente en la base de datos (autoguardado,
  sin botones de "Guardar cambios" ni exportación a JSON).

## Base de datos (Supabase)

Proyecto: `ktqzifbflzwidwcjcovb` (bastiandonado1997-lgtm's Project), región us-west-2.

Tres tablas en el esquema `public`:

- **`vehiculos`** (161 filas migradas) — toda la flota: placa, marca, línea, modelo,
  responsable, ubicación, propietario, pólizas (todo riesgo y SOAT) con vencimientos
  y primas, valor comercial actual y anterior, método de reavalúo, fechas de
  matrícula/tecnomecánica, observaciones y notas.
- **`multas`** (6 filas migradas) — comparendos por placa: número, fecha/hora,
  tipo de infracción, dónde fue, organismo, fecha de notificación, responsable,
  estado y nota.
- **`movimientos`** (3 filas migradas) — reemplazos de vehículos: sede, placa/
  descripción/modelo que sale, placa/descripción/modelo que entra, qué pasó con
  el saliente, estado (Pendiente / En proceso / Realizado) y responsable.

Cada tabla tiene `id uuid` autogenerado como llave primaria y `created_at` /
`updated_at` con trigger automático. Los datos de `DATA` / `DATA_MULTAS` / `DATA_V`
del dashboard original se migraron 1:1 (mismos 161/6/3 registros, mismos valores).

### Seguridad — léelo antes de compartir el link

El dashboard original no tenía ningún tipo de autenticación: cualquiera con el
archivo HTML podía editar todo (los cambios solo vivían en su propio navegador,
vía localStorage). Para no regresionar esa funcionalidad de un día para otro, las
tablas tienen Row Level Security **habilitado** pero con políticas que permiten
lectura y escritura completas a la llave pública (`anon`) — es decir, hoy el
comportamiento es equivalente al original: quien tenga el link y el HTML puede
ver y editar todo, pero ahora los cambios sí quedan guardados centralmente para
todos los que abran el dashboard.

Si vas a publicar este dashboard fuera de un grupo de confianza (por ejemplo en
una URL pública), lo siguiente es agregar autenticación de Supabase (magic link o
login con contraseña) y cambiar las políticas de `insert/update/delete` para que
solo apliquen a usuarios `authenticated` — puedo ayudarte con eso cuando quieras.

## Cómo usarlo

Abre `index.html` en cualquier navegador (doble clic, o súbelo a cualquier
hosting estático: GitHub Pages, Vercel, Netlify, o el hosting estático de
Supabase). No necesita build ni servidor propio — `app.js` se conecta directo a
Supabase vía su API REST con la llave pública (`anon`), que es segura de exponer
en el cliente porque el control de acceso real lo hacen las políticas de RLS.

## Próximos pasos sugeridos

- Autenticación (ver nota de seguridad arriba) si el link va a circular fuera del equipo.
- Alertas automáticas de pólizas por vencer (correo o notificación) usando un
  Supabase Edge Function programado.
- Historial de cambios (tabla de auditoría) si se necesita saber quién editó qué.
