/**
 * Pages Function: forward every /api/* request to the reelearn-api Worker through the
 * API service binding. Keeps the frontend same-origin (no CORS) and the Worker URL private.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  return env.API.fetch(request);
};
