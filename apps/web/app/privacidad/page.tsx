import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad | BrainWSP',
  description: 'Cómo BrainWSP recopila, usa y protege tus datos, incluyendo el uso de los datos de tu cuenta de Google.',
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-doc">
        <h1>Política de Privacidad de BrainWSP</h1>
        <p className="legal-updated">Última actualización: 26 de agosto de 2026</p>

        <p>
          BrainWSP (operado por Brain Tech Perú, en adelante &quot;nosotros&quot;) es una plataforma que centraliza la
          atención por WhatsApp, gestión de contactos y agenda para empresas (en adelante, &quot;los clientes&quot;) y
          las personas que usan sus servicios. Esta política explica qué datos recopilamos, cómo los usamos y qué
          derechos tienes sobre ellos.
        </p>

        <h2>1. Qué datos recopilamos</h2>
        <ul>
          <li><strong>Cuenta del panel:</strong> nombre, correo y contraseña (almacenada como hash, nunca en texto plano) de los usuarios que administran BrainWSP dentro de una empresa cliente.</li>
          <li><strong>Conversaciones de WhatsApp:</strong> mensajes, contactos, notas internas y archivos multimedia que la empresa cliente gestiona a través de la plataforma.</li>
          <li><strong>Datos de integración:</strong> credenciales de API (APP KEY / AUTH KEY) usadas para conectar sistemas externos del cliente (por ejemplo, su ERP) con BrainWSP.</li>
          <li><strong>Datos de tu cuenta de Google</strong> (solo si el cliente conecta Google Calendar de forma voluntaria) — ver sección 2.</li>
        </ul>

        <h2>2. Uso de los datos de Google (Google Calendar)</h2>
        <p>
          BrainWSP ofrece un módulo opcional de Calendario que permite a una empresa cliente conectar <strong>su
          propia</strong> cuenta de Google para agendar citas directamente desde una conversación de WhatsApp.
          Cuando un cliente conecta Google Calendar, solicitamos permiso para:
        </p>
        <ul>
          <li>Ver, crear y eliminar eventos en el calendario de Google que el cliente elige conectar (scope <code>calendar.events</code>).</li>
          <li>Leer el correo asociado a esa cuenta de Google (scopes <code>openid</code> y <code>email</code>), únicamente para mostrar en el panel con qué cuenta está conectado.</li>
        </ul>
        <p>Con estos datos, BrainWSP únicamente:</p>
        <ul>
          <li>Crea un evento en ese calendario cuando un agente agenda una cita desde una conversación.</li>
          <li>Muestra en el panel los eventos existentes de ese calendario (incluidos los creados por otras herramientas del cliente) para dar una vista unificada de su agenda.</li>
          <li>Elimina el evento correspondiente si la cita se cancela desde BrainWSP.</li>
        </ul>
        <p>
          Los tokens de acceso y de actualización (access/refresh token) que Google entrega se guardan cifrados en
          nuestra base de datos y solo se usan para las acciones descritas arriba. No leemos calendarios distintos al
          que el cliente conectó explícitamente, no compartimos estos datos con terceros y no los usamos para
          publicidad ni para entrenar modelos de inteligencia artificial.
        </p>
        <p>
          El uso que BrainWSP hace de la información recibida de las APIs de Google cumple con la{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Política de Datos de Usuario de los Servicios de API de Google
          </a>
          , incluidos los requisitos de Uso Limitado.
        </p>
        <p>
          Un cliente puede desconectar Google Calendar en cualquier momento desde el módulo Calendario del panel; al
          hacerlo, revocamos el acceso ante Google y eliminamos los tokens guardados.
        </p>

        <h2>3. Con quién compartimos datos</h2>
        <p>
          No vendemos datos de clientes ni de sus contactos. Los datos se comparten únicamente con los proveedores de
          infraestructura que hacen posible el servicio (hosting, base de datos, almacenamiento de archivos) bajo
          acuerdos de confidencialidad, y con WhatsApp/Meta en la medida necesaria para enviar y recibir mensajes.
        </p>

        <h2>4. Retención y eliminación</h2>
        <p>
          Conservamos los datos mientras la empresa cliente mantenga una cuenta activa en BrainWSP. Un cliente puede
          solicitar la eliminación de su cuenta y de los datos asociados escribiéndonos a través del correo de
          contacto indicado abajo.
        </p>

        <h2>5. Seguridad</h2>
        <p>
          Las contraseñas se almacenan como hash, las credenciales de integración (AUTH KEY) se guardan con hash y
          cifrado, y los tokens de Google se almacenan cifrados. El acceso al panel requiere autenticación y cada
          empresa cliente solo puede ver sus propios datos.
        </p>

        <h2>6. Tus derechos</h2>
        <p>
          Puedes solicitar acceso, corrección o eliminación de tus datos, así como revocar el acceso de BrainWSP a tu
          cuenta de Google en cualquier momento desde{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            la configuración de tu cuenta de Google
          </a>{' '}
          o desde el panel de BrainWSP.
        </p>

        <h2>7. Contacto</h2>
        <p>
          Para cualquier consulta sobre esta política o sobre tus datos, escríbenos a{' '}
          <a href="mailto:braintech.2022@gmail.com">braintech.2022@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
