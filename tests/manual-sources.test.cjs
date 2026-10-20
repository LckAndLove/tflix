const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('stream/index.html','utf8');
const sources=require('../stream/source-config.js');
function player(search='',saved={}) {
 const values=new Map(Object.entries(saved)),timers=[],elements={
  'player-loading':{classList:{add(){},remove(){}}},'playback-failure':{hidden:true},
  player:{replaceWith(frame){elements.player=frame;}}
 };
 let frameCount=0;
 const c={STORAGE_KEY:'tflix_server',EPISODE_SERVER_STORAGE_KEY:'tflix_episode_servers_v1',window:{TFLIX_SOURCE_CONFIG:sources},location:{href:'https://tflix.example/stream/index.html'+search,search,pathname:'/stream/index.html'},URL,URLSearchParams,
  localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))},
  document:{getElementById:id=>elements[id],createElement(){frameCount++;return {setAttribute(){}};}},
  history:{replaceState(){}},Date,clearTimeout(){},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},
  t:k=>k,resetWatchPlaybackState(){},updateSourceStatus(){},updateServerCards(){},
  hidePlaybackFailure(){elements['playback-failure'].hidden=true;},showPlaybackFailure(){elements['playback-failure'].hidden=false;},
  $:id=>elements[id],isCurrentPlayerFrame:()=>true,serverName:()=> 'Ekko'};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('const SERVERS = window.TFLIX_SOURCE_CONFIG;'),html.indexOf('function serverName(')),c);
 vm.runInContext('state=readParams();loadPlayer();',c);
 vm.runInContext(html.slice(html.indexOf('function onPlayerMediaEvent('),html.indexOf('function isCurrentPlayerFrame(')),c);
 return {c,elements,timers,frames:()=>frameCount,state:()=>vm.runInContext('state',c)};
}
test('legacy automatic flags and health scores cannot override the saved manual default',()=>{
 const p=player('?type=movie&id=1288069&manual=0',{
  tflix_server:'4',tflix_manual_source_v1:'0',
  tflix_source_health_v1:JSON.stringify({version:1,sources:{4:{blockedUntil:Date.now()+999999},6:{successes:[Date.now()]}}})
 });
 assert.equal(p.state().server,4);assert.equal(p.frames(),1);
 for(const timer of p.timers)timer.fn();
 assert.equal(p.state().server,4);assert.equal(p.frames(),1);assert.equal(p.elements['playback-failure'].hidden,true);
 p.c.onPlayerMediaEvent({source:{},data:{type:'tflix:media-error'}});
 assert.equal(p.state().server,4);assert.equal(p.frames(),1);assert.equal(p.elements['playback-failure'].hidden,false);
 p.elements.player.onload();assert.equal(p.elements['playback-failure'].hidden,true);
});
test('explicit source and episode preference are preserved without automatic ordering',()=>{
 assert.equal(player('?type=movie&id=1288069&server=6',{tflix_server:'4'}).state().server,6);
 assert.equal(player('?type=tv&id=1399&s=2&e=3&server=6',{
  tflix_server:'4',tflix_episode_servers_v1:JSON.stringify({'tv:1399:2:3':{server:2}})
 }).state().server,2);
});
