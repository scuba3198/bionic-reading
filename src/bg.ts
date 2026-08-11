import init, { transform_text } from "../wasm/pkg/bionic_wasm.js";

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | undefined;

const isSupportedUrl = (url?: string) => Boolean(url && /^https?:\/\//.test(url));
type ToggleResult = { supported: boolean; bionicActive: boolean };
const toggleLocks = new Map<number, Promise<ToggleResult>>();
const tabGenerations = new Map<number, number>();

const getTabGeneration = (tabId: number) => {
  const current = tabGenerations.get(tabId);
  if (current !== undefined) return current;
  tabGenerations.set(tabId, 1);
  return 1;
};

const initWasm = async () => {
  if (wasmInitialized) return;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    const response = await fetch(chrome.runtime.getURL("src/bionic_wasm_bg.wasm"));
    if (!response.ok) throw new Error(`Failed to fetch WASM binary (${response.status})`);
    await init(await response.arrayBuffer());
    wasmInitialized = true;
  })();

  try {
    await wasmInitPromise;
  } finally {
    if (!wasmInitialized) wasmInitPromise = undefined;
  }
};

const toggleBionicState = async (): Promise<ToggleResult> => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = activeTab?.id;
  if (typeof tabId !== "number" || !isSupportedUrl(activeTab.url)) {
    return { supported: false, bionicActive: false };
  }

  const generation = getTabGeneration(tabId);
  const previous = toggleLocks.get(tabId) ?? Promise.resolve({ supported: true, bionicActive: false });
  const operation = previous.catch(() => ({ supported: true, bionicActive: false })).then(async () => {
    const isStale = () => tabGenerations.get(tabId) !== generation;
    const key = `bionic_active_${tabId}`;
    const data = await chrome.storage.local.get(key);
    const hadPreviousValue = Object.prototype.hasOwnProperty.call(data, key);
    const previousValue = data[key];
    const bionicActive = !Boolean(previousValue);

    if (isStale()) {
      await chrome.storage.local.remove(key);
      throw new Error("Active tab navigated during toggle");
    }
    await chrome.storage.local.set({ [key]: bionicActive });
    if (isStale()) {
      await chrome.storage.local.remove(key);
      throw new Error("Active tab navigated during toggle");
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["src/convert.js"] });
    } catch (error) {
      if (isStale()) {
        await chrome.storage.local.remove(key);
        throw new Error("Active tab navigated during toggle");
      }
      try {
        if (hadPreviousValue) await chrome.storage.local.set({ [key]: previousValue });
        else await chrome.storage.local.remove(key);
      } catch (rollbackError) {
        console.error(`Failed to roll back state for tab ${tabId}:`, rollbackError);
      }
      throw error;
    }
    if (isStale()) {
      await chrome.storage.local.remove(key);
      throw new Error("Active tab navigated during toggle");
    }
    return { supported: true, bionicActive };
  });

  toggleLocks.set(tabId, operation);
  try {
    return await operation;
  } finally {
    if (toggleLocks.get(tabId) === operation) toggleLocks.delete(tabId);
  }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // A navigation/reload creates a fresh document, so the previous per-tab state is stale.
  if (changeInfo.status === "loading") {
    tabGenerations.set(tabId, (tabGenerations.get(tabId) ?? 0) + 1);
    void chrome.storage.local.remove(`bionic_active_${tabId}`).catch((error) =>
      console.error(`Failed to clear state for tab ${tabId}:`, error)
    );
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabGenerations.delete(tabId);
  void chrome.storage.local.remove(`bionic_active_${tabId}`).catch((error) =>
    console.error(`Failed to clean up storage for tab ${tabId}:`, error)
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "HIGHLIGHT_TEXTS") {
    void (async () => {
      try {
        if (!Array.isArray(message.texts) || message.texts.some((text: unknown) => typeof text !== "string")) {
          throw new Error("Invalid highlight request");
        }
        await initWasm();
        sendResponse({ htmls: (message.texts as string[]).map((text) => (text.trim() ? transform_text(text) : text)) });
      } catch (error) {
        console.error("WASM highlight failed:", error);
        sendResponse({ error: String(error) });
      }
    })();
    return true;
  }

  if (message.type === "GET_ACTIVE_STATUS") {
    void (async () => {
      try {
        const tabId = sender.tab?.id;
        if (typeof tabId !== "number") return sendResponse({ bionicActive: false });
        const key = `bionic_active_${tabId}`;
        const data = await chrome.storage.local.get(key);
        sendResponse({ bionicActive: Boolean(data[key]) });
      } catch (error) {
        sendResponse({ error: String(error) });
      }
    })();
    return true;
  }

  if (message.type === "TOGGLE_BIONIC") {
    void toggleBionicState()
      .then(sendResponse)
      .catch((error) => sendResponse({ error: String(error) }));
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-bionic") {
    void toggleBionicState().catch((error) => console.error("Keyboard toggle failed:", error));
  }
});
