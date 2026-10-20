const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('stream/index.html','utf8');
function watch(){
  const handlers={},elements={};let focused;
  for(const id of ['watch-drawer','drawer-scrim','episodes-btn','sources-btn','drawer-close','drawer-title','selected-source']) elements[id]={id,hidden:true,dataset:{},style:{removeProperty(name){delete this[name==='max-height'?'maxHeight':name];}},getBoundingClientRect(){return {width:200,right:1250,bottom:60};},attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){focused=this;},addEventListener(k,v){handlers[id+':'+k]=v;}};
  elements['watch-drawer'].querySelector=()=>elements['selected-source'];
  elements['watch-drawer'].querySelectorAll=()=>[elements['drawer-close'],elements['sources-btn']];
  for(const el of Object.values(elements)) el.getClientRects=()=>[{}];
  const context={revealWatchControls(){},$:id=>elements[id],t:k=>k,window:{addEventListener:(k,v)=>handlers[k]=v},document:{documentElement:{clientWidth:1400,clientHeight:880},addEventListener:(k,v)=>handlers[k]=v,activeElement:null},loadPlayer(){throw Error('Settings must not reload playback');}};
  vm.createContext(context);
  const start=html.indexOf('/* Watch settings float');
  vm.runInContext(html.slice(start,html.indexOf('/* ─── NAV ─── */',start)),context);
  return {context,elements,handlers,get focused(){return focused;}};
}
test('settings switch panels without reloading media and Escape restores trigger focus',()=>{
 const w=watch();w.context.openWatchDrawer('sources');
 assert.equal(w.elements['watch-drawer'].hidden,false);
 assert.equal(w.elements['sources-btn'].attrs['aria-expanded'],'true');
 w.context.openWatchDrawer('episodes');
 assert.equal(w.elements['watch-drawer'].dataset.panel,'episodes');
 w.handlers.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(w.elements['watch-drawer'].hidden,true);
 assert.equal(w.elements['drawer-scrim'].hidden,true);
 assert.equal(w.focused.id,'episodes-btn');
});
test('Tab stays inside open settings',()=>{
 const w=watch();w.context.openWatchDrawer('sources');
 w.context.document.activeElement=w.elements['sources-btn'];let prevented=false;
 w.handlers.keydown({key:'Tab',shiftKey:false,preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(w.focused.id,'drawer-close');
});

test('source picker focuses the current source and Escape returns to its trigger',()=>{
 const w=watch();w.context.openWatchDrawer('sources');
 assert.equal(w.focused.id,'selected-source');
 w.handlers.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(w.focused.id,'sources-btn');
});

test('source dropdown anchors below its button and realigns after viewport resize',()=>{
 const w=watch();w.context.openWatchDrawer('sources');
 const style=w.elements['watch-drawer'].style;
 assert.equal(style.top,'66px');assert.equal(style.right,'150px');
 w.context.document.documentElement.clientWidth=1100;
 w.elements['sources-btn'].getBoundingClientRect=()=>({right:1050,bottom:56});
 w.handlers.resize();assert.equal(style.right,'50px');assert.equal(style.top,'62px');
 w.context.openWatchDrawer('episodes');
 assert.equal(style.right,undefined);assert.equal(style.top,undefined);
});
