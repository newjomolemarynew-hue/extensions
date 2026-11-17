"use strict";
const status=document.getElementById("status");
const review=document.getElementById("review");
const analysis=document.getElementById("analysis");
const customize=document.getElementById("customize");
const engines=document.getElementById("engines");
let activeTab=null;
async function getTab(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return tab;}
async function sendReview(type){
  if(!activeTab?.id||!/^https:\/\/www\.chess\.com\//.test(activeTab.url||""))return {ok:false,message:"Open a completed Chess.com game first."};
  try{return await chrome.tabs.sendMessage(activeTab.id,{type});}
  catch{
    try{await chrome.scripting.executeScript({target:{tabId:activeTab.id},files:["content.js"]});return await chrome.tabs.sendMessage(activeTab.id,{type});}
    catch{return {ok:false,message:"Refresh the Chess.com tab and try again."};}
  }
}
(async()=>{try{activeTab=await getTab();const onChess=!!activeTab?.url&&/^https:\/\/www\.chess\.com\//.test(activeTab.url);status.textContent=onChess?"Chess.com detected. Ready to review a finished game.":"Open a completed Chess.com game to use game review.";review.disabled=!onChess;}catch{status.textContent="Could not check the current tab.";}})();
review.addEventListener("click",async()=>{review.disabled=true;status.textContent="Checking for a completed game…";const found=await sendReview("wtp:find");if(!found?.ok){status.textContent=found?.message||"No completed game found on this page.";review.disabled=false;return;}status.textContent="Opening your game review…";const opened=await sendReview("wtp:open");if(opened?.ok)window.close();else{status.textContent=opened?.message||"Could not open the review.";review.disabled=false;}});
function openMessage(type,button,label){button.disabled=true;status.textContent=label;chrome.runtime.sendMessage({type},response=>{if(chrome.runtime.lastError||response?.error){status.textContent=response?.error||chrome.runtime.lastError.message;button.disabled=false;}else window.close();});}
customize.addEventListener("click",()=>openMessage("openCustomization",customize,"Opening Customization Studio…"));
analysis.addEventListener("click",()=>openMessage("openAnalysis",analysis,"Opening analysis board…"));
engines.addEventListener("click",()=>chrome.tabs.create({url:chrome.runtime.getURL("engine-library.html")}));
