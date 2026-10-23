const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('stream/index.html','utf8');
const sources=require('../stream/source-config.js');

// Execute the whole watch page: errors must not introduce a blocking layer or
// replace the provider, including while metadata and iframe loading are pending.
function watch(desktop=false) {
 const elements=new Map(),cards=[],handlers={},timers=new Map(),values=new Map();
 let timerId=0,now=0,frames=0;
 function node(id='') {
  const classes=new Set();
  return {id,dataset:{},style:{},hidden:false,disabled:false,children:[],contentWindow:{frames:[]},
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},
   setAttribute(){},addEventListener(name,fn){(this.listeners ||= {})[name]=fn;},querySelector(){return null;},querySelectorAll(){return [];},focus(){},
   appendChild(child){this.children.push(child);if(this.id==='server-grid')cards.push(child);},
   replaceWith(child){frames++;elements.set(this.id,child);}};
 }
 for(const match of html.matchAll(/\bid="([^"]+)"/g))elements.set(match[1],node(match[1]));
 for(const id of ['watch-drawer','drawer-scrim'])elements.get(id).hidden=true;
 const window={TFLIX_SOURCE_CONFIG:sources,addEventListener(name,fn){(handlers[name] ||= []).push(fn);}};
 if(desktop)window.__TFLIX_PLAYER_ORIGIN__='http://127.0.0.1:12345/';
 const context={window,document:{getElementById:id=>elements.get(id),createElement:()=>node(),querySelector:()=>null,
  querySelectorAll:selector=>selector==='.server-card'?cards:[],addEventListener(){},body:node(),documentElement:node()},
  location:{href:'https://tflix.test/stream/index.html?type=movie&id=550',pathname:'/stream/index.html',search:'?type=movie&id=550'},
  localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))},navigator:{language:'zh-CN'},
  history:{replaceState(){}},URL,URLSearchParams,AbortSignal:{timeout(){}},fetch:()=>new Promise(()=>{}),
  setTimeout(fn,ms){timers.set(++timerId,{fn,at:now+ms});return timerId;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 return {elements,cards,context,frames:()=>frames,
  send(type){for(const handler of handlers.message||[])handler({source:elements.get('player').contentWindow,data:{type}});},
  advance(ms){now+=ms;for(const [id,timer] of timers)if(timer.at<=now){timers.delete(id);timer.fn();}}};
}
for(const desktop of [false,true]) {
 test(`${desktop?'desktop':'web/Android'} playback remains directly accessible after slow loading and error signals`,()=>{
  const p=watch(desktop),frame=p.elements.get('player');
  const expected=sources.find(s=>s.id===4).buildUrl('movie','550',1,1);
  assert.equal(desktop?new URL(frame.src).searchParams.get('src'):frame.src,expected);
  p.advance(30_000);
  for(const type of ['tflix:media-error','tflix:embed-blocked','tflix:media-ready','tflix:media-playing'])p.send(type);
  p.advance(30_000);
  assert.equal(p.elements.get('player'),frame);assert.equal(p.frames(),1);
  assert.equal(p.elements.has('player-loading'),false);assert.equal(p.elements.has('playback-failure'),false);
  assert.equal(vm.runInContext('state.server',p.context),4);
  // Manual selection must remain available after failures.
  p.cards.find(card=>card.dataset.id===6).listeners.click();
  assert.equal(vm.runInContext('state.server',p.context),6);assert.equal(p.frames(),2);
 });
}
