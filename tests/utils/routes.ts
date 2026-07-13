/* Helper to expose routes defined in `config/routes.json` to tests. */

// Use require so this works without special TS JSON import settings.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const routesConfig = require('../../config/routes.json');

type RoutesConfig = {
  baseUrl?: string;
  routes?: string[];
};

const cfg: RoutesConfig = routesConfig || {};

export function baseUrl(): string {
  return process.env.BASE_URL || cfg.baseUrl || 'https://example.com';
}

export function allRoutes(): string[] {
  return cfg.routes || ['/'];
}

export function routeAt(index = 0): string {
  const routes = allRoutes();
  const path = routes[Math.max(0, Math.min(index, routes.length - 1))] || '/';
  // ensure leading slash
  return path.startsWith('/') ? path : `/${path}`;
}

export function urlFor(index = 0): string {
  return `${baseUrl()}${routeAt(index)}`;
}

export default {
  baseUrl,
  allRoutes,
  routeAt,
  urlFor,
};
