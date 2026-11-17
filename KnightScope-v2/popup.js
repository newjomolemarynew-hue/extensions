const status = document.getElementById('status');
chrome.tabs.query({active:true,currentWindow:true}, ([tab]) => {
  const ok = !!tab?.url && /^https:\/\/www\.chess\.com\//.test(tab.url);
  status.textContent = ok ? 'Chess.com detected. Ready to open.' : 'Open a Chess.com game to use the board panel.';
  document.getElementById('open').disabled = !ok;
  if (!ok) document.getElementById('open').style.opacity = '.45';
});
document.getElementById('open').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  try { await chrome.tabs.sendMessage(tab.id,{type:'KNIGHTSCOPE_TOGGLE'}); status.textContent='KnightScope panel toggled on the page.'; }
  catch { status.textContent='Refresh the Chess.com tab and try again.'; }
});