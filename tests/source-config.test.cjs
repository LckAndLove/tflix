const {test}=require('node:test');
const assert=require('node:assert/strict');
const sources=require('../stream/source-config.js');

test('shared adapter preserves each legacy movie and episode URL exactly',()=>{
  const movie=[
    'https://vixsrc.to/movie/1288069?autoPlay=true&lang=en',
    'https://moviesapi.to/movie/1288069',
    'https://vidsrc.sh/embed/movie?tmdb=1288069&autoplay=1',
    'https://cinesrc.st/embed/movie/1288069?autoplay=true&prioritize=true&lastserver=wave',
    'https://vidfast.vc/movie/1288069?autoPlay=true',
    'https://vidlink.pro/movie/1288069?title=true&poster=true&autoplay=true'
  ];
  const tv=[
    'https://vixsrc.to/tv/1399/2/3?autoPlay=true&lang=en',
    'https://moviesapi.to/tv/1399-2-3',
    'https://vidsrc.sh/embed/tv?tmdb=1399&season=2&episode=3&autoplay=1&autonext=1',
    'https://cinesrc.st/embed/tv/1399?s=2&e=3&autoplay=true&autonext=false&prioritize=true&lastserver=wave',
    'https://vidfast.vc/tv/1399/2/3?autoPlay=true',
    'https://vidlink.pro/tv/1399/2/3?title=true&poster=true&autoplay=true&nextbutton=true'
  ];
  assert.deepEqual(sources.map(source=>source.buildUrl('movie','1288069',2,3)),movie);
  assert.deepEqual(sources.map(source=>source.buildUrl('tv','1399',2,3)),tv);
});

test('every adapter declares embedding behavior for the desktop bridge',()=>{
  assert.deepEqual(sources.map(source=>source.sandboxEnabled),[true,true,false,true,false,false]);
  assert.ok(sources.every(source=>source.host&&source.internalName&&typeof source.buildUrl==='function'));
  assert.deepEqual(sources.map(source=>source.startTimeParam),['startAt','startAt','startAt','t','startAt','startAt']);
});
