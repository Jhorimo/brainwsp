// Un plan puede tener su precio real en `price` (soles) o en `priceUsd` (dólares) — nunca los
// dos a la vez con sentido (ver CreatePlanDto). Ordenar solo por `price` deja todos los planes
// en USD empatados en 0 y el orden queda arbitrario. Mismo criterio que ya usa el frontend en
// formatPrice()/formatPrices() para decidir qué monto mostrar.
export function effectivePlanPrice(plan: { price: number; priceUsd: number }): number {
  return plan.priceUsd || plan.price;
}

export function sortPlansByPrice<T extends { price: number; priceUsd: number }>(plans: T[]): T[] {
  return [...plans].sort((a, b) => effectivePlanPrice(a) - effectivePlanPrice(b));
}
