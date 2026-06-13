import { Context, Effect, Layer } from "effect";

export class ChromeStorage extends Context.Tag("ChromeStorage")<
  ChromeStorage,
  {
    readonly get: (key: string) => Effect.Effect<{ [key: string]: any }, Error>;
    readonly set: (items: { [key: string]: any }) => Effect.Effect<void, Error>;
  }
>() {}

export class ChromeTabs extends Context.Tag("ChromeTabs")<
  ChromeTabs,
  {
    readonly getActiveTab: () => Effect.Effect<chrome.tabs.Tab | undefined, Error>;
    readonly executeScript: (tabId: number, files: string[]) => Effect.Effect<void, Error>;
  }
>() {}

export const ChromeStorageLive = Layer.succeed(
  ChromeStorage,
  ChromeStorage.of({
    get: (key) =>
      Effect.tryPromise({
        try: () => chrome.storage.local.get(key),
        catch: (error) => new Error(`ChromeStorage.get failed: ${error}`),
      }),
    set: (items) =>
      Effect.tryPromise({
        try: () => chrome.storage.local.set(items),
        catch: (error) => new Error(`ChromeStorage.set failed: ${error}`),
      }),
  })
);

export const ChromeTabsLive = Layer.succeed(
  ChromeTabs,
  ChromeTabs.of({
    getActiveTab: () =>
      Effect.tryPromise({
        try: async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          return tab;
        },
        catch: (error) => new Error(`ChromeTabs.getActiveTab failed: ${error}`),
      }),
    executeScript: (tabId, files) =>
      Effect.tryPromise({
        try: () =>
          chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files,
          }).then(() => {}),
        catch: (error) => new Error(`ChromeTabs.executeScript failed: ${error}`),
      }),
  })
);
