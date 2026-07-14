/**
 * Public surface of the typed Mission Control API client.
 *
 * Import from `@/api` (or `../api`) rather than reaching into `client`/`schema`
 * directly, so later units get a stable entry point.
 */
export * from './client'
export type { paths, components, operations } from './schema'
