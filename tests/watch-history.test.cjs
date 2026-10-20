const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(values={}){
 const elements={'season-select':{value:'1',options:[{value:'1'},{value:'2'}]},'episode-select':{value:'1',options:[{value:'1'},{value:'2'},{value:'3'}]}};
 const context={localStorage:{getItem:k=>values[k]},window:{addEventListener(){}},mediaOf:x=>x.media_type,currentLang:'zh',modalRequest:1,currentModalItem:{id:12,media_type:'tv'},seasonCache:{'zh-12-1':{episodes:[{episode_number:1},{episode_number:2},{episode_number:3}]}},tvDetails:{'zh-12':{seasons:[{season_number:1},{season_number:2,episode_count:3,air_date:'2020-01-01'}]}},$:id=>elements[id],updateEpisodes:async()=>{elements['episode-select'].value='1';}};
 vm.createContext(context);const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('/* ─── WATCH HISTORY');vm.runInContext(html.slice(start,html.indexOf('/* ─── END WATCH HISTORY',start)),context);return{context,elements};
}
const record={id:'12',type:'tv',season:1,episode:2,server:4,time:45,duration:120,updatedAt:Date.now()};
test('returning details restores actual watched episode instead of the originally opened one',async()=>{
 const {context,elements}=setup({tflix_history_v1:JSON.stringify({'tv:12':record})});await context.restoreWatchedSelection();assert.equal(elements['episode-select'].value,'2');
});
test('completed episodes advance to a real aired next episode and then next season',async()=>{
 const {context,elements}=setup();await context.applyWatchedEpisode({...record,completed:true});assert.equal(elements['episode-select'].value,'3');
 await context.applyWatchedEpisode({...record,episode:3,completed:true});assert.equal(elements['season-select'].value,'2');assert.equal(elements['episode-select'].value,'1');
});
test('future episodes are not suggested as an available next episode',async()=>{
 const {context,elements}=setup();context.seasonCache['zh-12-1'].episodes[2].air_date='2999-01-01';context.tvDetails['zh-12'].seasons=[];
 await context.applyWatchedEpisode({...record,completed:true});assert.equal(elements['episode-select'].value,'2');
});
test('existing source positions migrate and stale or malformed history is ignored',()=>{
 const {context}=setup({tflix_progress_v1:JSON.stringify({'tv:12:1:2:4':{time:45,duration:120,updatedAt:Date.now()}})});assert.equal(context.watchHistory()[0].episode,2);
 assert.equal(setup({tflix_history_v1:'{"bad":null}'}).context.watchHistory().length,0);
 assert.equal(setup({tflix_history_v1:JSON.stringify({'tv:12':{...record,updatedAt:0}})}).context.watchHistory().length,0);
});
test('broken legacy progress does not erase healthy newer watch history',()=>{
 const {context}=setup({tflix_history_v1:JSON.stringify({'tv:12':record}),tflix_progress_v1:'{broken'});assert.equal(context.watchHistory()[0].episode,2);
});
test('app Back returns directly to details even when subframes have their own history',()=>{
 const html=fs.readFileSync('stream/index.html','utf8'),start=html.indexOf("$('back-btn').addEventListener('click'"),end=html.indexOf('/* ─── INIT',start);
 let action,returned;const values=new Map([['tflix_return_v1',JSON.stringify({query:'时光代理人',filter:'tv',id:12,type:'tv'})]]);
 vm.runInNewContext(html.slice(start,end),{$:()=>({addEventListener:(name,fn)=>action=fn}),state:{id:'12',type:'tv',season:2,episode:3},sessionStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},location:{replace:url=>returned=url},history:{back(){throw Error('Must not traverse iframe history');}}});
 action();assert.equal(returned,'../index.html?return=1');const saved=JSON.parse(values.get('tflix_return_v1'));assert.equal(saved.query,'时光代理人');assert.equal(saved.selection.season,2);assert.equal(saved.selection.episode,3);
});
test('closing a returned detail never navigates back into the old player document',()=>{
 const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('function closeModal(fromPop)'),end=html.indexOf("window.addEventListener('popstate'",start);
 let replaced=false;const backdrop={classList:{contains:()=>true,remove(){}}};
 vm.runInNewContext(html.slice(start,end)+ '\ncloseModal();',{currentModalItem:{id:12,media_type:'tv'},modalRequest:1,episodesRequest:1,modalReturnFocus:null,$:id=>id==='modal-backdrop'?backdrop:{focus(){}},syncModalIsolation(){},document:{body:{style:{}},documentElement:{style:{}},querySelectorAll:()=>[]},window:{},location:{pathname:'/index.html'},history:{state:{tflixModal:true,tflixReturned:true},replaceState(){replaced=true;},back(){throw Error('Returned detail must stay on the home document');}}});
 assert.equal(replaced,true);
});
