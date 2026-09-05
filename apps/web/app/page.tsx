'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Kanban,
  KeyRound,
  Layers,
  MessageSquareText,
  PlayCircle,
  Plug,
  QrCode,
  RefreshCw,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  Wifi,
} from 'lucide-react';
import { BrandIcon } from '@/components/brand-mark';
import { API_URL, apiFetch, getToken } from '@/lib/api';

// Anima cada tarjeta/encabezado la primera vez que entra en pantalla (una sola vez — se
// desconecta el observer apenas se revela, no hay razón para seguir escuchando scroll después).
// `className` se aplica al mismo nodo que ya tenía (grid item, card, etc.) para no meter un
// div extra que rompa el grid.
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${visible ? 'is-visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

type PublicPlan = {
  id: string; name: string; billingCycle: string; price: number; priceUsd: number;
  maxAgents: number | null; maxInstances: number | null; maxMessages: number | null;
  isDefault: boolean; features: string[];
};

const cycleLabels: Record<string, string> = { FREE: 'Gratis', MONTHLY: 'Mensual', ANNUAL: 'Anual' };
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
// SoftwareApplication en vez de Organization: es lo que Google espera para mostrar un rich
// result de "app/producto" (con rating, precio, etc.) — Organization es para la identidad de
// la empresa en sí, que no es lo que alguien busca cuando llega a esta landing.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'BrainWSP',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: SITE_URL,
  description: 'Plataforma para centralizar WhatsApp: bandeja compartida en tiempo real, automatizaciones sin código, CRM y conexión directa con tu ERP.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'PEN' },
  brand: { '@type': 'Organization', name: 'Brain Tech' },
};

function formatPrice(plan: PublicPlan) {
  if (!plan.price && !plan.priceUsd) return { amount: 'Gratis', period: '' };
  const parts: string[] = [];
  if (plan.price) parts.push(`S/ ${(plan.price / 100).toFixed(0)}`);
  if (plan.priceUsd) parts.push(`US$ ${(plan.priceUsd / 100).toFixed(0)}`);
  return { amount: parts.join(' · '), period: plan.billingCycle === 'ANNUAL' ? '/año' : '/mes' };
}

// Mismo criterio que "Mi Plan" y el registro: si el plan no trae beneficios en texto libre,
// se arma la lista sola a partir de sus límites — así la landing nunca muestra una tarjeta vacía.
function planBullets(plan: PublicPlan) {
  if (plan.features.length) return plan.features;
  return [
    plan.maxInstances ? `${plan.maxInstances} WhatsApp` : 'WhatsApp ilimitados',
    plan.maxAgents ? `${plan.maxAgents} agentes` : 'Agentes ilimitados',
    plan.maxMessages ? `${plan.maxMessages.toLocaleString('es-PE')} mensajes/mes` : 'Mensajes ilimitados',
  ];
}

const features = [
  { icon: Layers, title: 'Constructor visual de flujos', body: 'Arma automatizaciones completas arrastrando bloques — sin escribir código, listo en minutos.' },
  { icon: Bot, title: 'Asistente de IA con tu conocimiento', body: 'Conecta tu propia base de conocimiento para que el bot responda con la información real de tu negocio.' },
  { icon: MessageSquareText, title: 'Bandeja en tiempo real', body: 'Conversaciones, estados y contadores de no leídos que se actualizan solos — sin recargar la página.' },
  { icon: Wifi, title: 'Multi-línea y multi-agente', body: 'Conecta varias líneas de WhatsApp y reparte agentes por departamento, cada uno con su propio acceso.' },
  { icon: UserCog, title: 'Handoff inteligente', body: 'En cuanto un agente toma la conversación, el bot se pausa solo — nadie pisa la respuesta de nadie.' },
  { icon: Kanban, title: 'CRM integrado', body: 'Prospectos, tratos y pipelines por departamento, sin salir del chat para dar seguimiento.' },
];

