import { Effect, Match, Option } from "effect";
import { ChromeStorage, ChromeStorageLive, ChromeTabs, ChromeTabsLive } from "./services";

const btn_active = document.getElementById("bionic_reading_btn") as HTMLButtonElement | null;
const status_text = document.getElementById("status_text") as HTMLSpanElement | null;

const updateUI = Effect.fn("updateUI")((bionic_active: boolean) =>
  Effect.sync(() => {
    if (btn_active) {
      btn_active.innerText = bionic_active ? "Disengage" : "Engage Engine";
      btn_active.classList.toggle("active", bionic_active);
      btn_active.disabled = false;
      btn_active.style.opacity = "";
      btn_active.style.cursor = "";
    }
    if (status_text) {
      status_text.innerText = bionic_active ? "ACTIVE" : "STANDBY";
      status_text.style.color = bionic_active ? "var(--accent)" : "var(--text-muted)";
    }
  })
);

const initUI = Effect.fn("initUI")(function* () {
  const storage = yield* ChromeStorage;
  const tabs = yield* ChromeTabs;

  const data = yield* storage.get("bionic_active");
  const bionic_active = !!data.bionic_active;

  const activeTabOption = yield* tabs.getActiveTab();
  const isSupported = Option.match(activeTabOption, {
    onNone: () => false,
    onSome: (tab) => !!(tab.url?.startsWith("http://") || tab.url?.startsWith("https://")),
  });

  if (!isSupported) {
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
  } else {
    yield* updateUI(bionic_active);
  }
});

const handleButtonClick = Effect.fn("handleButtonClick")(function* () {
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

const program = Effect.fn("program")(function* () {
  yield* initUI();
  
  if (btn_active) {
    btn_active.addEventListener("click", () => {
      Effect.runFork(
        handleButtonClick().pipe(
          Effect.provide(ChromeStorageLive),
          Effect.provide(ChromeTabsLive),
          Effect.catchAll((err) =>
            Match.value(err).pipe(
              Match.tag("StorageError", (e) =>
                Effect.logError(`Storage transaction failed: ${e.message}`)
              ),
              Match.tag("TabError", (e) =>
                Effect.logError(`Chrome scripting failed: ${e.message}`)
              ),
              Match.exhaustive
            )
          )
        )
      );
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.bionic_active) {
      const bionic_active = !!changes.bionic_active.newValue;
      Effect.runFork(
        Effect.gen(function* () {
          const tabs = yield* ChromeTabs;
          const activeTabOption = yield* tabs.getActiveTab();
          const isSupported = Option.match(activeTabOption, {
            onNone: () => false,
            onSome: (tab) => !!(tab.url?.startsWith("http://") || tab.url?.startsWith("https://")),
          });
          
          if (isSupported) {
            yield* updateUI(bionic_active);
          }
        }).pipe(
          Effect.provide(ChromeTabsLive),
          Effect.catchAll((err) =>
            Match.value(err).pipe(
              Match.tag("TabError", (e) =>
                Effect.logError(`Active tab checking failed: ${e.message}`)
              ),
              Match.exhaustive
            )
          )
        )
      );
    }
  });
});

// Run initialization
Effect.runFork(
  program().pipe(
    Effect.provide(ChromeStorageLive),
    Effect.provide(ChromeTabsLive),
    Effect.catchAll((err) =>
      Match.value(err).pipe(
        Match.tag("StorageError", (e) =>
          Effect.logError(`Extension initialization storage error: ${e.message}`)
        ),
        Match.tag("TabError", (e) =>
          Effect.logError(`Extension initialization tab error: ${e.message}`)
        ),
        Match.exhaustive
      )
    )
  )
);
