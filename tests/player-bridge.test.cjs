const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('episode selections relay only from the exact current CineSrc frame and origin',()=>{
 let receive;const messages=[],frame={setAttribute(){},contentWindow:{}};
 const context={URL,URLSearchParams,location:{search:'?src='+encodeURIComponent('https://cinesrc.st/embed/tv/123542?s=1&e=1')},document:{createElement:()=>frame,body:{appendChild(){}}},window:{addEventListener:(n,f)=>receive=f,top:{postMessage:data=>messages.push(data)}}};
 vm.runInNewContext(fs.readFileSync('src-tauri/src/player_bridge.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],context);
 const event={source:frame.contentWindow,origin:'https://cinesrc.st',data:{type:'cinesrc:nextepisode',season:2,episode:3}};
 receive({...event,source:{}});receive({...event,origin:'https://unrelated.test'});receive({...event,data:{...event.data,episode:-1}});assert.equal(messages.length,0);
 receive(event);assert.equal(messages.length,1);assert.equal(messages[0].episode,3);assert.equal(messages[0].type,'tflix:episode-changed');
});

test('providers that reject sandboxing receive an unsandboxed bridge frame',()=>{
 const attributes=[];const frame={setAttribute:(name,value)=>attributes.push([name,value]),contentWindow:{}};
 const context={URL,URLSearchParams,location:{search:'?source=3&src='+encodeURIComponent('https://vidsrc.sh/embed/movie?tmdb=1')},document:{createElement:()=>frame,body:{appendChild(){}}},window:{addEventListener(){},top:{postMessage(){}}}};
 vm.runInNewContext(fs.readFileSync('src-tauri/src/player_bridge.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1],context);
 assert.equal(attributes.some(([name])=>name==='sandbox'),false);
});
