import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    env: process.env.NODE_ENV,
    service: 'agy-consumption-dashboard',
    projectId: process.env.PROJECT_ID || 'irahardianto-labs',
  },
}, pino.destination({ dest: 1, sync: true }));

export default logger;
