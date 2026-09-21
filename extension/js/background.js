/** Service worker: opens the side panel when the toolbar icon is clicked. */
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Jev Trader installed — click the toolbar icon to open the panel.");
});
