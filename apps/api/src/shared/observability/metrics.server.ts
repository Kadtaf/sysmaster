import { Logger } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import { registry } from './metrics';

/** Petit serveur HTTP dédié : GET /metrics au format Prometheus. */
export function startMetricsServer(port: number): Server {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    registry
      .metrics()
      .then((body) => res.writeHead(200, { 'content-type': registry.contentType }).end(body))
      .catch((err: Error) => res.writeHead(500).end(err.message));
  });
  server.listen(port, '0.0.0.0', () => Logger.log(`Métriques Prometheus sur :${port}/metrics`, 'Bootstrap'));
  return server;
}
