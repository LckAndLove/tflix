const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('stream/index.html','utf8');
const start=html.indexOf('function readSourceHealth()');
const end=html.indexOf('\nfunction clearSourceProbes()',start);
function health(initial='{}'){
  const values=new Map([['tflix_source_health_v1',initial]]);
  const context={
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},
    SOURCE_HEALTH_STORAGE_KEY:'tflix_source_health_v1',SOURCE_HEALTH_VERSION:1,
    SOURCE_HEALTH_HALF_LIFE_MS:7*86400000,SOURCE_FAILURE_LIMIT:3,SOURCE_CIRCUIT_MS:300000,
    SERVERS:Array.from({length:6},(_,index)=>({id:index+1})),Date,
    sourceAttemptReadyRecorded:false,sourceAttemptFailureRecorded:false,sourceLoadStartedAt:Date.now()-2400
  };
  vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  return context;
}

test('health scores reorder sources, decay older events, and keep untested sources eligible',()=>{
  const now=Date.now(),c=health(JSON.stringify({version:1,sources:{
    6:{successes:[now,now-1000],failures:[],readyMs:[{at:now,ms:1000}],consecutiveFailures:0,blockedUntil:0},
    4:{successes:[],failures:[now],readyMs:[],consecutiveFailures:1,blockedUntil:0},
    1:{successes:[now-90*86400000],failures:[],readyMs:[],consecutiveFailures:0,blockedUntil:0}
  }}));
  const order=Array.from(c.orderedHealthySources());
  assert.equal(order[0],6);
  assert.equal(order.length,6);
  assert.ok(order.indexOf(4)>order.indexOf(2));
});

test('three consecutive failures open a five minute circuit',()=>{
  const c=health();
  for(let i=0;i<3;i++){
    c.sourceAttemptFailureRecorded=false;
    c.recordSourceFailure(2);
  }
  const stored=JSON.parse(c.localStorage.getItem('tflix_source_health_v1'));
  assert.equal(stored.sources[2].failures.length,3);
  assert.equal(stored.sources[2].consecutiveFailures,3);
  assert.ok(stored.sources[2].blockedUntil>Date.now());
  assert.equal(Array.from(c.orderedHealthySources()).includes(2),false);
});

test('a ready event stores startup time and resets the failure streak',()=>{
  const c=health(JSON.stringify({version:1,sources:{3:{successes:[],failures:[Date.now()],readyMs:[],consecutiveFailures:1,blockedUntil:Date.now()+1000}}}));
  c.sourceAttemptReadyRecorded=false;c.recordSourceSuccess(3);
  const entry=JSON.parse(c.localStorage.getItem('tflix_source_health_v1')).sources[3];
  assert.equal(entry.successes.length,1);
  assert.equal(entry.consecutiveFailures,0);
  assert.equal(entry.blockedUntil,0);
  assert.ok(entry.readyMs[0].ms>=2000);
});
