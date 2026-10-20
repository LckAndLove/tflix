const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=require('node:fs').readFileSync('stream/index.html','utf8');
function navigation(){
 const handlers={},elements={};
 for(const id of ['back-btn','sources-btn','retry-source-btn','server-grid'])elements[id]={id,tagName:'BUTTON',visible:true,classList:{add(){},remove(){}},getClientRects(){return this.visible?[{}]:[];},focus(){handlers.focusin?.({target:this});},scrollIntoView(){},click(){this.clicks=(this.clicks||0)+1;}};
 const context={$:id=>elements[id],document:{documentElement:{classList:{add(){},remove(){}}},querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(k,f)=>handlers[k]=f},getComputedStyle:()=>({gridTemplateColumns:'100px'})};
 vm.createContext(context);const start=html.indexOf('(function () {',html.indexOf('/* ─── TV / D-PAD NAVIGATION'));
 vm.runInContext(html.slice(start,html.indexOf('</script>',start)),context);
 const key=k=>handlers.keydown({key:k,preventDefault(){}});
 return {handlers,elements,key};
}
test('Enter follows restored header focus rather than a hidden drawer action',()=>{
 const {elements,handlers,key}=navigation();key('ArrowDown');
 handlers.focusin({target:elements['retry-source-btn']});
 elements['retry-source-btn'].visible=false;
 elements['sources-btn'].focus();key('Enter');
 assert.equal(elements['sources-btn'].clicks,1);assert.equal(elements['retry-source-btn'].clicks,undefined);
});
test('Enter cannot activate a cursor target that became hidden',()=>{
 const {elements,handlers,key}=navigation();key('ArrowDown');
 handlers.focusin({target:elements['retry-source-btn']});elements['retry-source-btn'].visible=false;key('Enter');
 assert.equal(elements['retry-source-btn'].clicks,undefined);
});
