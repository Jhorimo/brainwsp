import type { ContentBlock, MenuOption } from '../types';

// Plantillas estáticas del lado del cliente — no hay tabla de plantillas en el backend todavía
// (ver README de esta carpeta si se agrega una). "Usar plantilla" simplemente llama a los
// endpoints normales de creación/edición de flujos (POST /automations/flows + PATCH del graph),
// así que cada plantilla es 100% un flujo real y editable una vez duplicada, no una demo aparte.
//
// Solo usan los tipos de nodo/bloque que el motor YA ejecuta (start/content/wait/menu; texto,
// retraso, contacto, auto off) — nada de "Validación de pago" ni "Remarketing" automático,
// que no existen todavía en apps/api/apps/worker.

export type FlowTemplateGraph = {
  schemaVersion: 1;
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: unknown }>;
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string }>;
};

export type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  category: 'Ventas' | 'Soporte';
  icon: string;
  suggestedKeyword: string;
  graph: FlowTemplateGraph;
};

const text = (id: string, value: string): ContentBlock => ({ id, kind: 'text', text: value });
const delay = (id: string, seconds: number): ContentBlock => ({ id, kind: 'delay', seconds });
const contact = (id: string, contactName: string, contactPhone: string, contactCompany?: string): ContentBlock => ({ id, kind: 'contact', contactName, contactPhone, contactCompany });
const autooff = (id: string, seconds: number): ContentBlock => ({ id, kind: 'autooff', seconds });
const opt = (id: string, value: string): MenuOption => ({ id, text: value });

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'funnel-ventas-pago',
    name: 'Funnel de Ventas con Menú de Pago',
    description: 'Bienvenida + oferta, menú de método de pago (Yape/Transferencia/Tarjeta) y confirmación.',
    category: 'Ventas',
    icon: '💰',
    suggestedKeyword: 'comprar',
    graph: {
      schemaVersion: 1,
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 120 }, data: {} },
        {
          id: 'welcome',
          type: 'content',
          position: { x: 340, y: 60 },
          data: {
            label: 'Bienvenida',
            blocks: [
              text('b1', '¡Hola! 👋 Bienvenido/a. Tenemos una oferta especial disponible ahora mismo.'),
              delay('b2', 2),
              text('b3', 'Precio: *S/ 97* (antes S/ 150). ¿Cómo deseas pagar?'),
            ],
          },
        },
        {
          id: 'menu',
          type: 'menu',
          position: { x: 700, y: 60 },
          data: {
            label: 'Método de pago',
            prompt: 'Elige tu método de pago preferido:',
            options: [opt('yape', 'Yape / Plin'), opt('transfer', 'Transferencia bancaria'), opt('card', 'Tarjeta')],
            displayMode: 'list',
          },
        },
        {
          id: 'yape',
          type: 'content',
          position: { x: 1060, y: -160 },
          data: { label: 'Instrucciones Yape', blocks: [text('y1', 'Yapea al 999 888 777 (Nombre del negocio) y envíanos la captura de tu pago aquí mismo.')] },
        },
        {
          id: 'transfer',
          type: 'content',
          position: { x: 1060, y: 60 },
          data: { label: 'Instrucciones Transferencia', blocks: [text('t1', 'Cuenta BCP: 191-1234567-0-89\nCCI: 00219100123456789012\nA nombre de: Tu Negocio SAC\n\nEnvíanos el voucher aquí mismo.')] },
        },
        {
          id: 'card',
          type: 'content',
          position: { x: 1060, y: 280 },
          data: { label: 'Instrucciones Tarjeta', blocks: [text('c1', 'Te enviamos el link de pago seguro con tarjeta: [tu-link-de-pago.com]')] },
        },
        {
          id: 'thanks',
          type: 'content',
          position: { x: 1420, y: 60 },
          data: { label: 'Confirmación', blocks: [text('th1', '¡Gracias! En cuanto confirmemos tu pago, un asesor te contactará para coordinar la entrega. 🙌')] },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'welcome' },
        { id: 'e2', source: 'welcome', target: 'menu' },
        { id: 'e3', source: 'menu', target: 'yape', sourceHandle: 'yape' },
        { id: 'e4', source: 'menu', target: 'transfer', sourceHandle: 'transfer' },
        { id: 'e5', source: 'menu', target: 'card', sourceHandle: 'card' },
        { id: 'e6', source: 'yape', target: 'thanks' },
        { id: 'e7', source: 'transfer', target: 'thanks' },
        { id: 'e8', source: 'card', target: 'thanks' },
      ],
    },
  },
  {
    id: 'faq-asesor',
    name: 'Preguntas Frecuentes + Derivar a Asesor',
    description: 'Menú de FAQ (precios, horarios, ubicación) con opción de pasar la conversación a un humano.',
    category: 'Ventas',
    icon: '💬',
    suggestedKeyword: 'info',
    graph: {
      schemaVersion: 1,
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 140 }, data: {} },
        {
          id: 'welcome',
          type: 'content',
          position: { x: 340, y: 100 },
          data: { label: 'Bienvenida', blocks: [text('b1', '¡Hola! Soy el asistente virtual. ¿En qué puedo ayudarte hoy?')] },
        },
        {
          id: 'menu',
          type: 'menu',
          position: { x: 700, y: 100 },
          data: {
            label: 'Menú FAQ',
            prompt: 'Elige una opción:',
            options: [opt('precios', 'Precios'), opt('horarios', 'Horarios de atención'), opt('ubicacion', 'Ubicación'), opt('asesor', 'Hablar con un asesor')],
            displayMode: 'list',
          },
        },
        { id: 'precios', type: 'content', position: { x: 1060, y: -160 }, data: { label: 'Precios', blocks: [text('p1', 'Nuestros planes van desde S/ 49 al mes. ¿Quieres que te enviemos el catálogo completo?')] } },
        { id: 'horarios', type: 'content', position: { x: 1060, y: 40 }, data: { label: 'Horarios', blocks: [text('h1', 'Atendemos de lunes a sábado, de 9:00 am a 7:00 pm.')] } },
        { id: 'ubicacion', type: 'content', position: { x: 1060, y: 240 }, data: { label: 'Ubicación', blocks: [text('u1', 'Estamos en Av. Principal 123, Lima. También puedes vernos en el mapa: https://maps.app.goo.gl/ejemplo')] } },
        {
          id: 'asesor',
          type: 'content',
          position: { x: 1060, y: 440 },
          data: {
            label: 'Derivar a asesor',
            blocks: [
              text('a1', 'Perfecto, en un momento un asesor te va a escribir por acá. Gracias por tu paciencia 🙏'),
              // Deja de responder automáticamente por 24h para que el humano tome la conversación sin que el bot interrumpa.
              autooff('a2', 86400),
            ],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'welcome' },
        { id: 'e2', source: 'welcome', target: 'menu' },
        { id: 'e3', source: 'menu', target: 'precios', sourceHandle: 'precios' },
        { id: 'e4', source: 'menu', target: 'horarios', sourceHandle: 'horarios' },
        { id: 'e5', source: 'menu', target: 'ubicacion', sourceHandle: 'ubicacion' },
        { id: 'e6', source: 'menu', target: 'asesor', sourceHandle: 'asesor' },
      ],
    },
  },
  {
    id: 'recordatorio-pago',
    name: 'Recordatorio de Pago Pendiente',
    description: 'Recuerda un pago pendiente, comparte el contacto de soporte y hace seguimiento al día siguiente.',
    category: 'Ventas',
    icon: '⏰',
    suggestedKeyword: 'pago',
    graph: {
      schemaVersion: 1,
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 80 }, data: {} },
        {
          id: 'reminder',
          type: 'content',
          position: { x: 340, y: 0 },
          data: {
            label: 'Recordatorio',
            blocks: [
              text('r1', 'Hola 👋 Te recordamos que tienes un pago pendiente. Si ya lo realizaste, ignora este mensaje.'),
              contact('r2', 'Soporte de Pagos', '+51999888777', 'Tu Negocio SAC'),
            ],
          },
        },
        { id: 'wait', type: 'wait', position: { x: 700, y: 0 }, data: { seconds: 86400 } },
        {
          id: 'followup',
          type: 'content',
          position: { x: 1000, y: 0 },
          data: { label: 'Seguimiento', blocks: [text('f1', 'Hola de nuevo 👋 ¿Pudiste realizar tu pago? Cuéntanos si necesitas ayuda.')] },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'reminder' },
        { id: 'e2', source: 'reminder', target: 'wait' },
        { id: 'e3', source: 'wait', target: 'followup' },
      ],
    },
  },
  {
    id: 'bienvenida-simple',
    name: 'Bienvenida Simple + Interés',
    description: 'Mensaje de bienvenida corto y una pregunta de sí/no para calificar el interés del contacto.',
    category: 'Ventas',
    icon: '👋',
    suggestedKeyword: 'hola',
    graph: {
      schemaVersion: 1,
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 80 }, data: {} },
        {
          id: 'welcome',
          type: 'content',
          position: { x: 340, y: 20 },
          data: { label: 'Bienvenida', blocks: [text('w1', '¡Hola! Gracias por escribirnos 😊'), delay('w2', 2), text('w3', 'Tenemos un producto que puede interesarte, ¿quieres que te cuente más?')] },
        },
        {
          id: 'menu',
          type: 'menu',
          position: { x: 700, y: 20 },
          data: { label: 'Interés', prompt: '¿Te interesa que te contemos más?', options: [opt('si', 'Sí, cuéntame'), opt('no', 'No, gracias')], displayMode: 'list' },
        },
        { id: 'yes', type: 'content', position: { x: 1060, y: -100 }, data: { label: 'Sí', blocks: [text('y1', '¡Genial! Un asesor te va a escribir en breve con todos los detalles.')] } },
        { id: 'no', type: 'content', position: { x: 1060, y: 140 }, data: { label: 'No', blocks: [text('n1', 'Entendido, ¡gracias por tu tiempo! Aquí estaremos si cambias de opinión 🙌')] } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'welcome' },
        { id: 'e2', source: 'welcome', target: 'menu' },
        { id: 'e3', source: 'menu', target: 'yes', sourceHandle: 'si' },
        { id: 'e4', source: 'menu', target: 'no', sourceHandle: 'no' },
      ],
    },
  },
];
