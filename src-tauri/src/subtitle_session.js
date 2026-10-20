// DOM-independent lifecycle: each selection/source has one cancellable owner.
(function () {
  'use strict';
  window.createTflixSubtitleSession=function({download,prepare,onState}) {
    let generation=0,request=null,dispose=null,sourceKey='';
    function invalidate() {
      generation++;
      request?.abort();request=null;
      dispose?.();dispose=null;
    }
    function reset(key) {invalidate();sourceKey=key;onState({state:'off',sourceKey});}
    async function select(candidate) {
      invalidate();const ticket=generation,key=sourceKey;
      request=new AbortController();const signal=request.signal;
      onState({state:'loading',sourceKey:key,id:candidate.id});
      try {
        const file=await download(candidate,signal);
        if(signal.aborted || ticket!==generation) return;
        // prepare waits for the native track's load event, not merely fetch.
        const loaded=await prepare(file,signal);
        if(signal.aborted || ticket!==generation) {loaded.dispose();return;}
        dispose=loaded.dispose;
        loaded.activate();
        onState({state:'ready',sourceKey:key,id:file.id,hash:file.hash,matchState:file.matchState});
      } catch(error) {
        if(ticket===generation && !signal.aborted) onState({state:'error',sourceKey:key,message:error.message});
      }
    }
    return {reset,select,stop:()=>reset(sourceKey)};
  };
})();
