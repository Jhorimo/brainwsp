(function () {
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute('data-company');
  if (!slug) return;
  var origin = script.src.replace(/\/widget\.js.*$/, '');
  var position = script.getAttribute('data-position') === 'left' ? 'left' : 'right';

  var CHAT_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  var side = position === 'left' ? 'left:20px;' : 'right:20px;';

  var launcher = document.createElement('button');
  launcher.setAttribute('aria-label', 'Abrir chat');
  launcher.innerHTML = CHAT_ICON;
  launcher.style.cssText =
    'position:fixed;bottom:20px;' + side +
    'z-index:2147483000;width:58px;height:58px;border-radius:50%;border:none;' +
    'background:#6b8afd;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
    'box-shadow:0 10px 24px -6px rgba(0,0,0,.35);transition:transform .18s ease,box-shadow .18s ease;';
  launcher.onmouseenter = function () { launcher.style.transform = 'scale(1.06)'; };
  launcher.onmouseleave = function () { launcher.style.transform = 'scale(1)'; };

  var teaser = document.createElement('div');
  teaser.style.cssText =
    'position:fixed;bottom:30px;' + (position === 'left' ? 'left:90px;' : 'right:90px;') +
    'z-index:2147482999;max-width:240px;background:#fff;color:#1a1f2b;padding:12px 15px;' +
    'border-radius:14px;' + (position === 'left' ? 'border-bottom-left-radius:4px;' : 'border-bottom-right-radius:4px;') +
    'box-shadow:0 10px 30px -8px rgba(0,0,0,.25);font:500 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    'opacity:0;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease;pointer-events:none;';

  var frame = document.createElement('iframe');
  frame.title = 'Chat';
  frame.src = origin + '/c/' + encodeURIComponent(slug) + '?embed=1';
  frame.style.cssText =
    'position:fixed;bottom:88px;' + side +
    'width:368px;height:540px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 120px);' +
    'border:none;border-radius:18px;box-shadow:0 20px 50px -12px rgba(0,0,0,.35);' +
    'z-index:2147483000;background:#fff;display:none;opacity:0;transform:translateY(12px);' +
    'transition:opacity .2s ease,transform .2s ease;';

  var open = false;
  function setOpen(next) {
    open = next;
    if (open) {
      teaser.style.opacity = '0';
      teaser.style.pointerEvents = 'none';
      frame.style.display = 'block';
      requestAnimationFrame(function () {
        frame.style.opacity = '1';
        frame.style.transform = 'translateY(0)';
      });
      launcher.innerHTML = CLOSE_ICON;
      launcher.setAttribute('aria-label', 'Cerrar chat');
    } else {
      frame.style.opacity = '0';
      frame.style.transform = 'translateY(12px)';
      setTimeout(function () { if (!open) frame.style.display = 'none'; }, 180);
      launcher.innerHTML = CHAT_ICON;
      launcher.setAttribute('aria-label', 'Abrir chat');
    }
  }

  launcher.addEventListener('click', function () { setOpen(!open); });

  // El iframe (la página /c/[slug]) avisa cuando ya resolvió el canal y tiene el branding
  // real de la empresa — recién ahí se pinta el botón/burbuja con su color y mensaje en vez
  // de quedarse con el valor genérico por defecto.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'clienera:ready') {
      if (data.color) {
        launcher.style.background = data.color;
        teaser.style.borderColor = data.color;
      }
      if (data.autoOpen && !open) {
        // Abre el panel solo al entrar a la página (configurable por canal, ver
        // "Instancias → Clienera Chat → Personalizar" → "Abrir automáticamente"). Un pequeño
        // delay para que no se sienta como un popup agresivo apenas carga la página.
        setTimeout(function () { if (!open) setOpen(true); }, 700);
      } else if (data.welcomeMessage && !open) {
        teaser.textContent = data.welcomeMessage;
        setTimeout(function () {
          if (!open) {
            teaser.style.opacity = '1';
            teaser.style.transform = 'translateY(0)';
          }
        }, 1200);
      }
    } else if (data.type === 'clienera:close') {
      setOpen(false);
    }
  });

  teaser.addEventListener('click', function () { setOpen(true); });

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(teaser);
    document.body.appendChild(launcher);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
