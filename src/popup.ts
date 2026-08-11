const btn_active = document.getElementById("bionic_reading_btn") as HTMLButtonElement | null;
const status_text = document.getElementById("status_text") as HTMLSpanElement | null;
let togglePending = false;
let supportedPage = false;

const updateUI = (bionicActive: boolean) => {
  if (btn_active) {
    btn_active.innerText = bionicActive ? "Disengage" : "Engage Engine";
    btn_active.classList.toggle("active", bionicActive);
    btn_active.disabled = togglePending;
    btn_active.style.opacity = "";
    btn_active.style.cursor = "";
  }
  if (status_text) {
    status_text.innerText = bionicActive ? "ACTIVE" : "STANDBY";
    status_text.style.color = bionicActive ? "var(--accent)" : "var(--text-muted)";
  }
};

const setUnsupportedUI = () => {
  supportedPage = false;
  if (btn_active) {
    btn_active.innerText = "Unsupported Page";
    btn_active.disabled = true;
    btn_active.style.opacity = "0.5";
    btn_active.style.cursor = "not-allowed";
  }
  if (status_text) {
    status_text.innerText = "RESTRICTED";
    status_text.style.color = "var(--text-muted)";
  }
};

const isSupportedUrl = (url?: string) => Boolean(url && /^https?:\/\//.test(url));

const initUI = async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isSupportedUrl(activeTab?.url) || typeof activeTab?.id !== "number") {
    setUnsupportedUI();
    return;
  }

  supportedPage = true;
  const key = `bionic_active_${activeTab.id}`;
  const data = await chrome.storage.local.get(key);
  updateUI(Boolean(data[key]));
};

btn_active?.addEventListener("click", async () => {
  if (togglePending) return;
  togglePending = true;
  btn_active.disabled = true;
  try {
    const response: { supported?: boolean; bionicActive?: boolean; error?: string } =
      await chrome.runtime.sendMessage({ type: "TOGGLE_BIONIC" });
    if (response.error) throw new Error(response.error);
    if (response.supported === false) {
      setUnsupportedUI();
      return;
    }
    if (response.supported) updateUI(Boolean(response.bionicActive));
  } catch (error) {
    console.error("Toggle failed:", error);
  } finally {
    togglePending = false;
    if (supportedPage && btn_active) btn_active.disabled = false;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || togglePending || !supportedPage) return;
  void chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
    if (typeof activeTab?.id !== "number") return;
    const change = changes[`bionic_active_${activeTab.id}`];
    if (change) updateUI(Boolean(change.newValue));
  });
});

void initUI().catch((error) => {
  console.error("Popup initialization failed:", error);
  setUnsupportedUI();
});
