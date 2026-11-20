/* Single-thread Emscripten UCI bridge for KnightScope V12. */
(() => {
  const id=new URL(self.location.href).searchParams.get("engine");
  const configs={plentychess:{factory:"PlentyChess",js:"plentychess-emscripten.js",wasm:"plentychess-emscripten.wasm",data:"plentychess-emscripten.data"},stormphrax:{factory:"Stormphrax",js:"stormphrax-emscripten.js",wasm:"stormphrax-emscripten.wasm",data:"stormphrax-emscripten.data"}};
  const cfg=configs[id];let modulePromise=null;
  const asset=(name)=>new URL(name,self.location.href).href;
  async function init(){if(modulePromise)return modulePromise;if(!cfg)throw new Error("Unknown engine: "+id);modulePromise=(async()=>{
    const wasmUrl=asset(cfg.wasm),dataUrl=asset(cfg.data),jsUrl=asset(cfg.js);
    const responses=await Promise.all([fetch(wasmUrl),fetch(dataUrl)]);for(const r of responses)if(!r.ok)throw new Error("Engine asset failed: HTTP "+r.status);
    const wasmBytes=await responses[0].arrayBuffer(),dataBytes=await responses[1].arrayBuffer();importScripts(jsUrl);
    const factory=self[cfg.factory];if(typeof factory!=="function")throw new Error(cfg.factory+" factory missing");
    return factory({wasmBinary:new Uint8Array(wasmBytes),getPreloadedPackage:()=>dataBytes,locateFile:(file)=>file.endsWith(".wasm")?wasmUrl:file.endsWith(".data")?dataUrl:asset(file),print:(line)=>self.postMessage({type:"line",line:String(line)}),printErr:(line)=>self.postMessage({type:"line",line:String(line)})});
  })();return modulePromise;}
  self.onmessage=(event)=>{const m=event.data||{};Promise.resolve().then(async()=>{if(m.type==="init"){await init();self.postMessage({type:"ready"});return;}if(m.type==="command"){const mod=await init();mod.ccall("command",null,["string"],[String(m.command)]);return;}throw new Error("Unknown worker message: "+m.type);}).catch((e)=>self.postMessage({type:"error",message:e&&e.message?e.message:String(e)}));};
})();