// Work for the same key runs one after another; different keys run side by side. In this server process
// only, which is all the demo runs.

const tails = new Map<string, Promise<unknown>>()

export function oneAtATime<T>(key: string, work: () => Promise<T>): Promise<T> {
  // A failed job doesn't block the next one for the same key.
  const run = (tails.get(key) ?? Promise.resolve()).then(() => {}, () => {}).then(work)
  tails.set(key, run)
  const done = () => { if (tails.get(key) === run) tails.delete(key) }
  run.then(done, done)
  return run
}
