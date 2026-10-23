const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('stream/index.html','utf8');
const sources=require('../stream/source-config.js');
function player(search='',saved={}) {
 const values=new Map(Object.entries(saved)),elements={player:{replaceWith(frame){elements.player=frame;}}};
 let frameCount=0;
 const c={STORAGE_KEY:'tflix_server',EPISODE_SERVER_STORAGE_KEY:'tflix_episode_servers_v1',window:{TFLIX_SOURCE_CONFIG:sources},location:{href:'https://tflix.example/stream/index.html'+search,search,pathname:'/stream/index.html'},URL,URLSearchParams,
  localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))},
  document:{getElementById:id=>elements[id],createElement(){frameCount++;return {setAttribute(){}};}},
  history:{replaceState(){}},Date,
  t:k=>k,resetWatchPlaybackState(){},updateServerCards(){},
  $:id=>elements[id],isCurrentPlayerFrame:()=>true,serverName:()=> 'Ekko'};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('const SERVERS = window.TFLIX_SOURCE_CONFIG;'),html.indexOf('function serverName(')),c);
 vm.runInContext('state=readParams();loadPlayer();',c);
 return {c,elements,frames:()=>frameCount,state:()=>vm.runInContext('state',c)};
}
test('legacy automatic flags and health scores cannot override the saved manual default',()=>{
 const p=player('?type=movie&id=1288069&manual=0',{
  tflix_server:'4',tflix_manual_source_v1:'0',
  tflix_source_health_v1:JSON.stringify({version:1,sources:{4:{blockedUntil:Date.now()+999999},6:{successes:[Date.now()]}}})
 });
 assert.equal(p.state().server,4);assert.equal(p.frames(),1);

});
test('explicit source and episode preference are preserved without automatic ordering',()=>{
 assert.equal(player('?type=movie&id=1288069&server=6',{tflix_server:'4'}).state().server,6);
 assert.equal(player('?type=tv&id=1399&s=2&e=3&server=6',{
  tflix_server:'4',tflix_episode_servers_v1:JSON.stringify({'tv:1399:2:3':{server:2}})
 }).state().server,2);
});
