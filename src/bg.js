chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
    const key = `bionic_active_${tabId}`;
    chrome.storage.local.get(key, (data) => {
      if (data[key]) {
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: (state) => { window.bionicTargetState = state; },
          args: [true]
        }).then(() => {
          chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ["src/convert.js"],
          });
        });
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`bionic_active_${tabId}`);
});
