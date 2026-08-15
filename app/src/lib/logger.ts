import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    env: process.env.NODE_ENV,
    service: 'agy-consumption-dashboard',
    projectId: process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined,
  },
}, typeof window === 'undefined' && typeof pino.destination === 'function' ? pino.destination({ dest: 1, sync: true }) : undefined);

export default logger;
