const {test}=require('node:test');const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function progress(current=true){
 const values=new Map(),sent=[],source={postMessage:x=>sent.push(x)},state={type:'tv',id:'12',season:1,episode:1,server:4};let receive;
 const context={state,currentLang:'zh',window:{addEventListener:(type,fn)=>receive=fn},localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},isCurrentPlayerFrame:()=>current,toast(){}};
 vm.createContext(context);const html=fs.readFileSync('stream/index.html','utf8'),start=html.indexOf('/* ─── WATCH PROGRESS');vm.runInContext(html.slice(start,html.indexOf('/* ─── END WATCH PROGRESS',start)),context);
 return{state,sent,values,send:(type,time=30,duration=120,ended=false,identity={})=>receive({source,data:{type,currentTime:time,duration,ended,...identity}})};
}
test('same-episode same-provider resume is sent once after matching duration readiness',()=>{
 const p=progress();p.send('tflix:media-progress');p.send('tflix:media-ready',0);p.send('tflix:media-ready',0);
 assert.equal(p.sent.length,1);assert.equal(p.sent[0].time,30);
});
test('positions never carry into another episode, provider or video duration',()=>{
 for(const [change,duration] of [[p=>p.state.episode++,120],[p=>p.state.server++,120],[p=>{},150]]){
  const p=progress();p.send('tflix:media-progress');change(p);p.send('tflix:media-ready',0,duration);assert.equal(p.sent.length,0);
 }
});
test('old frames cannot overwrite progress and completion clears the saved position',()=>{
 const stale=progress(false);stale.send('tflix:media-progress');assert.equal(stale.values.size,0);
 const p=progress();p.send('tflix:media-progress');p.send('tflix:media-progress',119,120,true);p.send('tflix:media-ready',0);assert.equal(p.sent.length,0);
});
test('corrupted stored positions do not break playback readiness',()=>{
 const p=progress();p.values.set('tflix_progress_v1','{"broken":null}');p.send('tflix:media-ready');assert.equal(p.sent.length,0);
});
test('native media seek accepts only the app top frame and compatible duration',()=>{
 let receive;const listeners={},video={currentTime:0,duration:120,readyState:2,isConnected:true,addEventListener:(n,f)=>listeners[n]=f};const top={postMessage(){}};
 const window={top,self:{},addEventListener:(n,f)=>receive=f};
 vm.runInNewContext(fs.readFileSync('src-tauri/src/player_monitor.js','utf8'),{window,document:{body:{innerText:''},querySelectorAll:()=>[video]},MutationObserver:class{observe(){}}});
 receive({source:{},data:{type:'tflix:resume',time:30,duration:120}});assert.equal(video.currentTime,0);
 receive({source:top,data:{type:'tflix:resume',time:30,duration:140}});assert.equal(video.currentTime,0);
 receive({source:top,data:{type:'tflix:resume',time:30,duration:120}});assert.equal(video.currentTime,30);
});

test('old episode progress is ignored while an internal provider selection is loading',()=>{
 const p=progress();p.state.episode=2;p.send('tflix:media-progress',30,120,false,{mediaType:'tv',mediaId:'12',season:1,episode:1});assert.equal(p.values.size,0);
 p.send('tflix:media-progress',20,120,false,{mediaType:'tv',mediaId:'12',season:1,episode:2});assert.equal(p.values.size,1);
});
