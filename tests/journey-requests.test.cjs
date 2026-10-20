const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const home=fs.readFileSync('index.html','utf8'),watch=fs.readFileSync('stream/index.html','utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function node(){return{hidden:true,disabled:false,value:'1',style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},innerHTML:'',textContent:''};}
function search(){
 const els={};for(const id of ['search-retry','search-error','search-results-section','main','hero','search-term','search-spinner','search-grid','search-empty','search-count'])els[id]=node();
 const pending=new Map(),rendered=[];
 const context={$:id=>els[id],searchRequest:0,currentLang:'zh',searchResults:[],searchInput:{value:''},window:{scrollTo(){},addEventListener(){}},document:{querySelectorAll:()=>[]},tmdb:path=>{const q=new URL('https://tmdb.test'+path).searchParams.get('query');if(!pending.has(q))pending.set(q,deferred());return pending.get(q).promise;},renderSearchResults(){rendered.push(context.searchResults.map(x=>x.id));}};
 vm.createContext(context);vm.runInContext(home.slice(home.indexOf('async function doSearch('),home.indexOf('function renderSearchResults(')),context);
 return{context,els,pending,rendered};
}
test('older search results cannot replace a later query',async()=>{
 const s=search(),old=s.context.doSearch('old'),fresh=s.context.doSearch('new');
 s.pending.get('new').resolve({results:[{id:2,media_type:'movie'}]});await fresh;
 s.pending.get('old').resolve({results:[{id:1,media_type:'movie'}]});await old;
 assert.equal(JSON.stringify(s.rendered),'[[2]]');
});
test('clearing a query prevents late results from reopening search',async()=>{
 const s=search(),request=s.context.doSearch('old');s.context.searchRequest++;
 s.pending.get('old').resolve({results:[{id:1,media_type:'movie'}]});await request;
 assert.equal(s.rendered.length,0);
});
test('search network failures show retry instead of a false empty-result verdict',async()=>{
 const s=search(),request=s.context.doSearch('fail');s.pending.get('fail').reject(Error('network'));await request;
 assert.equal(s.els['search-error'].hidden,false);assert.equal(s.els['search-empty'].style.display,'none');
});
function episodes(player){
 const els={};for(const id of ['season-select','episode-select','modal-watch-btn','modal-selection-status','modal-retry','episode-status','episode-retry','nextep-btn'])els[id]=node();
 els['season-select'].options=[{dataset:{eps:'3'}}];els['season-select'].selectedIndex=0;
 const pending=new Map();const context={$:id=>els[id],state:{id:12,season:1,episode:1},episodeRequest:0,episodesRequest:0,modalRequest:1,currentModalItem:{id:12},currentLang:'zh',seasonCache:{},t:x=>x,esc:x=>x,fmtDate:()=>'',updateNextBtn(){},tmdb:path=>{const gate=deferred();pending.set(path,gate);return gate.promise;}};
 vm.createContext(context);
 const source=player?watch:home,start=source.indexOf(player?'async function populateEpisodes(':'async function updateEpisodes('),end=source.indexOf(player?'function episodeCountFor(':"$('modal-retry').addEventListener",start);
 vm.runInContext(source.slice(start,end),context);return{context,els,pending};
}
for(const player of [false,true]){
 const label=player?'watch':'details';
 test(`${label}: rapid season changes reject a late old-season response`,async()=>{
  const s=episodes(player),run=()=>player?s.context.populateEpisodes(false):s.context.updateEpisodes(12);
  const old=run();s.els['season-select'].value='2';s.context.state.season=2;const fresh=run();
  s.pending.get('/tv/12/season/2').resolve({episodes:[{episode_number:1,name:'New season'}]});await fresh;
  s.pending.get('/tv/12/season/1').resolve({episodes:[{episode_number:1,name:'Old season'}]});await old;
  assert.match(s.els['episode-select'].innerHTML,/New season/);assert.doesNotMatch(s.els['episode-select'].innerHTML,/Old season/);
 });
 test(`${label}: failed episode metadata never invents a list of episodes`,async()=>{
  const s=episodes(player),request=player?s.context.populateEpisodes(false):s.context.updateEpisodes(12);
  s.pending.get('/tv/12/season/1').reject(Error('network'));await request;
  assert.equal(s.els['episode-select'].innerHTML,'<option>—</option>');
  assert.equal(s.els[player?'episode-retry':'modal-retry'].hidden,false);
  assert.equal(s.els[player?'nextep-btn':'modal-watch-btn'].disabled,true);
 });
}
test('movie metadata failure keeps the independently loading player intact',async()=>{
 let warned=false,updated=false;
 const context={currentLang:'zh',state:{id:12},tmdb:async()=>{throw Error('offline');},toast(){warned=true;},t:k=>k,updateTitleBar(){updated=true;},showFatal(){throw Error('Must not remove player');}};
 vm.createContext(context);const start=watch.indexOf('async function setupMovie(');vm.runInContext(watch.slice(start,watch.indexOf('/* ─── UTILS',start)),context);await context.setupMovie();assert.ok(warned&&updated);
});
test('TV details open immediately while season metadata is still pending',async()=>{
 const els={};for(const id of ['modal-backdrop','modal-backdrop-img','modal-type','modal-title','modal-meta','modal-genres','modal-overview','modal-close','modal-watch-btn','tv-selectors','modal-digital-release','modal'])els[id]=node();
 const classes=new Set();els['modal-backdrop'].classList={add:x=>classes.add(x)};els['modal-close'].focus=()=>{};
 const gate=deferred();const context={$:id=>els[id],modalRequest:0,modalReturnFocus:null,currentModalItem:null,document:{activeElement:null,body:{style:{}},documentElement:{style:{}}},mediaOf:x=>x.media_type,matchPct:()=>null,backdrop:()=>null,poster:()=>null,year:()=>'',rating:()=>'',genreMap:{},esc:x=>x,t:x=>x,syncModalIsolation(){},loadTvSeasons:()=>gate.promise,history:{state:{},pushState(){}},window:{},requestAnimationFrame(){}};
 vm.createContext(context);const start=home.indexOf('async function openModal(');vm.runInContext(home.slice(start,home.indexOf('/* ─── DIGITAL RELEASE BADGE',start)),context);
 const request=context.openModal({id:12,name:'TV',media_type:'tv'});
 assert.ok(classes.has('open'));assert.equal(els['modal-watch-btn'].disabled,true);await request;gate.resolve();
});

test('watch: an empty season is not reported as a network failure',async()=>{
 const s=episodes(true),request=s.context.populateEpisodes(true,5);
 s.pending.get('/tv/12/season/5').resolve({episodes:[]});await request;
 assert.equal(s.context.state.season,1);assert.equal(s.context.state.episode,1);
 assert.equal(s.els['episode-retry'].hidden,true);
 assert.equal(s.els['episode-select'].disabled,true);
 assert.match(s.els['episode-status'].textContent,/暂无/);
});
test('watch: failed season switch preserves the playing season and episode',async()=>{
 const s=episodes(true);s.context.state.episode=3;
 const request=s.context.populateEpisodes(true,2);
 assert.equal(s.context.state.season,1);
 s.pending.get('/tv/12/season/2').reject(Error('network'));await request;
 assert.equal(s.context.state.season,1);assert.equal(s.context.state.episode,3);
 assert.equal(s.els['episode-retry'].hidden,false);
});
test('watch: successful season switch commits only after episodes load',async()=>{
 const s=episodes(true);s.context.state.episode=3;
 s.els['episode-select'].options=[{value:'2'},{value:'3'}];
 const request=s.context.populateEpisodes(true,2);
 assert.equal(s.context.state.season,1);
 s.pending.get('/tv/12/season/2').resolve({episodes:[{episode_number:2,name:'Episode'}]});
 assert.equal(await request,true);assert.equal(s.context.state.season,2);
 assert.equal(s.context.state.episode,2);
});

function restoredTv({season=5,episode=3,success=true}={}) {
 const elements={};for(const id of ['tv-panel','season-select','episode-select','nextep-btn'])elements[id]=node();
 const select=elements['season-select'];select.options=[{value:'1'}];
 let value='';Object.defineProperty(select,'value',{get:()=>value,set:v=>{value=String(v)==='1'?'1':'';}});
 const loaded=[],context={$:id=>elements[id],state:{id:123542,season,episode,server:1},goNextEpisode(){},languageRequest:0,currentLang:'zh',t:k=>k,tvData:null,
  tmdb:async()=>({name:'TV',seasons:[{season_number:1,episode_count:11},{season_number:5,episode_count:0}]}),updateTitleBar(){},toast(){},
  populateEpisodes:async(_,target)=>{assert.equal(context.state.season,season);if(!success)return false;context.state.season=target;context.state.episode=1;return true;},
  applyEpisodeServerPreference(){context.state.server=4;},loadPlayer(){loaded.push({...context.state});},closeWatchDrawer(){}};
 vm.createContext(context);vm.runInContext(watch.slice(watch.indexOf('async function setupTv('),watch.indexOf('async function populateEpisodes(')),context);
 return {context,loaded};
}
test('restoring a filtered season reloads the corrected episode and source',async()=>{
 const s=restoredTv();await s.context.setupTv();
 assert.equal(s.loaded.length,1);assert.equal(s.loaded[0].season,1);assert.equal(s.loaded[0].episode,1);assert.equal(s.loaded[0].server,4);
});
test('failed recovery of a filtered season leaves the original player state intact',async()=>{
 const s=restoredTv({success:false});await s.context.setupTv();
 assert.equal(s.loaded.length,0);assert.equal(s.context.state.season,5);assert.equal(s.context.state.episode,3);
});
test('correcting an out-of-range episode also refreshes the player',async()=>{
 const s=restoredTv({season:1,episode:99});await s.context.setupTv();
 assert.equal(s.loaded.length,1);assert.equal(s.loaded[0].episode,1);
});
