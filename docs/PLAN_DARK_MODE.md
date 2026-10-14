# Plan: modo oscuro / modo claro (apps/web)

Documento para el desarrollador frontend. Léelo completo, **analiza el código y valida los
supuestos** antes de empezar: las cifras salen de contar colores y estilos con `grep`, nadie ha
revisado cada pantalla renderizada. Si algo de aquí no coincide con lo que ves, manda lo que ves
y deja una nota en el PR.

## 1. Objetivo

Que el usuario pueda elegir **Claro**, **Oscuro** o **Automático** (sigue al sistema), que la
elección se recuerde, y que ninguna pantalla del panel quede ilegible o con "parches" blancos.

Fuera de alcance (ver sección 8): landing pública, login/registro, chat widget público y la
imagen Open Graph. Se deciden al final.

## 2. Punto de partida (lo que ya hay)

- Todo el estilo vive en `apps/web/app/globals.css` (~1615 líneas) y `apps/web/app/c/[slug]/chat.css` (98 líneas, solo el widget público).
- `:root` ya define variables: `--bg --surface --text --muted --line --brand --brand-dark --brand-light --brand-soft --accent --accent-dark --success --success-soft --warning --warning-soft --danger --danger-soft --shadow --radius`. Se usan unas 600 veces con `var(--…)`.
- **No existe soporte de tema**: ni `prefers-color-scheme`, ni `data-theme`, ni `color-scheme`, ni `next-themes`.
- El problema real son los colores que **no** pasan por variables:
  - `globals.css`: 163 colores hex distintos; solo ~18 están en `:root`. Ejemplos: `background: white` / `#fff` (67 usos), `#fff0f1` (error), `#fff8e9` (aviso), `#fff6f7` (error de instancia), `#fbfcfe` (hover), `#cbd3df` (borde hover), `rgba(255,255,255,.88)` (topbar).
  - `.tsx`: 229 `style={{…}}` y ~78 colores directos. Concentrados en `app/conversations/page.tsx` (13), `app/login/page.tsx` (6), `app/dashboard/page.tsx` (5), `app/register/page.tsx`, `app/instances/page.tsx`, `components/app-shell.tsx`.
- El sidebar es azul de marca fijo (`#213786`, texto blanco). **Se queda igual en ambos temas** (decisión propuesta; confírmala con diseño).

## 3. Decisiones técnicas (propuestas)

1. **Mecanismo:** atributo `data-theme="light|dark"` en `<html>`, con las variables redefinidas en `:root[data-theme="dark"]`. No uses clases por componente ni dupliques reglas.
2. **Preferencia:** `localStorage` con tres valores `light | dark | system` (clave sugerida `brainwsp_theme`, sigue el estilo de `brainwsp_sidebar_collapsed`). Envuelve lecturas y escrituras en `try/catch`: puede lanzar en modo privado.
   - `system` resuelve con `matchMedia('(prefers-color-scheme: dark)')` y escucha cambios.
3. **Sin destello blanco al cargar:** un `<script>` inline mínimo en el `<head>` de `app/layout.tsx` que lee la preferencia y pone `data-theme` **antes de pintar**. Añade `suppressHydrationWarning` a `<html>` (el atributo difiere entre servidor y cliente).
4. **`color-scheme`:** declara `color-scheme: light` / `dark` en cada tema para que scrollbars, `<input>`, `<select>` y autocompletado nativos sigan el tema.
5. **Dónde va el interruptor:** en el menú del usuario / topbar de `components/app-shell.tsx` (el sidebar y el topbar viven ahí). Tres opciones: Claro, Oscuro, Automático. Más adelante, un selector también en `admin-shell.tsx`.
6. **Librería:** no hace falta `next-themes`; son ~40 líneas. Si prefieres usarla, justifícalo en el PR.
7. **Next.js:** `apps/web/AGENTS.md` advierte que esta versión de Next tiene cambios incompatibles con lo que se conoce. **Lee la guía relevante en `node_modules/next/dist/docs/` antes de tocar `layout.tsx`.**

## 4. Fases

### Fase 0: inventario (medio día)
- Genera una tabla con **todos** los colores literales de `globals.css` y de los `.tsx`, agrupados por uso (fondo de superficie, borde, texto, estado error/aviso/éxito, hover, sombra).
- Recorre cada ruta de `app/**/page.tsx` en claro y anota qué zonas llevan estilos propios.
- Entregable: lista de variables nuevas necesarias (siguiente fase). Compártela antes de seguir.

### Fase 1: infraestructura (medio día)
- Script anti-destello + `data-theme` + `color-scheme` + lectura/escritura de preferencia + escucha de `prefers-color-scheme`.
- Componente `ThemeToggle` (3 opciones) en `app-shell.tsx`.
- **Criterio de aceptación:** cambiar de tema no recarga, la elección persiste tras recargar, y en "Automático" cambia al cambiar el sistema operativo.

### Fase 2: tokens en `globals.css` (1 a 2 días)
- Convertir los colores literales en variables, **sin cambiar el aspecto claro**. Debe quedar píxel por píxel igual; compáralo antes y después.
- Variables nuevas sugeridas (ajusta nombres según el inventario): `--surface-2` (hover/zonas secundarias), `--line-strong` (borde hover), `--text-strong`, `--overlay` (fondo de modales), `--topbar-bg`, `--input-bg`, y pares `--danger-bg / --danger-border / --danger-text`, `--warning-…`, `--success-…`, `--info-…` para las cajas de estado.
- Luego definir `:root[data-theme="dark"]` con la paleta oscura. Reglas:
  - Fondos oscuros **no negros puros** (p. ej. `#0f1420` / `#161c2b`), texto principal gris muy claro, no `#fff`.
  - Los colores de estado en oscuro se **reajustan** (no se invierten): fondo pastel → fondo oscuro tintado, texto más claro. Comprueba contraste **≥ 4.5:1** en texto normal.
  - `--brand` (`#213786`) tiene poco contraste sobre fondo oscuro: define un `--brand-text` / `--link` más claro para enlaces y textos de marca, y deja el azul original para fondos de botón.
  - Las sombras `rgba(20,42,80,.08)` casi no se ven en oscuro: reduce la sombra y refuerza el borde.