const steps = [
  { n: '01', icon: Rocket, title: 'Crea tu cuenta', body: 'Regístrate con tu correo en menos de un minuto — sin tarjeta de crédito.' },
  { n: '02', icon: QrCode, title: 'Conecta tu WhatsApp', body: 'Escanea el código QR o conecta la API Oficial si ya la tienes.' },
  { n: '03', icon: Settings2, title: 'Arma tu automatización', body: 'Usa plantillas o crea tus propios flujos con el constructor visual.' },
  { n: '04', icon: Users, title: 'Atiende en equipo', body: 'Invita a tus agentes a la bandeja compartida y empieza a vender.' },
];

const reliability = [
  { icon: RefreshCw, title: 'Reconexión automática', body: 'Si la sesión de WhatsApp se corta, se reconecta sola con reintento exponencial — no dependes de reiniciar nada a mano.' },
  { icon: Database, title: 'Sesión persistida en base de datos', body: 'Las credenciales y llaves de tu WhatsApp viven en PostgreSQL, no en archivos sueltos que se pierden al reiniciar un servidor.' },
  { icon: Plug, title: 'Conexión directa con tu ERP', body: 'Endpoint compatible con integraciones PHP existentes, más una API con APP KEY / AUTH KEY para lo que ya tengas armado.' },
  { icon: ShieldCheck, title: 'Multiempresa desde el diseño', body: 'Cada empresa vive aislada por diseño — no es una capa agregada después, es como está construido el sistema.' },
];

const faqs = [
  { q: '¿QR o API Oficial, cuál elijo?', a: 'El QR es gratis e inmediato: escaneas con tu teléfono y listo. La API Oficial (vía Meta) no depende de un celular encendido y es la opción recomendada para volumen alto o varios agentes simultáneos.' },
  { q: '¿Necesito tarjeta de crédito para probar?', a: 'No. El registro es solo con tu correo. Si más adelante subes a un plan pago, el pago se hace manualmente (transferencia o QR) y un administrador lo confirma — nunca pedimos datos de tarjeta.' },
  { q: '¿Puedo conectar mi sistema o ERP actual?', a: 'Sí. Tienes un endpoint compatible con integraciones PHP ya existentes, y una API v1 con APP KEY / AUTH KEY para conectar cualquier otro sistema.' },
  { q: '¿Qué pasa si mi WhatsApp se desconecta?', a: 'El worker reintenta la reconexión automáticamente. Tu historial de conversaciones y la sesión misma quedan guardados en base de datos, no en la memoria de un proceso que se puede caer.' },
];

