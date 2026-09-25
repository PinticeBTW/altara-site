const en = {
  media: 'Media viewer', close: 'Close', download: 'Download', previous: 'Previous media', next: 'Next media',
  favorite: 'Add to favorites', unfavorite: 'Remove from favorites', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
  native: 'Original size · 100%', fit: 'Fit', retry: 'Try again', unavailable: 'Could not load the full media.',
  play: 'Play', pause: 'Pause', mute: 'Mute', unmute: 'Unmute', fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen',
  seek: 'Video position', volume: 'Video volume', speed: 'Playback speed', image: 'Image', video: 'Video',
};
const pt = {
  media: 'Visualizador de multimédia', close: 'Fechar', download: 'Transferir', previous: 'Multimédia anterior', next: 'Multimédia seguinte',
  favorite: 'Adicionar aos favoritos', unfavorite: 'Remover dos favoritos', zoomIn: 'Ampliar', zoomOut: 'Reduzir',
  native: 'Tamanho original · 100%', fit: 'Ajustar', retry: 'Tentar novamente', unavailable: 'Não foi possível carregar o conteúdo completo.',
  play: 'Reproduzir', pause: 'Pausar', mute: 'Silenciar', unmute: 'Ativar som', fullscreen: 'Ecrã inteiro', exitFullscreen: 'Sair do ecrã inteiro',
  seek: 'Posição do vídeo', volume: 'Volume do vídeo', speed: 'Velocidade de reprodução', image: 'Imagem', video: 'Vídeo',
};
export function mediaLightboxLabels(locale) {
  return locale === 'pt-BR' ? { ...pt, media: 'Visualizador de mídia', download: 'Baixar', previous: 'Mídia anterior', next: 'Próxima mídia', fullscreen: 'Tela cheia', exitFullscreen: 'Sair da tela cheia' }
    : locale === 'pt-PT' ? pt : en;
}
