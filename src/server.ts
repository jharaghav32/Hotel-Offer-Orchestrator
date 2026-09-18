import { createApp } from './app';
import { config } from './config/env';
import { logger } from './shared/logger';

const app = createApp();

const server = app.listen(config.http.port, () => {
  logger.info({ port: config.http.port, env: config.env }, 'API server listening');
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'API server failed to start');
  process.exit(1);
});
