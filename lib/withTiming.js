// Wraps an API route handler so any request slower than 1s is logged with the
// route name and duration (PART 4.7). Usage:
//   export const GET = withTiming('chat-history', async (req) => { ... });
export function withTiming(name, handler) {
  return async function timedHandler(...args) {
    const start = Date.now();
    try {
      return await handler(...args);
    } finally {
      const ms = Date.now() - start;
      if (ms > 1000) {
        console.warn(`[slow-route] /api/${name} took ${ms}ms`);
      }
    }
  };
}