### Fase 3: `.tsx` con colores en línea (1 día)
- Reemplazar cada `#hex`/`rgba()` dentro de `style={{…}}` por `var(--…)` o por una clase de `globals.css`.
- Prioridad: `conversations/page.tsx`, `dashboard`, `instances`, `app-shell`, `team`, `my-plan`, `admin/*`.
- Regla desde ya: **ningún color nuevo en literal**, ni en CSS ni en `style`.

### Fase 4: zonas especiales (1 día)
Revisar a mano, una por una:
- **Chat** (`conversations`): burbujas entrantes/salientes, citas, reacciones, tarjetas de documento (`.doc-card`), vista previa de imagen/video, selector de emojis, popover de menciones `@`, separadores y fondo del área de mensajes.
- **Código QR (`QRCodeSVG` en `instances/page.tsx`): debe seguir siendo negro sobre blanco**, con un margen blanco, sea cual sea el tema. Un QR oscuro sobre fondo oscuro **no se puede escanear**.
- **Editor de automatizaciones** (`automations/[id]`, `@xyflow/react`): fondo del lienzo, nodos, aristas, minimapa, controles. Esta librería trae sus propios estilos y modo de color; revisa su opción `colorMode`.
- **CRM:** pipelines con `@dnd-kit` (tarjetas arrastrables, columnas, sombras al arrastrar), prospectos y tratos.
- **Calendario**, **Dashboard** (tarjetas y gráficos: ojo con colores de series), tablas de `admin/*`.
- **Modales y overlays** (`.modal`, `.qr-backdrop`, `.confirm`), **toast de WhatsApp desconectado** (`.wa-down-toast`, rojo pastel fijo hoy) y banner de suplantación (`.impersonation-banner`).
- **Imágenes y avatares:** logos con fondo transparente o blanco pueden verse mal; revisa `components/brand-mark.tsx`.

### Fase 5: pasada visual y accesibilidad (medio día o más)
- Recorrer **todas** las rutas en ambos temas y en móvil (≤ 640 px, hay drawer lateral).
- Contraste con las DevTools (Lighthouse / "Accessibility").
- Verificar foco visible de teclado y estados `:hover`, `:disabled`, `:focus-visible` en oscuro.

## 5. Archivos que se tocan

- `apps/web/app/layout.tsx` (script anti-destello, `suppressHydrationWarning`)
- `apps/web/app/globals.css` (variables, tema oscuro, reemplazo de literales)
- `apps/web/components/app-shell.tsx` y `admin-shell.tsx` (interruptor)
- Nuevo: `apps/web/components/theme-toggle.tsx` (y, si te conviene, `lib/theme.ts`)
- Todos los `.tsx` con colores en línea (Fase 3)
- `apps/web/app/c/[slug]/chat.css` solo si se decide incluir el widget

## 6. Cómo trabajar y entregar

- **Un PR por fase**, en orden. La Fase 2 no debe cambiar nada visible en modo claro: es la que más riesgo tiene, así que va sola y con capturas antes/después.
- No uses `git add .` a ciegas: revisa `git status` antes de cada commit.
- Antes de cada PR: `npm run build`. Un marcador de conflicto o un error de tipos rompe el deploy (pasó el 2026-10-06).
- Cada PR lleva capturas de las pantallas tocadas, en claro y oscuro.

## 7. Lista de comprobación final

- [ ] Recargar con tema oscuro no muestra un destello blanco.
- [ ] El tema "Automático" sigue al sistema y reacciona a cambios en vivo.
- [ ] El QR de `/instances` se escanea en oscuro.
- [ ] Ningún texto con contraste menor a 4.5:1 en las pantallas principales.
- [ ] Sin superficies blancas "sueltas" ni cajas pastel brillantes en oscuro.
- [ ] El modo claro quedó idéntico al de antes (comparación visual de la Fase 2).
- [ ] `grep -nE "#[0-9a-fA-F]{3,8}"` sobre `.tsx` y fuera de `:root` en `globals.css` devuelve solo excepciones justificadas.

## 8. Alcance y decisiones pendientes (hablar con el responsable)

1. **Pantallas públicas** (landing `/`, `login`, `register`, `terminos`, `privacidad`): ¿se hacen oscuras o se dejan siempre claras? Propuesta: siempre claras en la primera entrega.
2. **Chat widget público** (`/c/[slug]`): lo ve el cliente final, no el agente. Propuesta: fuera de alcance; si se incluye, que respete el tema del sitio donde se incrusta, no el del panel.
3. **Sidebar:** ¿se mantiene azul de marca en oscuro? Propuesta: sí.
4. **Imagen Open Graph** (`app/opengraph-image.tsx`): no cambia.

## 9. Estimación

Unos **3 a 4 días de trabajo** en total para el panel principal. El tiempo real depende de lo que aparezca en el inventario de la Fase 0 y de cuántas pantallas tengan estilos propios. Si hay que recortar, el orden de prioridad es: infraestructura, panel principal (dashboard, conversaciones, instancias, equipo), y por último el editor de automatizaciones, el CRM y las pantallas de administración.
