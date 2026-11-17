// Adds the pointer light to Analysis / Studio surfaces.
if (self.BMLiquid) {
  const run = () => self.BMLiquid.auto();
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", run); else run();
}
