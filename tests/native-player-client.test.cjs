const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync('stream/native-player-client.js','utf8');
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
function fixture(otherInvoke=()=>Promise.resolve()){
 const handlers={},requests=[],commands=[],opened=[];
 const window={__TFLIX_NATIVE_PLAYER__:true,__TAURI__:{core:{invoke:(name,args)=>{
  commands.push({name,args});if(name==='open_native_player'){const task=deferred();requests.push(task);opened.push(args.request);return task.promise;}return otherInvoke(name,args);
 }},event:{listen:(name,handler)=>{handlers[name]=handler;return Promise.resolve(()=>{});}}}};
 vm.runInNewContext(code,{window});
 return {client:window.TFLIX_NATIVE_PLAYER,requests,commands,opened,
  emit:data=>handlers['native-player-event']({payload:data}),close:session=>handlers['native-player-closed']({payload:session}),browser:session=>handlers['native-player-browser-request']({payload:session})};
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

test('only the current native menu request triggers browser playback',async()=>{
 const f=fixture();let calls=0;f.client.onBrowserRequest=()=>calls++;
 const opening=f.client.open(request);await tick();f.requests[0].resolve(1);await opening;
 f.browser(2);assert.equal(calls,0);f.browser(1);assert.equal(calls,1);
});
test('failed close restores the active frame, updates and close notifications',async()=>{
 const f=fixture(name=>name==='close_native_player'?Promise.reject(Error('close failed')):Promise.resolve());
 const media=[],closed=[];f.client.onMedia=e=>media.push(e);f.client.onClose=()=>closed.push(true);
 const opening=f.client.open(request);await tick();f.requests[0].resolve(1);await opening;
 f.emit({session:1,frameId:1,type:'tflix:media-ready'});const frame=media[0].source;
 await assert.rejects(f.client.close(),/close failed/);
 assert.equal(f.client.isCurrentFrame(frame),true);
 await f.client.update({...request,title:'Still active'});
 assert.equal(f.commands.at(-1).name,'update_native_player');
 f.emit({session:1,frameId:1,type:'tflix:media-progress'});assert.equal(media.length,2);
 f.close(1);assert.equal(closed.length,1);
});
test('a failed close can be retried without losing the current session',async()=>{
 let attempts=0;
 const f=fixture(name=>name==='close_native_player' && ++attempts===1?Promise.reject(Error('close failed')):Promise.resolve());
 const opening=f.client.open(request);await tick();f.requests[0].resolve(1);await opening;
 await assert.rejects(f.client.close());await f.client.close();
 assert.equal(attempts,2);assert.equal(f.commands.at(-1).args.session,1);
});
test('a confirmed destroyed window is not restored if its close reply fails',async()=>{
 let f;f=fixture(name=>{if(name==='close_native_player'){f.close(1);return Promise.reject(Error('reply failed'));}return Promise.resolve();});
 const opening=f.client.open(request);await tick();f.requests[0].resolve(1);await opening;
 await f.client.close();const count=f.commands.length;await f.client.update(request);
 assert.equal(f.commands.length,count);
});
test('pending close retains progress and clears frames only after success',async()=>{
 let finish;const f=fixture(name=>name==='close_native_player'?new Promise(r=>finish=r):Promise.resolve());
 const media=[];f.client.onMedia=e=>media.push(e);
 const opening=f.client.open(request);await tick();f.requests[0].resolve(1);await opening;
 f.emit({session:1,frameId:1,type:'tflix:media-ready'});const frame=media[0].source;
 const closing=f.client.close();await tick();
 f.emit({session:1,frameId:1,type:'tflix:media-progress'});
 assert.equal(media.length,2);assert.equal(f.client.isCurrentFrame(frame),true);
 finish();await closing;assert.equal(f.client.isCurrentFrame(frame),false);
});

test('a stale close rejection cannot restore a replaced session',async()=>{
 const closing=deferred(),f=fixture(name=>name==='close_native_player'?closing.promise:Promise.resolve());
 const media=[];f.client.onMedia=e=>media.push(e);
 const first=f.client.open(request);await tick();f.requests[0].resolve(1);await first;
 const pending=f.client.close();await tick();
 const second=f.client.open({...request,episode:4});await tick();f.requests[1].resolve(2);await second;
 f.emit({session:2,frameId:1,type:'tflix:media-ready'});const frame=media.at(-1).source;
 closing.reject(Error('old close failed'));await assert.rejects(pending,/old close failed/);
 assert.equal(f.client.isCurrentFrame(frame),true);
 await f.client.update({...request,episode:4});assert.equal(f.commands.at(-1).args.session,2);
});
