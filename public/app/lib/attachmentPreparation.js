// Local CPU work only: selecting a file never uploads or sends it. File objects
// are immutable and weakly held, so retries can reuse the exact smaller result.
export function createAttachmentPreparationQueue({ prepare, concurrency = 2 }) {
  const cache = new WeakMap(), queue = [];
  let active = 0;
  const pump = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      active++;
      Promise.resolve().then(() => prepare(job.file, job.kind)).then(result => {
        job.resolve(result?.size > 0 && result.size < job.file.size ? result : job.file);
      }, error => {
        cache.get(job.file)?.delete(job.kind);
        job.reject(error);
      }).finally(() => { active--; pump(); });
    }
  };
  return {
    prepare(file, kind) {
      let entries = cache.get(file);
      if (!entries) { entries = new Map(); cache.set(file, entries); }
      if (!entries.has(kind)) {
        entries.set(kind, new Promise((resolve, reject) => queue.push({ file, kind, resolve, reject })));
        pump();
      }
      return entries.get(kind);
    },
  };
}
