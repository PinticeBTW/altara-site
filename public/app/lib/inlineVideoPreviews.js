// One observer for the current timeline. Only near-visible, authorized videos
// request metadata/first-frame data; this never starts playback.
export function createInlineVideoPreviews({ authorize, record = () => {} }) {
  const watched = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const video = entry.target;
      observer.unobserve(video); watched.delete(video);
      if (!video.isConnected || video.getAttribute('src')) continue;
      const media = authorize(video);
      if (!media?.url) continue;
      video.preload = 'metadata';
      if (media.previewUrl) video.poster = media.previewUrl;
      video.dataset.mediaSrc = media.url;
      video.src = media.url;
      record(video, media.url);
    }
  }, { rootMargin: '120px', threshold: .01 });
  return {
    bind(root) {
      for (const video of watched) if (!video.isConnected) { observer.unobserve(video); watched.delete(video); }
      root.querySelectorAll('.msg__videoPlayer video').forEach(video => {
        if (watched.has(video) || video.getAttribute('src')) return;
        watched.add(video); observer.observe(video);
      });
    },
    dispose() { observer.disconnect(); watched.clear(); },
  };
}
