(function () {
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute('data-company');
  if (!slug) return;
  var origin = script.src.replace(/\/widget\.js.*$/, '');
  var position = script.getAttribute('data-position') === 'left' ? 'left' : 'right';
  // La posición confirmada por el servidor en la carga anterior (ver "clienera:ready" más
  // abajo) pesa más que la adivinanza del atributo data-position: si el <script> pegado en la
  // web del cliente quedó desactualizado (p.ej. se cambió la posición en el panel después de
  // copiarlo), esto evita repetir el salto derecha->izquierda en cada F5 una vez que ya se
  // confirmó una vez en este navegador.
  var positionStorageKey = 'clienera_chat_position_' + slug;
  try {
    var cachedPosition = localStorage.getItem(positionStorageKey);
    if (cachedPosition === 'left' || cachedPosition === 'right') position = cachedPosition;
  } catch (e) {}
  // Dominio + ruta de la página donde vive este script (ej. el ERP de un cliente,
  // "gastromaq.erp.brainpos.pe/venta/orden/37") — se la pasamos a /c/[slug] para que la
  // guarde en el contacto y soporte sepa de qué cliente se trata sin preguntar. Sin query
  // string ni hash: podrían traer tokens de sesión del sitio anfitrión.
  var pageUrl = '';
  try { pageUrl = window.location.origin + window.location.pathname; } catch (e) {}

  // Clave de localStorage para "minimizado" — por slug de empresa (no por widgetPublicKey,
  // que recién se conoce tras el bootstrap) y por navegador: pensado para cuando este script
  // vive embebido dentro de OTRO software (ver AGENTS.md) y el usuario de ese software no
  // siempre quiere ver la burbuja flotando encima de su propia UI.
  var minimizedStorageKey = 'clienera_chat_minimized_' + slug;
  var minimized = false;
  try { minimized = localStorage.getItem(minimizedStorageKey) === '1'; } catch (e) {}

  var CHAT_ICON = '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var CLOSE_ICON = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var MINUS_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/></svg>';
  var CHEVRON_ICON = function (dir) {
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
      (dir === 'right' ? '<polyline points="9 6 15 12 9 18"/>' : '<polyline points="15 6 9 12 15 18"/>') + '</svg>';
  };

  var side = position === 'left' ? 'left:20px;' : 'right:20px;';
  var minimizeAllowed = true; // confirmado por el bootstrap (allowMinimize); ver clienera:ready

  // Mismo problema que la posición (ver positionStorageKey arriba): color e ícono reales
  // llegan recién con "clienera:ready", después de dos round-trips HTTP (bootstrap + sesión).
  // Sin esto el botón arranca azul genérico con el ícono de chat de siempre y recién
  // después salta al color/mascota configurados — se cachea lo último confirmado para que,
  // ya en la segunda visita de este navegador, el primer pintado sea el correcto.
  var colorStorageKey = 'clienera_chat_color_' + slug;
  var color = '#6b8afd';
  try {
    var cachedColor = localStorage.getItem(colorStorageKey);
    if (cachedColor && /^#[0-9a-f]{6}$/i.test(cachedColor)) color = cachedColor;
  } catch (e) {}
  var iconStorageKey = 'clienera_chat_icon_' + slug;
  var iconUrl = null; // URL del ícono/mascota propia, si la empresa subió una (ver clienera:ready)
  try { iconUrl = localStorage.getItem(iconStorageKey) || null; } catch (e) {}

  // Pantalla chica (celular en cualquier orientación, el "lado corto" del viewport) — el
  // panel flotante de 368x540 no entra ahí sin dejar franjas de la página anfitriona a la
  // vista (ver AGENTS.md: así se veía roto en gastromaq.erp.brainpos.pe). En vez de eso el
  // panel pasa a ocupar toda la pantalla mientras está abierto, como cualquier chat nativo
  // de celular. Tablet/laptop/desktop siguen con la tarjeta flotante de siempre.
  function computeMobile() { return Math.min(window.innerWidth, window.innerHeight) <= 640; }
  var mobile = computeMobile();

  // Mismo degradé + sombra de color que el header del panel (ver chat.css `shade()`),
  // reimplementado acá porque widget.js es un script estático, sin acceso a ese módulo.
  function shade(hex, amount) {
    var num = parseInt(hex.replace('#', ''), 16);
    var clamp = function (c) { return Math.max(0, Math.min(255, c)); };
    var r = clamp(((num >> 16) & 255) + amount);
    var g = clamp(((num >> 8) & 255) + amount);
    var b = clamp((num & 255) + amount);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function hexToRgb(hex) {
    var num = parseInt(hex.replace('#', ''), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  function paintLauncher(color) {
    var rgb = hexToRgb(color);
    var glow = 'rgba(' + rgb.join(',') + ',.45)';
    launcher.style.background = 'linear-gradient(145deg, ' + shade(color, 18) + ', ' + shade(color, -26) + ')';
    launcher.style.boxShadow = '0 10px 26px -6px ' + glow + ', 0 2px 6px rgba(0,0,0,.18), inset 0 1px 1px rgba(255,255,255,.35)';
  }

  var launcher = document.createElement('button');
  launcher.setAttribute('aria-label', 'Abrir chat');
  launcher.style.cssText =
    'position:fixed;bottom:22px;' + side +
    'z-index:2147483000;width:58px;height:58px;border-radius:50%;' +
    'border:1.5px solid rgba(255,255,255,.3);color:#fff;cursor:pointer;display:' + (minimized ? 'none' : 'flex') + ';align-items:center;justify-content:center;' +
    'transform:scale(0);opacity:0;' +
    'transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .18s ease,background .25s ease;';
  paintLauncher(color);
  renderLauncherFace();
  if (!minimized) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { launcher.style.transform = 'scale(1)'; launcher.style.opacity = '1'; });
    });
  }
  launcher.onmouseenter = function () { launcher.style.transform = 'scale(1.07)'; };
  launcher.onmouseleave = function () { launcher.style.transform = 'scale(1)'; };
  launcher.onmousedown = function () { launcher.style.transform = 'scale(0.94)'; };
  launcher.onmouseup = function () { launcher.style.transform = 'scale(1.07)'; };

  // Pintado de la cara del botón: ícono propio de la empresa si subió uno (ver clienera:ready
  // más abajo), si no el ícono de chat genérico — en ambos casos reemplazado por la X mientras
  // el panel está abierto.
  function renderLauncherFace() {
    if (open) { launcher.innerHTML = CLOSE_ICON; return; }
    if (iconUrl) {
      launcher.innerHTML = '<img src="' + iconUrl + '" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;pointer-events:none;" />';
      return;
    }
    launcher.innerHTML = CHAT_ICON;
  }

  // Botón pequeño para minimizar la burbuja por completo (no solo cerrar el panel de chat) —
  // pensado para cuando este widget está embebido dentro de otro software y estorba sobre su
  // propia UI (ver comentario de minimizedStorageKey). Oculto hasta que el bootstrap confirme
  // que la empresa permite minimizar (allowMinimize, default true).
  var minimizeBadge = document.createElement('button');
  minimizeBadge.setAttribute('aria-label', 'Ocultar burbuja de chat');
  minimizeBadge.innerHTML = MINUS_ICON;
  minimizeBadge.style.cssText =
    'position:fixed;bottom:84px;' + side +
    'z-index:2147483001;width:22px;height:22px;border-radius:50%;border:none;' +
    'background:rgba(25,28,40,.55);color:#fff;cursor:pointer;display:none;align-items:center;justify-content:center;' +
    'opacity:.7;transition:opacity .15s ease,transform .15s ease;';
  minimizeBadge.onmouseenter = function () { minimizeBadge.style.opacity = '1'; minimizeBadge.style.transform = 'scale(1.1)'; };
  minimizeBadge.onmouseleave = function () { minimizeBadge.style.opacity = '.7'; minimizeBadge.style.transform = 'scale(1)'; };

  // Pestaña delgada pegada al borde para restaurar la burbuja minimizada.
  var restoreTab = document.createElement('button');
  restoreTab.setAttribute('aria-label', 'Mostrar chat');
  restoreTab.innerHTML = CHEVRON_ICON(position === 'left' ? 'right' : 'left');
  restoreTab.style.cssText =
    'position:fixed;bottom:26px;' + (position === 'left' ? 'left:0;' : 'right:0;') +
    'z-index:2147483000;width:18px;height:46px;border:none;color:#fff;cursor:pointer;' +
    'display:' + (minimized ? 'flex' : 'none') + ';align-items:center;justify-content:center;' +
    'background:rgba(40,44,58,.55);opacity:' + (minimized ? '1' : '0') + ';' +
    (position === 'left' ? 'border-radius:0 10px 10px 0;' : 'border-radius:10px 0 0 10px;') +
    'transition:opacity .2s ease,background .15s ease;';
  restoreTab.onmouseenter = function () { restoreTab.style.background = 'rgba(40,44,58,.8)'; };
  restoreTab.onmouseleave = function () { restoreTab.style.background = 'rgba(40,44,58,.55)'; };

  var teaser = document.createElement('div');
  // Contenido de la burbuja de saludo: texto (tarjeta blanca de siempre) o una imagen propia
  // (p.ej. una mascota señalando el botón, como en taypi.pe) — ver "clienera:ready" más abajo
  // y applyTeaser(), que arma el cssText distinto según el tipo cada vez que cambia.
  var teaserType = 'text';
  var teaserImageUrl = null;
  var welcomeMessageText = '';
  function applyTeaser() {
    if (teaserType === 'image' && teaserImageUrl) {
      teaser.innerHTML = '<img src="' + teaserImageUrl + '" alt="" style="display:block;width:180px;max-width:60vw;height:auto;pointer-events:none;" />';
      teaser.style.cssText =
        'position:fixed;bottom:14px;' + (position === 'left' ? 'left:74px;' : 'right:74px;') +
        'z-index:2147482999;background:transparent;padding:0;border:none;box-shadow:none;' +
        'opacity:0;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease;pointer-events:none;cursor:pointer;';
    } else {
      teaser.textContent = welcomeMessageText;
      teaser.style.cssText =
        'position:fixed;bottom:30px;' + (position === 'left' ? 'left:90px;' : 'right:90px;') +
        'z-index:2147482999;max-width:240px;background:#fff;color:#1a1f2b;padding:12px 15px;' +
        'border-radius:14px;' + (position === 'left' ? 'border-bottom-left-radius:4px;' : 'border-bottom-right-radius:4px;') +
        'box-shadow:0 10px 30px -8px rgba(0,0,0,.25);font:500 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
        'opacity:0;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease;pointer-events:none;cursor:pointer;';
    }
  }
  applyTeaser();

  var frame = document.createElement('iframe');
  frame.title = 'Chat';
  // Sin esto, un iframe de otro origen (cualquier web de cliente embebiendo este script)
  // bloquea getUserMedia por Permissions Policy aunque el visitante dé permiso en el
  // navegador — el micrófono queda delegado explícitamente al iframe. Mismo motivo para
  // autoplay: si no, el <audio autoPlay> del audio remoto de la llamada puede quedar mudo.
  frame.setAttribute('allow', 'microphone; autoplay');
  frame.src = origin + '/c/' + encodeURIComponent(slug) + '?embed=1' + (pageUrl ? '&pageUrl=' + encodeURIComponent(pageUrl) : '');
  frame.style.cssText =
    'position:fixed;border:none;box-shadow:0 20px 50px -12px rgba(0,0,0,.35);' +
    'z-index:2147483000;background:#fff;display:none;opacity:0;transform:translateY(12px);' +
    'transition:opacity .2s ease,transform .2s ease;';

  // Tamaño/posición del iframe según el viewport actual — separado del resto del cssText de
  // arriba porque esto sí cambia en caliente (al abrir/cerrar en celular, o al rotar la
  // pantalla mientras el chat está abierto), ver listener de "resize" más abajo.
  function applyFrameLayout() {
    if (mobile && open) {
      frame.style.top = '0'; frame.style.bottom = '0'; frame.style.left = '0'; frame.style.right = '0';
      frame.style.width = '100%'; frame.style.height = '100%';
      frame.style.maxWidth = 'none'; frame.style.maxHeight = 'none';
      frame.style.borderRadius = '0';
    } else {
      frame.style.top = '';
      frame.style.bottom = '88px';
      if (position === 'left') { frame.style.left = '20px'; frame.style.right = ''; }
      else { frame.style.right = '20px'; frame.style.left = ''; }
      frame.style.width = '368px';
      frame.style.height = '540px';
      frame.style.maxWidth = 'calc(100vw - 32px)';
      frame.style.maxHeight = 'calc(100dvh - 120px)';
      frame.style.borderRadius = '18px';
    }
  }
  applyFrameLayout();

  var open = false;
  function setOpen(next) {
    open = next;
    applyFrameLayout();
    if (open) {
      teaser.style.opacity = '0';
      teaser.style.pointerEvents = 'none';
      frame.style.display = 'block';
      // En celular el panel ocupa toda la pantalla: el botón flotante (y su badge de
      // minimizar) estorbarían encima sin aportar nada, el propio X del panel ya cierra.
      if (mobile) { launcher.style.display = 'none'; minimizeBadge.style.display = 'none'; }
      requestAnimationFrame(function () {
        frame.style.opacity = '1';
        frame.style.transform = 'translateY(0)';
      });
      launcher.setAttribute('aria-label', 'Cerrar chat');
    } else {
      frame.style.opacity = '0';
      frame.style.transform = 'translateY(12px)';
      setTimeout(function () { if (!open) frame.style.display = 'none'; }, 180);
      launcher.setAttribute('aria-label', 'Abrir chat');
      if (!minimized) {
        launcher.style.display = 'flex';
        minimizeBadge.style.display = minimizeAllowed ? 'flex' : 'none';
      }
    }
    renderLauncherFace();
  }

  // Si el visitante rota la pantalla (o redimensiona la ventana en desktop) mientras el chat
  // está abierto, se recalcula si ahora toca modo pantalla completa o tarjeta flotante.
  window.addEventListener('resize', function () {
    var next = computeMobile();
    if (next === mobile) return;
    mobile = next;
    applyFrameLayout();
    if (!open) return;
    if (mobile) { launcher.style.display = 'none'; minimizeBadge.style.display = 'none'; }
    else { launcher.style.display = 'flex'; minimizeBadge.style.display = minimizeAllowed ? 'flex' : 'none'; }
  });

  // Minimiza/restaura la burbuja completa (botón + teaser + panel), independiente de
  // abrir/cerrar el chat. El estado se recuerda en este navegador (ver minimizedStorageKey).
  function setMinimized(next) {
    minimized = next;
    try { localStorage.setItem(minimizedStorageKey, next ? '1' : '0'); } catch (e) {}
    if (next) {
      if (open) setOpen(false);
      launcher.style.display = 'none';
      minimizeBadge.style.display = 'none';
      teaser.style.opacity = '0';
      teaser.style.pointerEvents = 'none';
      restoreTab.style.display = 'flex';
      requestAnimationFrame(function () { restoreTab.style.opacity = '1'; });
    } else {
      restoreTab.style.opacity = '0';
      setTimeout(function () { if (minimized) return; restoreTab.style.display = 'none'; }, 200);
      launcher.style.display = 'flex';
      minimizeBadge.style.display = minimizeAllowed ? 'flex' : 'none';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { launcher.style.transform = 'scale(1)'; launcher.style.opacity = '1'; });
      });
    }
  }

  launcher.addEventListener('click', function () { setOpen(!open); });
  minimizeBadge.addEventListener('click', function (e) { e.stopPropagation(); setMinimized(true); });
  restoreTab.addEventListener('click', function () { setMinimized(false); });

  // El iframe (la página /c/[slug]) avisa cuando ya resolvió el canal y tiene el branding
  // real de la empresa — recién ahí se pinta el botón/burbuja con su color y mensaje en vez
  // de quedarse con el valor genérico por defecto.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'clienera:ready') {
      reposition(data.position);
      if (data.color) {
        paintLauncher(data.color);
        try { localStorage.setItem(colorStorageKey, data.color); } catch (e) {}
      }
      if (data.iconUrl !== iconUrl) {
        iconUrl = data.iconUrl || null;
        try {
          if (iconUrl) localStorage.setItem(iconStorageKey, iconUrl);
          else localStorage.removeItem(iconStorageKey);
        } catch (e) {}
      }
      renderLauncherFace();
      teaserType = data.teaserType === 'image' && data.teaserImageUrl ? 'image' : 'text';
      teaserImageUrl = data.teaserImageUrl || null;
      welcomeMessageText = data.welcomeMessage || '';
      applyTeaser();
      // allowMinimize solo llega false si la empresa lo desactivó a propósito — si lo
      // desactivó mientras el visitante estaba minimizado, se restaura.
      minimizeAllowed = data.allowMinimize !== false;
      if (!minimizeAllowed) {
        minimizeBadge.style.display = 'none';
        if (minimized) setMinimized(false);
      } else if (!minimized) {
        minimizeBadge.style.display = 'flex';
      }
      if (data.autoOpen && !open && !minimized) {
        // Abre el panel solo al entrar a la página (configurable por canal, ver
        // "Instancias → Clienera Chat → Personalizar" → "Abrir automáticamente"). Un pequeño
        // delay para que no se sienta como un popup agresivo apenas carga la página.
        setTimeout(function () { if (!open && !minimized) setOpen(true); }, 700);
      } else if ((teaserType === 'image' || welcomeMessageText) && !open && !minimized) {
        setTimeout(function () {
          if (!open && !minimized) {
            teaser.style.opacity = '1';
            teaser.style.transform = 'translateY(0)';
            teaser.style.pointerEvents = 'auto';
          }
        }, 1200);
      }
    } else if (data.type === 'clienera:close') {
      setOpen(false);
    }
  });

  // El atributo data-position del <script> es solo una adivinanza para el primer pintado
  // (sin esperar la red, para no arrancar invisible) — la posición real la decide el panel
  // ("Instancias → Clienera Chat → Personalizar"), que llega recién acá. Si difieren (p.ej.
  // el <script> ya pegado en la web del cliente es viejo o no tiene el atributo), se
  // reposiciona todo al lado correcto en vez de quedarse pegado al valor adivinado.
  function reposition(newPosition) {
    if (newPosition !== 'left' && newPosition !== 'right') return;
    try { localStorage.setItem(positionStorageKey, newPosition); } catch (e) {}
    if (newPosition === position) return;
    position = newPosition;

    if (position === 'left') { launcher.style.left = '20px'; launcher.style.right = ''; }
    else { launcher.style.right = '20px'; launcher.style.left = ''; }

    if (position === 'left') { minimizeBadge.style.left = '20px'; minimizeBadge.style.right = ''; }
    else { minimizeBadge.style.right = '20px'; minimizeBadge.style.left = ''; }

    if (position === 'left') { restoreTab.style.left = '0'; restoreTab.style.right = ''; restoreTab.style.borderRadius = '0 10px 10px 0'; }
    else { restoreTab.style.right = '0'; restoreTab.style.left = ''; restoreTab.style.borderRadius = '10px 0 0 10px'; }
    restoreTab.innerHTML = CHEVRON_ICON(position === 'left' ? 'right' : 'left');

    // La burbuja de saludo (teaser) no se toca acá: applyTeaser() la arma entera de nuevo
    // (posición incluida) justo después de esta llamada, en el handler de "clienera:ready".
    applyFrameLayout();
  }

  teaser.addEventListener('click', function () { setOpen(true); });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(teaser);
    document.body.appendChild(launcher);
    document.body.appendChild(minimizeBadge);
    document.body.appendChild(restoreTab);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
