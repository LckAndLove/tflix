const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const config=fs.readFileSync('stream/source-config.js','utf8');
const stream=fs.readFileSync('stream/index.html','utf8');
function context(saved={}) {
  const values=new Map(Object.entries(saved));
  const c={navigator:{language:'en-US'},localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))}};
  c.window=c;vm.createContext(c);vm.runInContext(config,c);return c;
}
test('prepared desktop and Android homepages include their shared dependency and initialize',()=>{
  execFileSync(process.execPath,['scripts/prepare-ui.mjs']);
  for(const base of ['ui','app/android/app/src/main/assets/web']) {
    assert.equal(fs.readFileSync(`${base}/stream/source-config.js`,'utf8'),config);
    const html=fs.readFileSync(`${base}/index.html`,'utf8');
    const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const c=context();
    vm.runInContext(script.slice(0,script.indexOf('let currentFilter')),c);
  }
});
test('stored defaults are preserved without migration or automatic-source flags',()=>{
  for(const id of [1,2,4,6]) {
    const c=context({tflix_server:String(id),tflix_manual_source_v1:'0'});
    const script=fs.readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
    vm.runInContext(script.slice(0,script.indexOf('let currentFilter')),c);
    assert.equal(vm.runInContext('currentServer',c),id);
    assert.equal(c.localStorage.getItem('tflix_manual_source_v1'),'0');
  }
});
test('source handoff retains current episode progress but clears it on episode changes',()=>{
  const c={state:{type:'tv',id:'1399',season:1,episode:1,server:4},progressContentKey:'tv:1399:1:1',
    latestMediaProgress:{server:4,currentTime:1200},pendingSourceSeek:{time:1200,fromServer:4}};
  vm.createContext(c);
  vm.runInContext(stream.slice(stream.indexOf('function syncProgressContent()'),stream.indexOf('function loadPlayer(')),c);
  c.state.server=6;c.syncProgressContent();assert.equal(c.pendingSourceSeek.time,1200);
  c.state.episode=2;c.syncProgressContent();assert.equal(c.pendingSourceSeek,null);assert.equal(c.latestMediaProgress,null);
});
