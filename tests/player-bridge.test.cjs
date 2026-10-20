const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const sourceConfig=require('../stream/source-config.js');
function bridgeScript(){return fs.readFileSync('src-tauri/src/player_bridge.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];}
test('episode selections relay only from the exact current CineSrc frame and origin',()=>{
 let receive;const messages=[],frame={setAttribute(){},contentWindow:{}};
 const context={URL,URLSearchParams,location:{search:'?source=4&src='+encodeURIComponent('https://cinesrc.st/embed/tv/123542?s=1&e=1')},document:{createElement:()=>frame,body:{appendChild(){}}},window:{TFLIX_SOURCE_CONFIG:sourceConfig,addEventListener:(n,f)=>receive=f,top:{postMessage:data=>messages.push(data)}}};
 vm.runInNewContext(bridgeScript(),context);
 const event={source:frame.contentWindow,origin:'https://cinesrc.st',data:{type:'cinesrc:nextepisode',season:2,episode:3}};
 receive({...event,source:{}});receive({...event,origin:'https://unrelated.test'});receive({...event,data:{...event.data,episode:-1}});assert.equal(messages.length,0);
 receive(event);assert.equal(messages.length,1);assert.equal(messages[0].episode,3);assert.equal(messages[0].type,'tflix:episode-changed');
});

test('providers that reject sandboxing receive an unsandboxed bridge frame',()=>{
 for(const [id,host] of [[3,'vidsrc.sh'],[5,'vidfast.vc'],[6,'vidlink.pro']]){
  const attributes=[];const frame={setAttribute:(name,value)=>attributes.push([name,value]),contentWindow:{}};
  const context={URL,URLSearchParams,location:{search:`?source=${id}&src=`+encodeURIComponent(`https://${host}/movie/1`)},document:{createElement:()=>frame,body:{appendChild(){}}},window:{TFLIX_SOURCE_CONFIG:sourceConfig,addEventListener(){},top:{postMessage(){}}}};
  vm.runInNewContext(bridgeScript(),context);
  assert.equal(attributes.some(([name])=>name==='sandbox'),false,`source ${id}`);
 }
});

test('bridge forwards real media readiness and resume commands',()=>{
 const listeners=[],forwarded=[],providerMessages=[];
 const providerWindow={postMessage:(data,target)=>providerMessages.push({data,target})};
 const parentWindow={postMessage(){}};
 const frame={setAttribute(){},contentWindow:providerWindow};
 const context={URL,URLSearchParams,location:{search:'?source=4&src='+encodeURIComponent('https://cinesrc.st/embed/movie/1')},document:{createElement:()=>frame,body:{appendChild(){}}},window:{TFLIX_SOURCE_CONFIG:sourceConfig,addEventListener:(name,fn)=>listeners.push({name,fn}),top:{postMessage:data=>forwarded.push(data)},parent:parentWindow}};
 vm.runInNewContext(bridgeScript(),context);
 const mediaListener=listeners.find(item=>item.name==='message' && item.fn.toString().includes('mediaTypes')).fn;
 mediaListener({source:providerWindow,origin:'https://cinesrc.st',data:{type:'tflix:media-ready',duration:120}});
 assert.deepEqual(forwarded,[{type:'tflix:media-ready',duration:120}]);
 const resumeListener=listeners.find(item=>item.name==='message' && item.fn.toString().includes('tflix:resume')).fn;
 resumeListener({source:parentWindow,data:{type:'tflix:resume',time:42,duration:120}});
 assert.deepEqual(providerMessages,[{data:{type:'tflix:resume',time:42,duration:120},target:'*'}]);
});
