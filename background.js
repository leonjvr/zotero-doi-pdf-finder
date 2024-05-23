// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelectedCollection") {
    fetch("http://127.0.0.1:23119/connector/getSelectedCollection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    })
    .then(response => {
      console.log("getSelectedCollection response:", response);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("getSelectedCollection data:", data);
      sendResponse({ data });
    })
    .catch(error => {
      console.error("Error in getSelectedCollection:", error);
      sendResponse({ error: error.toString() });
    });

    return true; // Keeps the message channel open for sendResponse
  }

  if (request.action === "getItemsWithDOIsButNoPDFs") {
    fetch(`http://127.0.0.1:23119/connector/loadCollection?target=${request.collectionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    })
    .then(response => {
      console.log("getItemsWithDOIsButNoPDFs response:", response);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("getItemsWithDOIsButNoPDFs data:", data);
      if (!data || !data.items) {
        throw new Error("Invalid response structure: 'items' not found.");
      }

      const items = data.items.filter(item => {
        return item.data.DOI && !item.data.attachments.some(att => att.contentType === "application/pdf");
      }).sort((a, b) => a.data.DOI.localeCompare(b.data.DOI));

      console.log("Filtered items:", items);
      sendResponse({ items });
    })
    .catch(error => {
      console.error("Error in getItemsWithDOIsButNoPDFs:", error);
      sendResponse({ error: error.toString() });
    });

    return true; // Keeps the message channel open for sendResponse
  }
});
