(() => {
  if (typeof self.BMLivePanel !== "function") throw new Error("Best Move panel feature did not load");
  self.BMLivePanel();
})();
