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

const btn_active = document.getElementById("bionic_reading_btn");
const status_text = document.getElementById("status_text");
const shortcut_note = document.querySelector(".shortcut-note");

async function getCurrentTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateUI() {
  const tab = await getCurrentTab();
  if (!tab) return;
  
  const isProtected = isProtectedUrl(tab.url);
  
  if (isProtected) {
    btn_active.innerText = "Unsupported Page";
    btn_active.disabled = true;
    btn_active.classList.remove("active");
    if (status_text) {
      status_text.innerText = "RESTRICTED";
      status_text.style.color = "var(--text-muted)";
    }
    if (shortcut_note) {
      shortcut_note.innerText = "[ DISABLED ON THIS PAGE ]";
      shortcut_note.style.opacity = "0.5";
    }
    return;
  }
  
  btn_active.disabled = false;
  if (shortcut_note) {
    shortcut_note.innerText = "[ ALT + B ] TO TOGGLE";
    shortcut_note.style.opacity = "0.8";
  }

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
  if (!tab?.id || isProtectedUrl(tab.url)) return;

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
