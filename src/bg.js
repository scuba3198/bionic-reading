chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTabId") {
    sendResponse({ tabId: sender.tab?.id });
  }
  return true;
});

function isProtectedUrl(url) {
  if (!url) return true;
  
  // Standard web/file protocols
  const isAllowedProtocol = url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
  if (!isAllowedProtocol) {
    return true; // Any internal/system protocol like chrome://, edge://, about:, etc.
  }
  
  // Specific protected websites (like extension stores where extensions cannot run content scripts)
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      host === "chromewebstore.google.com" ||
      (host === "chrome.google.com" && parsed.pathname.startsWith("/webstore")) ||
      (host === "microsoftedge.microsoft.com" && parsed.pathname.startsWith("/addons"))
    ) {
      return true;
    }
  } catch (e) {
    // invalid URL format
  }
  
  return false;
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-bionic") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || isProtectedUrl(tab.url)) return;

    const key = `bionic_active_${tab.id}`;
    const data = await chrome.storage.local.get(key);
    const newState = !data[key];

    await chrome.storage.local.set({ [key]: newState });

    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (state) => { window.bionicTargetState = state; },
      args: [newState]
    }).then(() => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["src/convert.js"],
      });
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`bionic_active_${tabId}`);
});
