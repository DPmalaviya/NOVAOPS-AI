import { APP_VERSION, type HealthResponse } from '@novaops/shared'
export interface Env {}
const headers = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }
export default { async fetch(request: Request): Promise<Response> { const url = new URL(request.url); if (request.method === 'GET' && url.pathname === '/api/health') { const body: HealthResponse = { status: 'ok', service: 'novaops-worker', version: APP_VERSION, timestamp: new Date().toISOString() }; return Response.json(body, { headers }); } return Response.json({ code: 'NOT_FOUND', message: 'Route not found.' }, { status: 404, headers }); } } satisfies ExportedHandler<Env>
