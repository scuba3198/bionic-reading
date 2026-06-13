import { Context, Effect, Layer, Data } from "effect";

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly message: string;
}> {}

export class TabError extends Data.TaggedError("TabError")<{
  readonly message: string;
}> {}

export class WasmInitError extends Data.TaggedError("WasmInitError")<{
  readonly message: string;
}> {}

export class ChromeStorage extends Context.Tag("ChromeStorage")<
  ChromeStorage,
  {
    readonly get: (key: string) => Effect.Effect<{ [key: string]: any }, StorageError>;
    readonly set: (items: { [key: string]: any }) => Effect.Effect<void, StorageError>;
  }
>() {}

export class ChromeTabs extends Context.Tag("ChromeTabs")<
  ChromeTabs,
  {
    readonly getActiveTab: () => Effect.Effect<chrome.tabs.Tab | undefined, TabError>;
    readonly executeScript: (tabId: number, files: string[]) => Effect.Effect<void, TabError>;
  }
>() {}

export const ChromeStorageLive = Layer.succeed(
  ChromeStorage,
  ChromeStorage.of({
    get: (key) =>
      Effect.tryPromise({
        try: () => chrome.storage.local.get(key),
        catch: (error) => new StorageError({ message: `ChromeStorage.get failed: ${error}` }),
      }),
    set: (items) =>
      Effect.tryPromise({
        try: () => chrome.storage.local.set(items),
        catch: (error) => new StorageError({ message: `ChromeStorage.set failed: ${error}` }),
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
        catch: (error) => new TabError({ message: `ChromeTabs.getActiveTab failed: ${error}` }),
      }),
    executeScript: (tabId, files) =>
      Effect.tryPromise({
        try: () =>
          chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files,
          }).then(() => {}),
        catch: (error) => new TabError({ message: `ChromeTabs.executeScript failed: ${error}` }),
      }),
  })
);
