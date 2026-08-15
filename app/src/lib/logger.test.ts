import { describe, it, expect } from 'vitest';
import logger from './logger';

describe('logger service', () => {
  it('should be defined and expose standard log levels', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should log structured metadata without throwing errors', () => {
    expect(() => {
      logger.info({ operation: 'test_op', testKey: 'testValue' }, 'Test log message');
      logger.error({ operation: 'test_error', err: new Error('test') }, 'Test error message');
    }).not.toThrow();
  });
});
