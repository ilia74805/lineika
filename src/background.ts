chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "open") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId === undefined) {
      sendResponse({ ok: false });
      return;
    }
    chrome.sidePanel.open({ tabId }).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    );
  });
  return true;
});
