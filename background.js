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
    console.log("Fetching items with DOIs but no PDFs:", request);
    fetch('http://localhost:23119/zotserver/getItemsInCollection', {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        libraryID: parseInt(request.libraryID, 10),
        objectType: "item",
        scopeObject: "collections",
        scopeObjectKey: parseInt(request.scopeObjectKey, 10),
        doi: 1,
        attachment: 0,
        sort: "doi",
        order: "A",
        page: parseInt(request.page, 10),
        itemsPerPage: parseInt(request.itemsPerPage, 10)
      })
    })
    .then(response => {
      console.log("getItemsWithDOIsButNoPDFs response:", response);
      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status}`);
        return response.text().then(text => { throw new Error(`HTTP error! status: ${response.status}, text: ${text}`); });
      }
      return response.json();
    })
    .then(data => {
      console.log("getItemsWithDOIsButNoPDFs data:", data);
      sendResponse({ data });
    })
    .catch(error => {
      console.error("Error in getItemsWithDOIsButNoPDFs:", error);
      sendResponse({ error: error.toString() });
    });

    return true; // Keeps the message channel open for sendResponse
  }
});
