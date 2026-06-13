import { Effect } from "effect";
import { ChromeStorage, ChromeStorageLive, ChromeTabs, ChromeTabsLive, StorageError, TabError, WasmInitError } from "./services";
import init, { transform_text } from "../wasm/pkg/bionic_wasm.js";
import { WASM_BASE64 } from "./wasm_bytes";

const decodeBase64 = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

let wasmInitialized = false;

const initWasm = Effect.tryPromise({
  try: async () => {
    if (wasmInitialized) return;
    const bytes = decodeBase64(WASM_BASE64);
    await init(bytes);
    wasmInitialized = true;
  },
  catch: (error) => new WasmInitError({ message: `WASM compilation failed: ${error}` }),
});

const handleTabUpdate = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) =>
  Effect.gen(function* () {
    if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
      const storage = yield* ChromeStorage;
      const tabs = yield* ChromeTabs;
      
      const data = yield* storage.get("bionic_active");
      if (data.bionic_active) {
        yield* tabs.executeScript(tabId, ["src/convert.js"]);
      }
    }
  });

const runTabUpdate = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
  Effect.runFork(
    handleTabUpdate(tabId, changeInfo, tab).pipe(
      Effect.provide(ChromeStorageLive),
      Effect.provide(ChromeTabsLive),
      Effect.catchAll((err) => {
        Effect.logError(`Tab updates execution failed: ${err.message}`);
        return Effect.succeed(null);
      })
    )
  );
};

chrome.tabs.onUpdated.addListener(runTabUpdate);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "HIGHLIGHT_TEXTS") {
    Effect.runFork(
      Effect.gen(function* () {
        yield* initWasm;
        const texts: string[] = message.texts;
        const htmls = texts.map((text) => (text.trim() ? transform_text(text) : text));
        sendResponse({ htmls });
      }).pipe(
        Effect.catchAll((err) => {
          // Exhaustive error type matching
          switch (err._tag) {
            case "WasmInitError":
              Effect.logError(`Wasm engine init failed: ${err.message}`);
              break;
            default:
              Effect.logError(`Message highlighting failed: ${err.message}`);
          }
          sendResponse({ error: err.message });
          return Effect.succeed(null);
        })
      )
    );
    return true; // Keep message channel open for async response
  }
});

const toggleBionicState = Effect.gen(function* () {
  const storage = yield* ChromeStorage;
  const tabs = yield* ChromeTabs;

  const activeTab = yield* tabs.getActiveTab();
  const url = activeTab?.url;
  const isSupported = url?.startsWith("http://") || url?.startsWith("https://");

  if (!isSupported) return;

  const data = yield* storage.get("bionic_active");
  const newState = !data.bionic_active;

  yield* storage.set({ bionic_active: newState });

  if (activeTab?.id) {
    yield* tabs.executeScript(activeTab.id, ["src/convert.js"]);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-bionic") {
    Effect.runFork(
      toggleBionicState.pipe(
        Effect.provide(ChromeStorageLive),
        Effect.provide(ChromeTabsLive),
        Effect.catchAll((err) => {
          Effect.logError(`Command toggling execution failed: ${err.message}`);
          return Effect.succeed(null);
        })
      )
    );
  }
});
