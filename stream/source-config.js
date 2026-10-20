(function (root) {
  'use strict';
  const sources = [
    { id: 1, name: 'Rakan', internalName: 'vixsrc', host: 'vixsrc.to', requireReferer: true, sandboxEnabled: true, startTimeParam:'startAt', quirks: [], buildUrl(type, tmdbId, season, episode) { return type === 'movie' ? `https://vixsrc.to/movie/${tmdbId}?autoPlay=true&lang=en` : `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}?autoPlay=true&lang=en`; } },
    { id: 2, name: 'Bard', internalName: 'moviesapi', host: 'moviesapi.to', requireReferer: true, sandboxEnabled: true, startTimeParam:'startAt', quirks: [], buildUrl(type, tmdbId, season, episode) { return type === 'movie' ? `https://moviesapi.to/movie/${tmdbId}` : `https://moviesapi.to/tv/${tmdbId}-${season}-${episode}`; } },
    { id: 3, name: 'Xayah', internalName: 'vidsrc', host: 'vidsrc.sh', requireReferer: true, sandboxEnabled: false, startTimeParam:'startAt', quirks: ['rejects-sandbox'], buildUrl(type, tmdbId, season, episode) { return type === 'movie' ? `https://vidsrc.sh/embed/movie?tmdb=${tmdbId}&autoplay=1` : `https://vidsrc.sh/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}&autoplay=1&autonext=1`; } },
    { id: 4, name: 'Ekko', internalName: 'cinesrc', host: 'cinesrc.st', requireReferer: true, sandboxEnabled: true, startTimeParam:'t', quirks: ['nested-player', 'episode-events'], buildUrl(type, tmdbId, season, episode) { return type === 'movie' ? `https://cinesrc.st/embed/movie/${tmdbId}?autoplay=true&prioritize=true&lastserver=wave` : `https://cinesrc.st/embed/tv/${tmdbId}?s=${season}&e=${episode}&autoplay=true&autonext=false&prioritize=true&lastserver=wave`; } },
    { id: 5, name: 'Naafiri', internalName: 'vidfast', host: 'vidfast.vc', requireReferer: true, sandboxEnabled: false, startTimeParam:'startAt', quirks: ['rejects-sandbox'], buildUrl(type, tmdbId, season, episode) { return type === 'movie' ? `https://vidfast.vc/movie/${tmdbId}?autoPlay=true` : `https://vidfast.vc/tv/${tmdbId}/${season}/${episode}?autoPlay=true`; } },
    { id: 6, name: 'Ryze', internalName: 'vidlink', host: 'vidlink.pro', requireReferer: true, sandboxEnabled: false, startTimeParam:'startAt', quirks: ['rejects-sandbox'], buildUrl(type, tmdbId, season, episode) { return type === 'movie' ? `https://vidlink.pro/movie/${tmdbId}?title=true&poster=true&autoplay=true` : `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}?title=true&poster=true&autoplay=true&nextbutton=true`; } }
  ];
  root.TFLIX_SOURCE_CONFIG = Object.freeze(sources.map(source => Object.freeze(source)));
  // Old releases stored explicit defaults without a separate manual flag.
  // Record fresh installs too, so their generated default is never migrated later.
  try {
    const storage = root.localStorage;
    if (storage && storage.getItem('tflix_manual_source_v1') === null) {
      const saved = Number(storage.getItem('tflix_server'));
      storage.setItem('tflix_manual_source_v1', sources.some(source => source.id === saved) ? '1' : '0');
    }
  } catch (_) {}
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TFLIX_SOURCE_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
