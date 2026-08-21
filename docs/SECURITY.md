# Seguridad

## Credenciales de integración

`APP KEY` identifica públicamente una integración. `AUTH KEY` es un secreto aleatorio de alta entropía. El servidor almacena dos cosas sobre él:

```text
authHash          = SHA256(CREDENTIAL_HASH_PEPPER + ':' + AUTH_KEY)          # autentica las peticiones entrantes, irreversible
authKeyEncrypted  = AES-256-GCM(SHA256(CREDENTIAL_ENCRYPTION_KEY), AUTH_KEY) # reversible, solo para el botón "ver AUTH KEY" del panel
```

`authHash` es lo único que se usa para validar peticiones de BrainPOS/ERP — nunca se descifra `authKeyEncrypted` en esa ruta. `authKeyEncrypted` solo se descifra cuando un OWNER/ADMIN pide verlo desde el panel (`GET /api-credentials/:id/reveal`), y cada vez que eso pasa se registra en `AuditLog`. Credenciales creadas antes de que existiera esta función no tienen `authKeyEncrypted` — hay que regenerarlas para poder verlas.

Rotar `CREDENTIAL_ENCRYPTION_KEY` invalida la capacidad de ver AUTH KEYs ya guardados (no la autenticación, que sigue dependiendo solo de `authHash`).

## Sesiones Baileys

Las credenciales y Signal keys se serializan con `BufferJSON` y se guardan en PostgreSQL. En producción se recomienda cifrar además estas columnas con una llave KMS/Envelope Encryption.

## Reglas obligatorias de producción

- TLS 1.2+ para API/panel.
- PostgreSQL y Redis sin exposición pública.
- Contraseñas distintas a las del compose local.
- Firewall entre servicios.
- Secret Manager para JWT/pepper/KMS.
- Auditoría para cambios administrativos.
- Rate limiting por IP + APP KEY.
- Allowlist opcional por IP para clientes ERP.
- Firma HMAC en webhooks.
- Política de retención/borrado de mensajes y multimedia.
- Backups cifrados.
