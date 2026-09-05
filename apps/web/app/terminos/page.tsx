import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Términos de Uso | BrainWSP',
  description: 'Condiciones de uso de BrainWSP: cuentas, planes y pagos, uso aceptable, suspensión y responsabilidad.',
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-doc">
        <h1>Términos de Uso de BrainWSP</h1>
        <p className="legal-updated">Última actualización: 5 de septiembre de 2026</p>

        <p>
          Estos términos regulan el uso de BrainWSP, operado por Brain Tech Perú (en adelante &quot;nosotros&quot;),
          por parte de la empresa que crea una cuenta (en adelante &quot;el cliente&quot;) y de las personas que
          esa empresa autoriza a usar el panel. Al crear una cuenta aceptas estos términos y nuestra{' '}
          <a href="/privacidad">Política de Privacidad</a>.
        </p>

        <h2>1. Qué es el servicio</h2>
        <p>
          BrainWSP centraliza la atención por WhatsApp de una empresa: conecta una o más líneas de WhatsApp (por
          código QR o API Oficial), permite responder desde una bandeja compartida entre varios agentes, automatizar
          conversaciones con flujos e IA, y conectar tu propio sistema o ERP mediante nuestra API con APP KEY / AUTH
          KEY.
        </p>

        <h2>2. Tu cuenta</h2>
        <ul>
          <li>Eres responsable de mantener la confidencialidad de tu contraseña y de las AUTH KEY generadas para tus integraciones.</li>
          <li>La persona que registra la empresa queda como <strong>Propietario</strong> y puede invitar agentes con roles y permisos limitados desde el panel.</li>
          <li>No debes usar BrainWSP para enviar mensajes no solicitados (spam), contenido ilegal, o de forma que viole las políticas de uso de WhatsApp/Meta.</li>
        </ul>

        <h2>3. Planes y pagos</h2>
        <p>
          BrainWSP se ofrece bajo distintos planes con límites de agentes, líneas de WhatsApp y mensajes. El registro
          no requiere tarjeta de crédito. Si tu empresa elige un plan pago, el pago se realiza de forma manual
          (transferencia o QR) y queda sujeto a confirmación por un administrador antes de activarse; los precios y
          límites vigentes de cada plan se muestran en el panel al momento de elegirlo.
        </p>

        <h2>4. Suspensión y cancelación</h2>
        <p>
          Podemos suspender el acceso de una cuenta si su licencia vence sin renovarse, o si detectamos un uso que
          viola estos términos. El cliente puede dejar de usar el servicio en cualquier momento; los datos se
          conservan según lo descrito en la Política de Privacidad mientras la cuenta siga activa.
        </p>

        <h2>5. Disponibilidad</h2>
        <p>
          BrainWSP depende a su vez de servicios de terceros (WhatsApp/Meta, proveedores de infraestructura) que
          están fuera de nuestro control. Hacemos lo posible por mantener el servicio disponible y reconectar
          automáticamente las sesiones de WhatsApp que se corten, pero no garantizamos disponibilidad ininterrumpida.
        </p>

        <h2>6. Responsabilidad</h2>
        <p>
          El cliente es responsable del contenido que envía a través de BrainWSP y de la información que carga en la
          plataforma (contactos, mensajes, integraciones). No respondemos por pérdidas derivadas de un mal uso del
          servicio, de la interrupción de servicios de terceros de los que dependemos, o de credenciales (AUTH KEY,
          contraseñas) que el cliente no haya resguardado adecuadamente.
        </p>

        <h2>7. Cambios a estos términos</h2>
        <p>
          Podemos actualizar estos términos para reflejar cambios en el servicio. Si el cambio es significativo, lo
          avisaremos por correo o dentro del panel antes de que entre en vigor.
        </p>

        <h2>8. Contacto</h2>
        <p>
          Para cualquier consulta sobre estos términos, escríbenos a{' '}
          <a href="mailto:braintech.2022@gmail.com">braintech.2022@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
