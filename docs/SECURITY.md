# Seguridad

## Credenciales de integración

`APP KEY` identifica públicamente una integración. `AUTH KEY` es un secreto aleatorio de alta entropía. El servidor almacena únicamente:

```text
SHA256(CREDENTIAL_HASH_PEPPER + ':' + AUTH_KEY)
```

El AUTH KEY se entrega una sola vez al crearlo.

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
