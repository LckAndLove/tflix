(function (root) {
  'use strict';
  // Apply the requested Ekko default once; subsequent manual defaults persist.
  try {
    if (typeof window !== 'undefined' && root.localStorage && !root.localStorage.getItem('tflix_ekko_default_v1')) {
      root.localStorage.setItem('tflix_server', '4');
      root.localStorage.setItem('tflix_ekko_default_v1', '1');
    }
  } catch (_) {}
  // This JSON block is also read by the Rust host and capability generator.
  const sourceData = /* TFLIX_SOURCE_DATA_START */
[
  {
    "id": 1,
    "name": "Rakan",
    "internalName": "vixsrc",
    "host": "vixsrc.to",
    "requireReferer": true,
    "sandboxEnabled": true,
    "startTimeParam": "startAt",
    "quirks": [],
    "reviewScore": 1,
    "movieUrl": "https://vixsrc.to/movie/{tmdbId}?autoPlay=true&lang=en",
    "tvUrl": "https://vixsrc.to/tv/{tmdbId}/{season}/{episode}?autoPlay=true&lang=en"
  },
  {
    "id": 2,
    "name": "Bard",
    "internalName": "moviesapi",
    "host": "moviesapi.to",
    "requireReferer": true,
    "sandboxEnabled": true,
    "startTimeParam": "startAt",
    "quirks": [],
    "reviewScore": 8,
    "movieUrl": "https://moviesapi.to/movie/{tmdbId}",
    "tvUrl": "https://moviesapi.to/tv/{tmdbId}-{season}-{episode}"
  },
  {
    "id": 3,
    "name": "Xayah",
    "internalName": "vidsrc",
    "host": "vidsrc.sh",
    "requireReferer": true,
    "sandboxEnabled": false,
    "startTimeParam": "startAt",
    "quirks": [
      "rejects-sandbox"
    ],
    "reviewScore": 4,
    "movieUrl": "https://vidsrc.sh/embed/movie?tmdb={tmdbId}&autoplay=1",
    "tvUrl": "https://vidsrc.sh/embed/tv?tmdb={tmdbId}&season={season}&episode={episode}&autoplay=1&autonext=1"
  },
  {
    "id": 4,
    "name": "Ekko",
    "internalName": "cinesrc",
    "host": "cinesrc.st",
    "requireReferer": true,
    "sandboxEnabled": true,
    "startTimeParam": "t",
    "quirks": [
      "nested-player",
      "episode-events"
    ],
    "reviewScore": 9,
    "movieUrl": "https://cinesrc.st/embed/movie/{tmdbId}?autoplay=true&prioritize=true&lastserver=wave",
    "tvUrl": "https://cinesrc.st/embed/tv/{tmdbId}?s={season}&e={episode}&autoplay=true&autonext=false&prioritize=true&lastserver=wave"
  },
  {
    "id": 5,
    "name": "Naafiri",
    "internalName": "vidfast",
    "host": "vidfast.vc",
    "requireReferer": true,
    "sandboxEnabled": false,
    "startTimeParam": "startAt",
    "quirks": [
      "rejects-sandbox"
    ],
    "reviewScore": 5,
    "movieUrl": "https://vidfast.vc/movie/{tmdbId}?autoPlay=true",
    "tvUrl": "https://vidfast.vc/tv/{tmdbId}/{season}/{episode}?autoPlay=true"
  },
  {
    "id": 6,
    "name": "Ryze",
    "internalName": "vidlink",
    "host": "vidlink.pro",
    "requireReferer": true,
    "sandboxEnabled": false,
    "startTimeParam": "startAt",
    "quirks": [
      "rejects-sandbox"
    ],
    "reviewScore": 2,
    "movieUrl": "https://vidlink.pro/movie/{tmdbId}?title=true&poster=true&autoplay=true",
    "tvUrl": "https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?title=true&poster=true&autoplay=true&nextbutton=true"
  }
]
  /* TFLIX_SOURCE_DATA_END */;
  const sources = sourceData.map(source => ({...source, buildUrl(type,tmdbId,season,episode) {
    const values={tmdbId,season,episode};
    return source[type==='movie'?'movieUrl':'tvUrl'].replace(/\{(tmdbId|season|episode)\}/g,(_,key)=>String(values[key]));
  }}));
  root.TFLIX_SOURCE_CONFIG = Object.freeze(sources.map(source => Object.freeze(source)));
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TFLIX_SOURCE_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
