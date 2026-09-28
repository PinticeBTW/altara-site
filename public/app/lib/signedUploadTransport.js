// Uses the exact admission's signed URL; never falls back to a public bucket.
export function uploadSignedFile({ origin, bucket, path, token, file, cacheControl = '60', onProgress, createRequest = () => new XMLHttpRequest() }) {
  const url = new URL(`/storage/v1/object/upload/sign/${[bucket, ...path.split('/')].map(encodeURIComponent).join('/')}`, origin);
  url.searchParams.set('token', token);
  return new Promise((resolve, reject) => {
    const request = createRequest();
    const fail = (code, message) => reject(Object.assign(new Error(message), { code }));
    request.open('PUT', url.href);
    request.setRequestHeader('x-upsert', 'false');
    request.timeout = 600000;
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress?.({ phase: 'uploading', loaded: Math.min(file.size, Math.round(event.loaded / event.total * file.size)), total: file.size });
    };
    request.onerror = () => fail('signed_upload_failed', 'A ligação falhou durante o envio. Tenta novamente.');
    request.ontimeout = () => fail('signed_upload_timeout', 'O envio demorou demasiado. Verifica a ligação e tenta novamente.');
    request.onabort = () => fail('signed_upload_aborted', 'O envio foi interrompido.');
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve({ error: null });
      let response = {};
      try { response = JSON.parse(request.responseText); } catch (_) {}
      const tooLarge = request.status === 413 || /EntityTooLarge|maximum allowed size|payload too large/i.test(String(response.error || '') + String(response.message || '') + String(response.code || ''));
      fail(tooLarge ? 'upload_storage_size_limit' : 'signed_upload_failed', tooLarge
        ? 'O servidor recusou o tamanho deste ficheiro. O limite de armazenamento precisa de ser corrigido.'
        : 'Não foi possível enviar o ficheiro. Tenta novamente.');
    };
    const body = new FormData();
    body.append('cacheControl', cacheControl);
    body.append('', file);
    onProgress?.({ phase: 'uploading', loaded: 0, total: file.size });
    request.send(body);
  });
}
