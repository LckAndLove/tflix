const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const check=html.slice(html.indexOf('async function checkForUpdates('),html.indexOf('\nasync function startUpdate()'));
function fixture(invoke){
 const messages=[],updates=[];let fetches=0;
 const context={window:invoke?{__TAURI__:{core:{invoke}}}:{},APP_VERSION:'1.0.0',updateCheckInFlight:false,updateInstalling:false,console:{warn(){}},t:key=>({checkingUpdate:'Checking',updateLatest:'Latest %s',updateFailed:'请稍后重试'}[key]),toast:text=>messages.push(text),showUpdateModal:data=>updates.push(data),semverGt:(a,b)=>a>b,AbortSignal,fetch:async()=>{fetches++;return{ok:true,json:async()=>({version:'1.0.1',notes:'New'})};}};
 vm.createContext(context);vm.runInContext(check,context);return{context,messages,updates,fetches:()=>fetches};
}
test('native no-update result never falls through to GitHub API',async()=>{
 const f=fixture(async()=>null);await f.context.checkForUpdates(true);
 assert.equal(f.fetches(),0);assert.equal(f.messages.at(-1),'Latest v1.0.0');
});
test('native technical errors become friendly messages and remain silent for automatic checks',async()=>{
 const f=fixture(async()=>{throw Error('HTTP 403 rate limited');});
 await f.context.checkForUpdates(true);assert.equal(f.messages.at(-1),'请稍后重试');assert.doesNotMatch(f.messages.join(''),/403/);
 f.messages.length=0;await f.context.checkForUpdates(false);assert.equal(f.messages.length,0);assert.equal(f.fetches(),0);
});
test('web update checks use the static manifest and show the release page',async()=>{
 const f=fixture();await f.context.checkForUpdates(true);assert.equal(f.fetches(),1);assert.equal(f.updates[0].isNative,false);assert.match(f.updates[0].html_url,/releases\/latest$/);
});
test('multiple clicks cannot start concurrent update checks',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>{resolve=r;}));
 const pending=f.context.checkForUpdates(true);await f.context.checkForUpdates(true);assert.equal(f.messages.length,1);
 resolve(null);await pending;assert.equal(f.context.updateCheckInFlight,false);
});
test('installation errors clean up listeners and restore controls without exposing server details',async()=>{
 const buttons=Object.fromEntries(['update-confirm-btn','update-progress-wrap','update-progress-bar','update-progress-text','update-cancel-btn','update-modal-close'].map(id=>[id,{style:{},disabled:false}]));
 let cleaned=false,version;const messages=[];
 const context={currentUpdateData:{isNative:true,version:'1.3.1'},updateInstalling:false,$:id=>buttons[id],t:key=>key,toast:m=>messages.push(m),console:{warn(){}},window:{__TAURI__:{event:{listen:async()=>()=>{cleaned=true;}},core:{invoke:async(_,args)=>{version=args.expectedVersion;throw Error('403');}}}}};
 vm.createContext(context);vm.runInContext(html.slice(html.indexOf('async function startUpdate()'),html.indexOf('window.checkForUpdates =')),context);
 await context.startUpdate();assert.equal(version,'1.3.1');assert.equal(cleaned,true);assert.equal(context.updateInstalling,false);
 assert.equal(buttons['update-cancel-btn'].disabled,false);assert.equal(messages.at(-1),'installFailed');
});
