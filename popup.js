document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.sendMessage({ action: "getSelectedCollection" }, (response) => {
    if (response && response.error) {
      console.error("getSelectedCollection error:", response.error);
      document.getElementById("result").innerText = `Error: ${response.error}`;
    } else if (response && response.data) {
      console.log("getSelectedCollection data:", response.data);

      const collections = response.data.targets;
      const dropdown = document.getElementById("collectionsDropdown");
      collections.forEach(collection => {
        const option = document.createElement("option");
        // Assuming libraryID is a number or string without 'L' prefix
        const libraryId = response.data.libraryID.toString();
        const collectionId = collection.id.toString().replace('C', '');
        option.value = `${collectionId}-${libraryId}`;
        option.text = collection.name;
        dropdown.add(option);
      });
    } else {
      console.error("Unexpected error occurred while fetching collections.");
      document.getElementById("result").innerText = `Unexpected error occurred while fetching collections.`;
    }
  });

  document.getElementById("fetchItems").addEventListener("click", () => {
    const collectionId = document.getElementById("collectionsDropdown").value;
    const page = document.getElementById("pageInput").value;
    const itemsPerPage = document.getElementById("itemsPerPageInput").value;
    if (collectionId) {
      const [scopeObjectKey, libraryID] = collectionId.split("-");
      document.getElementById("debugInfo").innerText = `Scope Object Key: ${scopeObjectKey}, Library ID: ${libraryID}, Page: ${page}, Items Per Page: ${itemsPerPage}`;
      chrome.runtime.sendMessage({
        action: "getItemsWithDOIsButNoPDFs",
        libraryID,
        scopeObjectKey,
        page,
        itemsPerPage
      }, (response) => {
        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = "";
        if (response && response.error) {
          console.error("getItemsWithDOIsButNoPDFs error:", response.error);
          resultDiv.innerText = `Error: ${response.error}`;
        } else if (response && response.data) {
          console.log("getItemsWithDOIsButNoPDFs data:", response.data);
          const items = response.data.items;
          items.forEach(item => {
            const doiLink = `https://doi.org/${item.DOI}`;
            const itemElement = document.createElement("div");
            itemElement.className = "item";
            itemElement.innerHTML = `<a href="${doiLink}" target="_blank">${item.DOI}</a> - ${item.title}`;
            const statusElement = document.createElement("span");
            statusElement.className = "status";
            statusElement.id = `status-${item.itemID}`;
            itemElement.appendChild(statusElement);
            resultDiv.appendChild(itemElement);
          });
          if (response.data.totalPages > page) {
            fetchItemsWithDOIs(libraryID, scopeObjectKey, parseInt(page) + 1, itemsPerPage);
          }
        } else {
          console.error("Unexpected error occurred while fetching items.");
          resultDiv.innerText = `Unexpected error occurred while fetching items.`;
        }
      });
    }
  });

  document.getElementById("startProcess").addEventListener("click", () => {
    startSemiAutomation();
  });

  document.getElementById("stopProcess").addEventListener("click", () => {
    stopSemiAutomation();
  });
});

function fetchItemsWithDOIs(libraryID, scopeObjectKey, page, itemsPerPage) {
  chrome.runtime.sendMessage({
    action: "getItemsWithDOIsButNoPDFs",
    libraryID,
    scopeObjectKey,
    page,
    itemsPerPage
  }, (response) => {
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = "";
    if (response && response.error) {
      console.error("getItemsWithDOIsButNoPDFs error:", response.error);
      resultDiv.innerText = `Error: ${response.error}`;
    } else if (response && response.data) {
      console.log("getItemsWithDOIsButNoPDFs data:", response.data);
      const items = response.data.items;
      items.forEach(item => {
        const doiLink = `https://doi.org/${item.DOI}`;
        const itemElement = document.createElement("div");
        itemElement.className = "item";
        itemElement.innerHTML = `<a href="${doiLink}" target="_blank">${item.DOI}</a> - ${item.title}`;
        const statusElement = document.createElement("span");
        statusElement.className = "status";
        statusElement.id = `status-${item.itemID}`;
        itemElement.appendChild(statusElement);
        resultDiv.appendChild(itemElement);
      });
      if (response.data.totalPages > page) {
        fetchItemsWithDOIs(libraryID, scopeObjectKey, parseInt(page) + 1, itemsPerPage);
      }
    } else {
      console.error("Unexpected error occurred while fetching items.");
      resultDiv.innerText = `Unexpected error occurred while fetching items.`;
    }
  });
}

function startSemiAutomation() {
  // Implement semi-automation logic
}

function stopSemiAutomation() {
  // Implement logic to stop semi-automation
}

function updateStatus(itemID, status) {
  const statusElement = document.getElementById(`status-${itemID}`);
  if (statusElement) {
    statusElement.textContent = status ? "✔️" : "❌";
  }
}
