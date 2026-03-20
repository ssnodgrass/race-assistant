export function hasWailsRuntime(): boolean {
  const runtimeWindow = window as typeof window & {
    _wails?: { environment?: unknown };
    wails?: { invoke?: unknown };
    chrome?: { webview?: { postMessage?: unknown } };
    webkit?: { messageHandlers?: { external?: { postMessage?: unknown } } };
  };

  return Boolean(
    runtimeWindow._wails?.environment ||
      runtimeWindow.chrome?.webview?.postMessage ||
      runtimeWindow.webkit?.messageHandlers?.external?.postMessage ||
      runtimeWindow.wails?.invoke
  );
}

export function isBrowserPreview(): boolean {
  return !hasWailsRuntime();
}
