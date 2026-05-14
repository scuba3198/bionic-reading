chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTabId") {
    sendResponse({ tabId: sender.tab?.id });
  }
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`bionic_active_${tabId}`);
});
