// Optional client-side helpers for better DX

interface LogContext {
  component?: string;
  userId?: string;
  [key: string]: any;
}

/**
 * Enhanced console.log with automatic component context
 * @example
 * import { log } from '@browser-echo/next/client';
 * 
 * function MyComponent() {
 *   log.info('Component mounted', { component: 'MyComponent' });
 *   log.error('Something went wrong', { error: err, component: 'MyComponent' });
 * }
 */
export const log = {
  debug: (message: string, context?: LogContext) => {
    console.debug(message, context ? `[Context: ${JSON.stringify(context)}]` : '');
  },
  info: (message: string, context?: LogContext) => {
    console.info(message, context ? `[Context: ${JSON.stringify(context)}]` : '');
  },
  warn: (message: string, context?: LogContext) => {
    console.warn(message, context ? `[Context: ${JSON.stringify(context)}]` : '');
  },
  error: (message: string | Error, context?: LogContext) => {
    console.error(message, context ? `[Context: ${JSON.stringify(context)}]` : '');
  },
  group: (label: string, fn: () => void) => {
    console.group(label);
    try {
      fn();
    } finally {
      console.groupEnd();
    }
  }
};

/**
 * React hook for component-scoped logging
 * @example
 * function MyComponent() {
 *   const log = useLogger('MyComponent');
 *   
 *   useEffect(() => {
 *     log.info('Component mounted');
 *     return () => log.info('Component unmounted');
 *   }, []);
 * }
 */
export function useLogger(componentName: string) {
  return {
    debug: (message: string, extra?: any) => 
      log.debug(message, { component: componentName, ...extra }),
    info: (message: string, extra?: any) => 
      log.info(message, { component: componentName, ...extra }),
    warn: (message: string, extra?: any) => 
      log.warn(message, { component: componentName, ...extra }),
    error: (message: string | Error, extra?: any) => 
      log.error(message, { component: componentName, ...extra }),
  };
}

/**
 * Performance logging helper
 * @example
 * const timer = logPerf.start('api-call');
 * const data = await fetchData();
 * timer.end(); // Logs: "[Performance] api-call took 123ms"
 */
export const logPerf = {
  start: (label: string) => {
    const startTime = performance.now();
    return {
      end: (extraInfo?: any) => {
        const duration = performance.now() - startTime;
        console.info(`[Performance] ${label} took ${duration.toFixed(2)}ms`, extraInfo || '');
      }
    };
  },
  measure: async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const timer = logPerf.start(label);
    try {
      const result = await fn();
      timer.end();
      return result;
    } catch (error) {
      timer.end({ error: true });
      throw error;
    }
  }
};
