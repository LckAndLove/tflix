const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script data-startup>([\s\S]*?)<\/script>/)[1];
function startup(){
 let now=0,next=0,removed=false,leaving=false;const timers=new Map();
 const context={window:{},Date:{now:()=>now},document:{getElementById:()=>({classList:{add:()=>{leaving=true;}},remove(){removed=true;}})},setTimeout(fn,delay){const id=++next;timers.set(id,{fn,time:now+delay});return id;},clearTimeout(id){timers.delete(id);}};
 vm.createContext(context);vm.runInContext(script,context);
 const advance=target=>{while(true){const entry=[...timers].filter(([,t])=>t.time<=target).sort((a,b)=>a[1].time-b[1].time)[0];if(!entry)break;now=entry[1].time;timers.delete(entry[0]);entry[1].fn();}now=target;};
 return{context,advance,leaving:()=>leaving,removed:()=>removed};
}
test('fast startup keeps the cover briefly and then removes it',()=>{
 const s=startup();s.context.window.finishStartup();s.advance(1099);assert.equal(s.leaving(),false);
 s.advance(1100);assert.equal(s.leaving(),true);s.advance(1350);assert.equal(s.removed(),true);
});
test('hung or broken main script cannot keep the startup cover forever',()=>{
 const s=startup();s.advance(3500);assert.equal(s.leaving(),true);s.advance(3750);assert.equal(s.removed(),true);
});
test('late or repeated completion never restores or delays an expired cover',()=>{
 const s=startup();s.advance(4000);s.context.window.finishStartup();s.context.window.finishStartup();s.advance(5000);assert.equal(s.removed(),true);
});
test('data becoming ready after the minimum dismisses without waiting for the cap',()=>{
 const s=startup();s.advance(1800);s.context.window.finishStartup();s.advance(2050);assert.equal(s.removed(),true);
});
test('CSS also dismisses the cover if JavaScript is unavailable',()=>{
 assert.match(html,/@keyframes startup-safety/);assert.match(html,/animation:startup-safety 0s 4s forwards/);
});