export default function LandingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [navScrolled, setNavScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // A propósito NO bloquea el render con un spinner mientras esto resuelve: la landing es la
  // página pública que necesita salir en buscadores y en la vista previa de WhatsApp/redes
  // cuando se comparte el link — un gate "if (checkingSession) return <spinner>" deja el HTML
  // inicial vacío para cualquier crawler que no ejecute JS (o lo haga tarde). El costo es que
  // un usuario YA logueado ve un parpadeo de la landing antes de que esto lo mande a
  // /dashboard — cambio aceptable frente a esconder todo el contenido de SEO tras un loader.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch<{ role: string }>('/auth/me')
      .then((me) => router.replace(me.role === 'SUPERADMIN' ? '/admin/clients' : '/dashboard'))
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    fetch(`${API_URL}/auth/plans`).then((res) => res.json()).then(setPlans).catch(() => undefined);
  }, []);

  // Nav se compacta y gana opacidad al hacer scroll — el mismo detalle que separa un header
  // estático de uno que se siente "vivo".
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Red de partículas del hero: canvas con física real (deriva + rebote en los bordes) en vez
  // del SVG anterior con posiciones fijas — así se conecta con quien esté cerca en cada
  // instante, en vez de con las mismas 6 líneas dibujadas a mano. Todo vive en refs/variables
  // locales al efecto, no en useState: a 60fps eso metería un re-render de React por frame.
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!hero || !canvas || !ctx) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(max-width: 900px)').matches) return; // mismo corte que antes: se ve recargado en pantallas chicas y cuesta batería

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let particles: { x: number; y: number; vx: number; vy: number }[] = [];
    const mouse = { x: -9999, y: -9999 };

    const LINK_DIST = 130;
    const MOUSE_DIST = 170;

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Densidad ligada al área, no un conteo fijo — así se ve igual de lleno en una laptop
      // chica que en un monitor ancho, con un techo para no sobrecargar pantallas grandes.
      const count = Math.min(80, Math.round((width * height) / 15000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      }));
    };
    resize();

    const handleMove = (e: MouseEvent) => {
      const rect = hero.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const handleLeave = () => { mouse.x = -9999; mouse.y = -9999; };

    let frameId = 0;
    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < LINK_DIST) {
            ctx.strokeStyle = `rgba(60,134,255,${(1 - dist / LINK_DIST) * 0.35})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const distm = Math.hypot(particles[i].x - mouse.x, particles[i].y - mouse.y);
        if (distm < MOUSE_DIST) {
          ctx.strokeStyle = `rgba(228,0,124,${(1 - distm / MOUSE_DIST) * 0.45})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(33,55,134,.55)';
        ctx.fill();
      }
      frameId = requestAnimationFrame(tick);
    };
    tick();

    const handleVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frameId);
      else tick();
    };

    window.addEventListener('resize', resize);
    hero.addEventListener('mousemove', handleMove);
    hero.addEventListener('mouseleave', handleLeave);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      hero.removeEventListener('mousemove', handleMove);
      hero.removeEventListener('mouseleave', handleLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div className="landing">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}>
        <div className="landing-nav-inner">
          <button type="button" className="landing-brand landing-brand-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="landing-brand-mark"><BrandIcon size={24} /></div>
            <strong>BrainWSP</strong>
          </button>
          <nav className="landing-nav-links">
            <a href="#producto">Producto</a>
            <a href="#confiabilidad">Confiabilidad</a>
            <a href="#precios">Precios</a>
            <a href="#faq">Preguntas</a>
          </nav>
          <div className="landing-nav-actions">
            <Link href="/login" className="landing-ghost-btn">Iniciar sesión</Link>
            <Link href="/register" className="button primary landing-nav-cta">Empieza gratis</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero" ref={heroRef}>
          <div className="landing-hero-grid" aria-hidden="true" />
          <div className="landing-hero-glow" aria-hidden="true" />
          <canvas className="landing-hero-canvas" ref={canvasRef} aria-hidden="true" />
          <div className="landing-hero-inner">
            <h1>
              Centraliza <span className="landing-highlight">WhatsApp</span>, atiende en equipo y <span className="landing-highlight">vende más</span> desde un solo panel.
            </h1>
            <p className="landing-hero-sub">
              Bandeja compartida, automatizaciones sin código, CRM y conexión directa con tu ERP — todo sobre tu número de WhatsApp.
            </p>
            <div className="landing-pill-row">
              <span className="landing-pill"><QrCode size={15} />WhatsApp QR</span>
              <span className="landing-pill"><Wifi size={15} />WhatsApp API Oficial</span>
              <span className="landing-pill"><Users size={15} />Multi-agente</span>
            </div>
            <div className="landing-cta-row">
              <Link href="/register" className="button primary landing-cta"><Rocket size={16} />Empieza gratis<ChevronRight size={16} /></Link>
              <a href="#producto" className="button landing-cta"><PlayCircle size={16} />Ver cómo funciona</a>
            </div>
            <div className="landing-trust-row">
              <span><Check size={14} />Sin tarjeta de crédito</span>
              <span><Check size={14} />Cancela cuando quieras</span>
              <span><Check size={14} />Activo en minutos</span>
            </div>
          </div>
        </section>

        <section className="landing-section" id="producto">
          <Reveal className="landing-section-head">
            <span className="landing-eyebrow">Plataforma</span>
            <h2>Herramientas para automatizar a escala</h2>
            <p>Diseñado para que ventas, marketing y soporte operen sin depender de un desarrollador para cada cambio.</p>
          </Reveal>
          <div className="landing-feature-grid">
            {features.map((feature, i) => (
              <Reveal className="landing-feature-card" delay={i * 70} key={feature.title}>
                <div className="landing-feature-icon"><feature.icon size={20} /></div>
                <strong>{feature.title}</strong>
                <p>{feature.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing-section landing-section-alt">
          <Reveal className="landing-section-head">
            <span className="landing-eyebrow">El camino</span>
            <h2>En marcha</h2>
            <p>Sin instalaciones complejas. Todo en la nube.</p>
          </Reveal>
          <div className="landing-steps-grid">
            {steps.map((step, i) => (
              <Reveal className="landing-step-card" delay={i * 90} key={step.n}>
                <div className="landing-step-icon"><step.icon size={22} /></div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing-section" id="confiabilidad">
          <Reveal className="landing-section-head">
            <span className="landing-eyebrow">Confiabilidad</span>
            <h2>Hecho para que tu WhatsApp nunca se caiga</h2>
            <p>La parte que no se ve en una demo, pero es la que sostiene una operación real.</p>
          </Reveal>
          <div className="landing-reliability-grid">
            {reliability.map((item, i) => (
              <Reveal className="landing-reliability-card" delay={i * 80} key={item.title}>
                <div className="landing-feature-icon"><item.icon size={20} /></div>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing-section landing-section-alt" id="precios">
          <Reveal className="landing-section-head">
            <span className="landing-eyebrow">Precios</span>
            <h2>Un plan para cada etapa</h2>
            <p>Sin contratos. Escala o reduce cuando quieras.</p>
          </Reveal>
          <div className="landing-pricing-grid">
            {plans.map((plan, i) => {
              const price = formatPrice(plan);
              return (
                <Reveal className={`landing-price-card ${plan.isDefault ? 'featured' : ''}`} delay={i * 80} key={plan.id}>
                  {plan.isDefault && <div className="landing-price-badge"><Sparkles size={12} />Para empezar</div>}
                  <div className="landing-price-name">{plan.name}</div>
                  <div className="landing-price-cycle">{cycleLabels[plan.billingCycle] || plan.billingCycle}</div>
                  <div className="landing-price-amount">{price.amount}<span>{price.period}</span></div>
                  <ul className="landing-price-list">
                    {planBullets(plan).map((bullet) => <li key={bullet}><Check size={14} />{bullet}</li>)}
                  </ul>
                  <Link href="/register" className={`button ${plan.isDefault ? 'primary' : ''} landing-price-cta`}>Elegir plan</Link>
                </Reveal>
              );
            })}
            {!plans.length && <p className="row-sub">Cargando planes...</p>}
          </div>
        </section>

        <section className="landing-section" id="faq">
          <Reveal className="landing-section-head">
            <span className="landing-eyebrow">FAQ</span>
            <h2>Preguntas frecuentes</h2>
            <p>Resolvemos tus dudas más comunes.</p>
          </Reveal>
          <div className="landing-faq-list">
            {faqs.map((item, i) => {
              const open = openFaq === i;
              return (
                <Reveal className={`landing-faq-card ${open ? 'open' : ''}`} delay={i * 60} key={item.q}>
                  <button type="button" className="landing-faq-question" onClick={() => setOpenFaq(open ? null : i)} aria-expanded={open}>
                    <strong>{item.q}</strong>
                    <ChevronDown size={16} className="landing-faq-chevron" />
                  </button>
                  <div className="landing-faq-answer"><p>{item.a}</p></div>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="landing-section-alt landing-final-cta">
          <Reveal className="landing-final-cta-inner">
            <div>
              <h2>¿Listo para centralizar tu WhatsApp?</h2>
              <p>Crea tu cuenta y conecta tu primera línea en minutos.</p>
            </div>
            <Link href="/register" className="button primary landing-cta"><Rocket size={16} />Empieza gratis<ChevronRight size={16} /></Link>
          </Reveal>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <button type="button" className="landing-brand landing-brand-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="landing-brand-mark"><BrandIcon size={22} /></div>
            <strong>BrainWSP</strong>
          </button>
          <div className="landing-footer-links">
            <Link href="/login">Iniciar sesión</Link>
            <Link href="/register">Crear cuenta</Link>
            <Link href="/privacidad">Privacidad</Link>
          </div>
          <span className="landing-footer-brand"><KeyRound size={12} />Un producto de Brain Tech</span>
        </div>
      </footer>
    </div>
  );
}
