(() => {
  const TIMEOUT = 20000;
  function once(request, callback) {
    let done = false, timer = null;
    const finish = (value) => { if (done) return; done = true; clearTimeout(timer); callback(value); };
    timer = setTimeout(() => finish({ error: "Engine did not respond" }), TIMEOUT);
    try {
      const { type = "analyze", ...payload } = request;
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) finish({ error: chrome.runtime.lastError.message });
        else finish(response || { error: "no response" });
      });
    } catch (error) {
      finish({ error: /context invalidated/i.test(String(error)) ? "The extension was reloaded. Refresh this page." : String(error) });
    }
  }
  // One automatic retry when the engine page was still starting up.
  function ask(request, callback) {
    once(request, (response) => {
      if (response && /did not respond|Receiving end|no response/i.test(response.error || "")) setTimeout(() => once(request, callback), 400);
      else callback(response);
    });
  }
  self.BMEngineClient = { ask };
})();
