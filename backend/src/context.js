// Who is making the change, available to code that is nowhere near the request.
//
// store.js knows how to write a fuel load but not who asked for it, and threading a
// user through every function only to reach the audit trail would clutter every
// signature on the way. An AsyncLocalStorage carries it alongside the request instead:
// set once in the middleware, read wherever it is needed.
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/** Run the rest of the request with this actor attached. */
export const withActor = (actor, ip, fn) => storage.run({ actor, ip }, fn);

/** The signed-in user behind the change, or null outside a request (a worker, the seeder). */
export const currentActor = () => storage.getStore()?.actor || null;
export const currentIp = () => storage.getStore()?.ip || '';
