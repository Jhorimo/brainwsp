-- El módulo 'automations' se partió en dos permisos independientes (automations-flows,
-- automations-templates) para poder mostrar/ocultar el constructor de flujos y la galería de
-- plantillas por separado desde /admin/clients. Cualquier plan que ya incluyera 'automations'
-- en moduleKeys debe seguir dando acceso a ambos, o esos clientes perderían el módulo de golpe.
UPDATE "Plan"
SET "moduleKeys" = array_remove("moduleKeys", 'automations') || ARRAY['automations-flows', 'automations-templates']
WHERE 'automations' = ANY("moduleKeys");

-- Misma conversión para la excepción por cliente (Company.moduleOverrides, ver
-- add_company_module_overrides) por si algún admin ya la usó para tocar 'automations' antes de
-- este deploy.
UPDATE "Company"
SET "moduleOverrides" = array_remove("moduleOverrides", 'automations') || ARRAY['automations-flows', 'automations-templates']
WHERE 'automations' = ANY("moduleOverrides");
