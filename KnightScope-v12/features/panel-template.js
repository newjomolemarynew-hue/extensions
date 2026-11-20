(() => {
  const render = (I) => `<div class="card" id="card">
  <i class="lite"></i>
  <div class="hd" id="head">
    <div class="brand"><div class="logo">${I.logo}</div><div><div class="nm">Best Move <span class="knightscope-version" style="font-size:10px;opacity:.7">V${String(chrome.runtime.getManifest().version).split(".")[0]}</span></div><div class="mode" id="mode"><span class="mi" id="modeIcon"></span><span id="modeText">Live game</span></div></div></div>
    <div class="hr"><span class="st" id="pill" title="Ready"><i></i><span id="pillT">Ready</span></span><button class="rb gi" id="bPeek" title="Hide / show arrows (hold Alt+A to peek)">${I.eye}</button><button class="rb gi" id="bPower" title="Pause / resume (Alt+S)">${I.pwr}</button><button class="rb gi" id="min" title="Minimise (Alt+M)">${I.min}</button><button class="rb gi" id="closePanel" title="Close panel; reopen from the Best Move extension menu">${I.close}</button></div>
  </div>
  <div class="mini"><div><div class="mv" id="miniMove">—</div><span class="mt" id="miniEval">—</span></div></div>
  <div class="bw"><div class="bi"><div class="body">
    <div class="seg tabs" id="tabs" style="--n:3;--i:0"><i class="th"></i><button data-t="a" class="on"><svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5m0 0h-8m8 0v8"/></svg>Move</button><button data-t="r"><svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></svg>Analysis</button><button data-t="s"><svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>Settings</button></div>

    <div class="tab on" id="tab-a">
      <section class="c2 hero">
        <div class="cap"><span id="heroLabel">Best move</span><b id="status">Waiting for a game</b></div>
        <div class="mvrow"><div class="mvl"><span class="pc" id="pc"></span><span class="sq" id="m1">—</span>${I.arr}<span class="sq to" id="m2">—</span><span class="promo" id="promo"></span></div><span class="evt" id="eval">—</span></div>
        <div class="sanl" id="san"></div>
        <div class="wbar"><i id="wfill"></i></div>
        <div class="wl"><span>You <b id="wMe">—</b></span><span><b id="wOpp">—</b> Opponent</span></div>
      </section>
      <div class="sigs" id="sig"></div>
      <section class="c2 lm" id="lm"></section>
      <section class="c2 pre" id="pre">
        <div class="cap"><span>Premove</span><span class="tag" id="preTag">—</span></div>
        <div class="pmain" id="pmain"></div>
      </section>
      <div class="rows" id="rows"></div>
      <div class="opp" id="opp"></div>

      <details class="moreOptions">
        <summary>Engine details</summary>
        <div class="met">
          <div class="m c2"><span>EVAL</span><b id="eval2">—</b></div>
          <div class="m c2"><span>DEPTH</span><b id="depth">—</b></div>
          <div class="m c2"><span>TIME</span><b id="ms">—</b></div>
        </div>
        <div id="lines"></div><div class="err" id="err"></div>
        <div class="legend">
          <span><i style="background:rgb(var(--acc))"></i>Play now</span>
          <span style="color:rgb(var(--ex))"><i class="d"></i><em style="font-style:normal;color:var(--label3)">Expected reply</em></span>
          <span><i style="background:rgb(var(--pm))"></i>Safe premove</span>
          <span style="color:rgb(var(--tr))"><i class="d"></i><em style="font-style:normal;color:var(--label3)">Avoid</em></span>
        </div>
      </details>
      <div class="err" id="errTop" hidden></div>
    </div>

    <div class="tab" id="tab-r">
      <section class="c2 liveEngine">
        <div class="liveEngineHead"><div><span class="engineEyebrow">LIVE ENGINE</span><b id="liveEngineName">Stockfish 19</b><small id="liveEngineDesc">Local Stockfish analysis</small></div><span class="engineState" id="revEngineState">Waiting</span></div>
        <div class="engineControls engineCustom"><div class="engineControl"><span>Engine</span><select id="liveEngineSelect" class="liveEngineSelect"><option value="stockfish">Stockfish 19</option><option value="maia">Maia</option></select></div>
        <div class="engineControl" id="liveMaiaLevelRow"><span>Maia level</span><div class="engineRange"><input type="range" id="liveMaiaElo" min="1100" max="1900" step="50" value="1500"><b id="liveMaiaEloLabel">1500</b></div></div>
        <div class="engineControl"><span>Stockfish strength</span><div class="engineRange"><input type="range" id="liveEngineElo" min="1320" max="3200" step="10" value="3200"><b id="liveEngineEloLabel">Max</b></div></div></div>
        <div class="engineMetrics"><div><span>Depth</span><b id="revDepth">—</b></div><div><span>Time</span><b id="revTime">—</b></div><div><span>Lines</span><b id="revLines">—</b></div></div>
        <div class="engineControls"><div class="engineControl"><span>Thinking</span><div class="seg" data-key="speed"><i class="th"></i><button data-v="turbo">Fast</button><button data-v="auto">Auto</button><button data-v="deep">Deep</button></div></div>
        <div class="engineControl"><span>Variations</span><div class="seg" data-key="lines"><i class="th"></i><button data-v="1">1</button><button data-v="2">2</button><button data-v="3">3</button></div></div></div>
        <div class="engineFoot">Maia predicts likely moves from its player model. Stockfish supplies the separate position evaluation and move-review scores.</div>
      </section>
      <section class="c2 revsum" id="revSum"></section>
      <div class="grp" style="margin-top:12px"><div class="gt">Recent moves</div><div class="c2 revmoves" id="revMoves"></div></div>
      <div class="c2 list">
        <button class="rowbtn gi" id="openRev"><span>Analyze this game<small>Detailed move-by-move review and accuracy</small></span>${I.arr}</button>
        <button class="rowbtn gi" id="openAny"><span>Open Analysis Board<small>Analyze any Chess.com username or PGN</small></span>${I.arr}</button>
        <button class="rowbtn gi" id="openCustomize"><span>Open Studio<small>Pieces, board, effects and Spotify</small></span>${I.arr}</button>
      </div>
      <div class="foot" style="margin-top:10px">Live ratings are calculated as the game progresses. The full Analysis Board performs a deeper review.</div>
    </div>

    <div class="tab" id="tab-s">
      <div class="grp">
      <div class="gt">Play assist</div>
      <div class="banWarn" id="banWarn" role="alert" hidden><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.4v3.4M8 11.6v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span><b>Heads up:</b> playing the engine's top move every time in online games can get your Chess.com account flagged or banned. Chess.com's fair play rules apply to you. Use Best Move for bot games, analysis and learning.</span></div>
      <section class="c2 feature" id="humanizeFeatureCard">
        <div class="featureHead"><div><b>Human-like moves</b><small>Suggest what a real player of the opponent's level might play, instead of always the engine's top move.</small></div><label class="sw"><input type="checkbox" data-key="humanizeWithMaia"><i></i></label></div>
        <div class="featureConfig maia" id="humanizeCard" aria-live="polite">
          <div class="maiaMove" id="maiaMove">—</div>
          <div class="maiaNote" id="maiaNote"></div>
          <div class="featureStatus"><span id="maiaRating">—</span><span id="autoMaiaStatus"></span></div>
          <div class="maiaControl">
            <div class="featureControlLabel"><span>Play like</span><em id="maiaEloL"></em></div>
            <div class="seg" data-key="maiaRatingMode"><i class="th"></i><button data-v="auto">Opponent</button><button data-v="manual">Pick a level</button></div>
            <input type="range" id="maiaElo" min="800" max="2400" step="50">
            <div class="e"><span>Beginner</span><span id="maiaModelLabel"></span><span>Strong club</span></div>
          </div>
          <div class="maiaControl">
            <div class="featureControlLabel"><span>Variety</span><em id="maiaLossL"></em></div>
            <div class="seg" data-key="maiaMaxLoss" id="maiaMaxLoss"><i class="th"></i><button data-v="0">Safe</button><button data-v="100">Balanced</button><button data-v="200">Bold</button></div>
            <div class="e"><span>Safe never gives up much; Bold may pick a weaker but natural move.</span></div>
          </div>
        </div>
      </section>
      <div class="featureStack">
        <section class="c2 feature" id="autoPlayFeatureCard">
          <div class="featureHead"><div><b>Auto-play</b><small>Plays the suggested move for you. Computer games only.</small></div><label class="sw"><input type="checkbox" data-key="autoPlay"><i></i></label></div>
        </section>
        <section class="c2 feature" id="autoOpponentFeatureCard">
          <div class="featureHead"><div><b>Match the bot's level</b><small>Sets engine strength and human-like play from the bot's rating.</small></div><label class="sw"><input type="checkbox" data-key="autoOpponent"><i></i></label></div>
          <div class="featureConfig featureStatus" id="autoOpponentStatus"></div>
        </section>
      </div>

      </div>
      <div class="grp" style="margin-top:14px">
      <details class="moreOptions">
        <summary>Advanced</summary>
        <div class="c2 list">
          <div class="row controlRow"><div>Premove advice</div><div class="seg" data-key="premove"><i class="th"></i><button data-v="off">Off</button><button data-v="auto">Auto</button><button data-v="always">Always</button></div></div>
          <div class="row controlRow" id="oppModeRow"><div>Opponent rating <small id="oppDet">Checking…</small></div><div class="seg" data-key="oppMode"><i class="th"></i><button data-v="auto">Auto</button><button data-v="manual">Manual</button></div></div>
          <div class="sl" id="oppRatingControl"><div class="t"><span>Set opponent rating</span><em id="oppL"></em></div><input type="range" id="oppE" min="100" max="3000" step="25"></div>
          <div class="sl"><div class="t"><span>Engine strength</span><em id="eloL"></em></div><input type="range" id="elo" min="1320" max="3200" step="10"></div>
          <div class="row controlRow"><div>Live engine<small>Only installed engine</small></div><strong class="engineAvailable">Stockfish 19 · Active</strong></div><div class="row controlRow"><div>Thinking time</div><div class="seg" data-key="speed"><i class="th"></i><button data-v="turbo">Fast</button><button data-v="auto">Auto</button><button data-v="deep">Deep</button></div></div>
          <div class="row controlRow"><div>Alternative moves</div><div class="seg" data-key="lines"><i class="th"></i><button data-v="1">1</button><button data-v="2">2</button><button data-v="3">3</button></div></div>
        </div>
      </details>
      </div>
      <div class="grp" style="margin-top:14px"><div class="gt">Appearance</div><div class="c2 list">
        <button class="rowbtn gi" id="openCustomize2"><span>Open Studio<small>Pieces, board, effects and Spotify</small></span>${I.arr}</button>
        <div class="row"><div>Glass</div><div class="seg" data-key="style"><i class="th"></i><button data-v="clear">Clear</button><button data-v="regular">Regular</button><button data-v="tinted">Tinted</button></div></div>
        <div class="sl"><div class="t"><span>Glass opacity</span><em id="glassL"></em></div><input type="range" id="glass" min="0" max="100" step="1"><div class="e"><span>More transparent</span><span>More opaque</span></div></div>
        <div class="row"><div>Theme</div><div class="seg" data-key="theme"><i class="th"></i><button data-v="auto">Auto</button><button data-v="light">Light</button><button data-v="dark">Dark</button></div></div>
        <div class="row"><div>Accent</div><div class="swatches" id="sw"></div></div>
      </div></div>
    </div>
  </div></div></div>
</div>`;
  self.BMPanelTemplate = { render };
})();
