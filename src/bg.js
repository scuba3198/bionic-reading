chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTabId") {
    sendResponse({ tabId: sender.tab?.id });
  }
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-bionic") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("http")) return;

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
