(() => {
  if (window.__knightScopeV2Loaded) return;
  window.__knightScopeV2Loaded = true;
  let panel;
  const getPieces = () => [...document.querySelectorAll('chess-board .piece, wc-chess-board .piece')].map(el => ({className:el.className, square:el.className.match(/square-([1-8][1-8])/)?.[1] || null})).filter(p=>p.square);
  function toggle(){
    if(panel){panel.remove();panel=null;return;}
    panel=document.createElement('aside');
    panel.id='knightscope-v2-panel';
    panel.innerHTML='<div class="ks-head"><div class="ks-brand"><span class="ks-mark">♞</span><div><b>KnightScope</b><small>Independent chess workspace</small></div></div><button class="ks-close" aria-label="Close">×</button></div><div class="ks-body"><div class="ks-kicker">LIVE BOARD SNAPSHOT</div><h2>Position overview</h2><p class="ks-copy">KnightScope can detect pieces currently rendered on this Chess.com board.</p><div class="ks-stat"><strong id="ks-count">—</strong><span>pieces detected</span></div><div class="ks-list" id="ks-list"></div><p class="ks-note">Version 2 is the clean standalone foundation. Engine analysis and game-review features will be added as native KnightScope modules in later tested builds.</p></div>';
    const style=document.createElement('style');style.textContent='#knightscope-v2-panel{position:fixed;z-index:2147483647;top:80px;right:22px;width:310px;background:#111914;color:#f2f6f2;border:1px solid #344339;border-radius:15px;box-shadow:0 18px 60px #0009;font:13px/1.45 Inter,system-ui,sans-serif;overflow:hidden}#knightscope-v2-panel *{box-sizing:border-box}.ks-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #2b382f}.ks-brand{display:flex;gap:10px;align-items:center}.ks-mark{display:grid;place-items:center;width:34px;height:34px;background:#b7f36b;color:#172011;border-radius:10px;font-size:23px}.ks-brand b{display:block;font-size:14px}.ks-brand small{display:block;color:#91a096;font-size:10px}.ks-close{border:0;background:transparent;color:#c7d1c9;font-size:23px;cursor:pointer}.ks-body{padding:18px}.ks-kicker{font-size:9px;letter-spacing:1.5px;color:#b7f36b;font-weight:800}.ks-body h2{font-size:22px;margin:8px 0}.ks-copy,.ks-note{color:#a3b0a7;font-size:11px}.ks-stat{display:flex;align-items:baseline;gap:8px;margin:17px 0;padding:13px;background:#1c2820;border:1px solid #344339;border-radius:10px}.ks-stat strong{font-size:25px;color:#b7f36b}.ks-stat span{color:#a3b0a7;font-size:11px}.ks-list{max-height:120px;overflow:auto;color:#dce6dd;font-size:10px;display:grid;gap:4px}.ks-note{border-top:1px solid #2b382f;padding-top:12px;margin:15px 0 0;line-height:1.5}';
    panel.append(style);document.documentElement.append(panel);
    panel.querySelector('.ks-close').addEventListener('click',()=>{panel.remove();panel=null;});
    refresh();
  }
  function refresh(){if(!panel)return;const pieces=getPieces();panel.querySelector('#ks-count').textContent=pieces.length;const list=panel.querySelector('#ks-list');list.textContent=pieces.length?pieces.map(p=>`${p.className.replace(/piece|square-/g,'').trim()||'Piece'} · ${p.square}`).join('  |  '):'No board pieces detected yet. Open a game board first.';}
  chrome.runtime.onMessage.addListener(msg=>{if(msg?.type==='KNIGHTSCOPE_TOGGLE')toggle();});
  const observer=new MutationObserver(()=>{if(panel)refresh();});observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
})();