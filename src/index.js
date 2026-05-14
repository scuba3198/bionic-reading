const btn_active = document.getElementById("bionic_reading_btn");
const status_text = document.getElementById("status_text");

async function getCurrentTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateUI() {
  const tab = await getCurrentTab();
  if (!tab) return;
  
  const key = `bionic_active_${tab.id}`;
  const data = await chrome.storage.local.get(key);
  const isActive = !!data[key];
  
  btn_active.innerText = isActive ? "Disengage" : "Engage Engine";
  btn_active.classList.toggle("active", isActive);
  
  if (status_text) {
    status_text.innerText = isActive ? "ACTIVE" : "STANDBY";
    status_text.style.color = isActive ? "var(--accent)" : "var(--text-muted)";
  }
}

btn_active.addEventListener("click", async () => {
  const tab = await getCurrentTab();
  if (!tab?.id) return;

  const key = `bionic_active_${tab.id}`;
  const data = await chrome.storage.local.get(key);
  const newState = !data[key];
  
  await chrome.storage.local.set({ [key]: newState });
  await updateUI();

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
});

// Initialize UI
updateUI();

// Listen for storage changes (e.g. from keyboard shortcuts)
chrome.storage.onChanged.addListener(async (changes) => {
  const tab = await getCurrentTab();
  if (!tab?.id) return;
  
  const key = `bionic_active_${tab.id}`;
  if (changes[key]) {
    updateUI();
  }
});
