// Bundled controller only. Remote providers never receive general IPC access or
// the app's storage; their only permitted IPC command reports playback events.
(function () {
  'use strict';
  if (!window.__TFLIX_NATIVE_PLAYER__) return;
  const {invoke}=window.__TAURI__.core;
  let session=null,openedSession=null,generation=0,queue=Promise.resolve(),model=null;
  const frames=new Map();
  const client={onAction(){},onMedia(){},onClose(){}};
  const ready=Promise.all([
    window.__TAURI__.event.listen('native-player-closed',event=>{
      if(event.payload!==session)return;
      session=null;openedSession=null;frames.clear();client.onClose();
    }),
    window.__TAURI__.event.listen('native-player-event',event=>{
      const data=event.payload;
      if(data.session!==session)return;
      if(data.action){client.onAction(data);return;}
      const key=data.frameId;
      if(!frames.has(key))frames.set(key,{postMessage(command){
        if(command?.type==='tflix:resume')invoke('send_native_player',{session,frameId:key,command}).catch(()=>{});
      }});
      client.onMedia({source:frames.get(key),data});
    })
  ]);
  client.open=request=>{
    const ticket=++generation;session=null;frames.clear();model=request.model||model;
    const result=queue.catch(()=>{}).then(async()=>{
      await ready;
      if(ticket!==generation)return;
      const opened=await invoke('open_native_player',{request});
      openedSession=opened;
      if(ticket!==generation)return;
      session=opened;frames.clear();
      if(model && model.id===request.id && model.server===request.server && model.season===request.season && model.episode===request.episode)await client.update(model);
    });
    queue=result;return result.catch(error=>{if(ticket===generation)session=openedSession;throw error;});
  };
  client.update=value=>{
    model=value;
    return session===null?Promise.resolve():invoke('update_native_player',{session,model:value}).catch(()=>{});
  };
  client.close=async()=>{
    const ticket=++generation;session=null;frames.clear();await queue.catch(()=>{});
    if(ticket!==generation || openedSession===null)return;
    const previous=openedSession;openedSession=null;
    await invoke('close_native_player',{session:previous});
  };
  client.isCurrentFrame=source=>[...frames.values()].includes(source);
  window.TFLIX_NATIVE_PLAYER=client;
})();
