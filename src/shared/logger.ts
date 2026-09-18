import pino from 'pino';
import { config } from '../config/env';

export const logger = pino({
  level: config.log.level,
  base: { service: 'hotel-offer-orchestrator' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(config.env === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  }),
});

export type Logger = typeof logger;
