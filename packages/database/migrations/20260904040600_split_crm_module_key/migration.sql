-- El módulo 'crm' se partió en tres permisos independientes (crm-leads, crm-deals,
-- crm-pipelines) para poder activar/desactivar Prospectos, Tratos y Pipelines por separado
-- desde /admin/clients. Cualquier plan que ya incluyera 'crm' en moduleKeys debe seguir dando
-- acceso a los tres, o esos clientes perderían CRM de golpe con el deploy.
UPDATE "Plan"
SET "moduleKeys" = array_remove("moduleKeys", 'crm') || ARRAY['crm-leads', 'crm-deals', 'crm-pipelines']
WHERE 'crm' = ANY("moduleKeys");
