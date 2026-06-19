import { Effect, Match, Option } from "effect";
import { ChromeStorage, ChromeStorageLive, ChromeTabs, ChromeTabsLive, WasmInitError } from "./services";
import init, { transform_text } from "../wasm/pkg/bionic_wasm.js";

let wasmInitialized = false;

const initWasm = Effect.fn("initWasm")(function* () {
  if (wasmInitialized) return;
  const wasmUrl = chrome.runtime.getURL("src/bionic_wasm_bg.wasm");
  const response = yield* Effect.tryPromise({
    try: () => fetch(wasmUrl),
    catch: (error) => new WasmInitError({ message: `Failed to fetch WASM binary: ${error}` }),
  });
  const bytes = yield* Effect.tryPromise({
    try: () => response.arrayBuffer(),
    catch: (error) => new WasmInitError({ message: `Failed to read WASM bytes: ${error}` }),
  });
  yield* Effect.tryPromise({
    try: () => init(bytes),
    catch: (error) => new WasmInitError({ message: `WASM compilation failed: ${error}` }),
  });
  wasmInitialized = true;
});

const handleTabUpdate = Effect.fn("handleTabUpdate")(function* (
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab
) {
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
      Effect.catchAll((err) =>
        Match.value(err).pipe(
          Match.tag("StorageError", (e) =>
            Effect.logError(`Tab update storage check failed: ${e.message}`).pipe(
              Effect.map(() => null)
            )
          ),
          Match.tag("TabError", (e) =>
            Effect.logError(`Tab update content script injection failed: ${e.message}`).pipe(
              Effect.map(() => null)
            )
          ),
          Match.exhaustive
        )
      )
    )
  );
};

chrome.tabs.onUpdated.addListener(runTabUpdate);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "HIGHLIGHT_TEXTS") {
    Effect.runFork(
      Effect.gen(function* () {
        yield* initWasm();
        const texts: string[] = message.texts;
        const htmls = texts.map((text) => (text.trim() ? transform_text(text) : text));
        yield* Effect.sync(() => sendResponse({ htmls }));
      }).pipe(
        Effect.catchAll((err) =>
          Match.value(err).pipe(
            Match.tag("WasmInitError", (e) =>
              Effect.logError(`Wasm engine init failed: ${e.message}`).pipe(
                Effect.tap(() => Effect.sync(() => sendResponse({ error: e.message }))),
                Effect.map(() => null)
              )
            ),
            Match.exhaustive
          )
        )
      )
    );
    return true; // Keep message channel open for async response
  }
});

const toggleBionicState = Effect.fn("toggleBionicState")(function* () {
  const storage = yield* ChromeStorage;
  const tabs = yield* ChromeTabs;

  const activeTabOption = yield* tabs.getActiveTab();
  if (Option.isNone(activeTabOption)) return;
  const activeTab = activeTabOption.value;
  const url = activeTab.url;
  const isSupported = url?.startsWith("http://") || url?.startsWith("https://");

  if (!isSupported) return;

  const data = yield* storage.get("bionic_active");
  const newState = !data.bionic_active;

  yield* storage.set({ bionic_active: newState });

  if (activeTab.id) {
    yield* tabs.executeScript(activeTab.id, ["src/convert.js"]);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-bionic") {
    Effect.runFork(
      toggleBionicState().pipe(
        Effect.provide(ChromeStorageLive),
        Effect.provide(ChromeTabsLive),
        Effect.catchAll((err) =>
          Match.value(err).pipe(
            Match.tag("StorageError", (e) =>
              Effect.logError(`Keyboard command toggle storage failed: ${e.message}`).pipe(
                Effect.map(() => null)
              )
            ),
            Match.tag("TabError", (e) =>
              Effect.logError(`Keyboard command toggle tab script failed: ${e.message}`).pipe(
                Effect.map(() => null)
              )
            ),
            Match.exhaustive
          )
        )
      )
    );
  }
});
