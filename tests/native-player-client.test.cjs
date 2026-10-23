const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync('stream/native-player-client.js','utf8');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture(){
 const handlers={},requests=[],commands=[],opened=[];
 const window={__TFLIX_NATIVE_PLAYER__:true,__TAURI__:{core:{invoke:(name,args)=>{
  commands.push({name,args});if(name==='open_native_player'){const task=deferred();requests.push(task);opened.push(args.request);return task.promise;}return Promise.resolve();
 }},event:{listen:(name,handler)=>{handlers[name]=handler;return Promise.resolve(()=>{});}}}};
 vm.runInNewContext(code,{window});
 return {client:window.TFLIX_NATIVE_PLAYER,requests,commands,opened,
  emit:data=>handlers['native-player-event']({payload:data}),close:session=>handlers['native-player-closed']({payload:session})};
}
const request={id:'123542',server:4,season:1,episode:3};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('metadata that arrives during window creation is applied after the native session opens',async()=>{
 const f=fixture(),opening=f.client.open(request);await tick();
 await f.client.update({...request,title:'Title'});f.requests[0].resolve(1);await opening;
 assert.equal(f.commands.at(-1).name,'update_native_player');assert.equal(f.commands.at(-1).args.model.title,'Title');
});
test('switching windows rejects stale progress and stale close notifications',async()=>{
 const f=fixture(),media=[],closed=[];f.client.onMedia=e=>media.push(e);f.client.onClose=()=>closed.push(true);
 const first=f.client.open(request);await tick();f.requests[0].resolve(1);await first;
 f.emit({session:1,frameId:1,type:'tflix:media-ready'});const oldFrame=media[0].source;
 const next=f.client.open({...request,episode:4});f.emit({session:1,frameId:1,type:'tflix:media-progress'});f.close(1);
 assert.equal(media.length,1);assert.equal(closed.length,0);assert.equal(f.client.isCurrentFrame(oldFrame),false);
 await tick();f.requests[1].resolve(2);await next;
 f.emit({session:2,frameId:1,type:'tflix:media-ready'});assert.equal(media.length,2);
 media[1].source.postMessage({type:'tflix:resume',time:30,duration:120});
 assert.equal(f.commands.at(-1).name,'send_native_player');assert.equal(f.commands.at(-1).args.session,2);
 f.close(2);assert.equal(closed.length,1);
});
test('rapid episode selections serialize window creation and accept only the latest session',async()=>{
 const f=fixture(),media=[];f.client.onMedia=e=>media.push(e);
 const first=f.client.open(request);await tick();const next=f.client.open({...request,episode:4});
 f.requests[0].resolve(1);await first;f.emit({session:1,frameId:1,type:'tflix:media-ready'});assert.equal(media.length,0);
 await tick();f.requests[1].resolve(2);await next;f.emit({session:2,frameId:1,type:'tflix:media-ready'});assert.equal(media.length,1);
});
test('leaving native mode during creation closes the eventual window without returning to details',async()=>{
 const f=fixture(),opening=f.client.open(request);await tick();const closing=f.client.close();
 f.requests[0].resolve(1);await opening;await closing;
 assert.equal(f.commands.at(-1).name,'close_native_player');assert.equal(f.commands.at(-1).args.session,1);
});
test('web and Android do not initialize the desktop player channel',()=>{
 const window={};vm.runInNewContext(code,{window});assert.equal(window.TFLIX_NATIVE_PLAYER,undefined);
});
