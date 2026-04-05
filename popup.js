document.addEventListener("DOMContentLoaded", () => {
  if (!chrome.storage) {
    console.error("chrome.storage is undefined. Ensure you have 'storage' permission in manifest.json.");
    return;
  }

  chrome.storage.local.get(["currentPage", "currentCollection"], (data) => {
    if (chrome.runtime.lastError) {
      console.error("Error retrieving storage data:", chrome.runtime.lastError);
    } else {
      console.log("Storage data loaded successfully:", data);
    }
  });

  const fetchItemsButton = document.getElementById("fetchItems");
  const startProcessButton = document.getElementById("startProcess");
  const stopProcessButton = document.getElementById("stopProcess");
  const springerSwitch = document.getElementById("springerSwitch");
  const resultList = document.getElementById("result");
  const errorElement = document.getElementById("error");
  const debugMode = document.getElementById("debugMode");

  // Fetch and display the extension version
  const versionElement = document.getElementById("version");
  fetch(chrome.runtime.getURL('manifest.json'))
    .then(response => response.json())
    .then(manifest => {
      versionElement.textContent = `Version: ${manifest.version}`;
    })
    .catch(error => {
      console.error('Error fetching version:', error);
      versionElement.textContent = 'Version: N/A';
    });

  // Fetch and display the current state when the popup is opened
  chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
    if (response && response.currentItems) {
      displayItemStatuses(response.currentItems, response.currentIndex);
      if (response.currentItems.length > 0) {
        startProcessButton.disabled = false;
      }
      stopProcessButton.disabled = false;
    }
    if (response && response.springerSwitch !== undefined) {
      springerSwitch.checked = response.springerSwitch;
    }
  });

  // Load current settings from storage
  chrome.storage.local.get(["currentPage", "currentCollection", "currentLibraryID", "totalPages", "totalItems", "tagFilter", "excludeJournals"], (data) => {
    if (chrome.runtime.lastError) {
      console.error("Error retrieving storage data:", chrome.runtime.lastError);
    } else {
      if (data.currentPage) {
        document.getElementById("pageInput").value = data.currentPage;
      }
      if (data.currentCollection && data.currentLibraryID) {
        document.getElementById("collectionsDropdown").value = `${data.currentCollection}-${data.currentLibraryID}`;
      }
      if (data.totalPages) {
        const totalPagesElement = document.getElementById("totalPages");
        if (totalPagesElement) {
          totalPagesElement.textContent = data.totalPages;
        }
      }
      if (data.totalItems) {
        const itemsRemainingElement = document.getElementById("itemsRemaining");
        if (itemsRemainingElement) {
          itemsRemainingElement.textContent = data.totalItems;
        }
      }
      if (data.tagFilter) {
        document.getElementById("tagFilter").value = data.tagFilter;
      }
      if (data.excludeJournals) {
        document.getElementById("excludeJournals").value = data.excludeJournals;
      }
    }
  });

  // Fetch collections and populate the dropdown with hierarchical structure
  chrome.runtime.sendMessage({ action: "getSelectedCollection" }, (response) => {
    if (response && response.error) {
      console.error("getSelectedCollection error:", response.error);
      errorElement.innerText = response.error;
      errorElement.classList.remove('d-none'); // Show the error message
    } else if (response && response.data) {
      console.log("getSelectedCollection response:", response.data);
      populateCollectionsDropdown(response.data);
    } else {
      console.error("Unexpected error occurred while fetching collections.");
      errorElement.innerText = 'Unexpected error occurred while fetching collections.';
      errorElement.classList.remove('d-none'); // Show the error message
    }
  });

  // Function to populate dropdown with hierarchical collection structure
  function populateCollectionsDropdown(data) {
    const dropdown = document.getElementById("collectionsDropdown");
    dropdown.innerHTML = '<option value="">Select a collection</option>';
    
    // Organize collections by library
    const libraries = {};
    const targets = data.targets || [];
    
    // First, identify all libraries
    for (const target of targets) {
      if (target.level === 0) {
        libraries[target.id] = {
          name: target.name,
          collections: []
        };
      }
    }
    
    // Then, organize collections under their libraries
    for (const target of targets) {
      if (target.level > 0 && target.libraryID) {
        if (libraries[target.libraryID]) {
          libraries[target.libraryID].collections.push({
            id: target.id,
            name: target.name,
            level: target.level,
            parentID: target.parentID !== undefined ? target.parentID : null // Ensure we have a consistent value
          });
        }
      }
    }
    
    // Add library optgroups and their collections
    for (const libID in libraries) {
      // Create optgroup for library
      const optgroup = document.createElement("optgroup");
      optgroup.label = libraries[libID].name;
      dropdown.appendChild(optgroup);
      
      // Add the library as a selectable option
      const libOption = document.createElement("option");
      libOption.value = `${libID}-${libID}`;
      libOption.text = libraries[libID].name + " (All Items)";
      optgroup.appendChild(libOption);
      
      // Sort collections and build a tree structure
      const collections = libraries[libID].collections;
      
      // Debug log for collection data
      console.log(`Library ${libID} collections:`, JSON.parse(JSON.stringify(collections)));
      
      // Build a hierarchy map
      const collectionsByParent = {};
      const rootCollections = [];
      
      // First, group collections by parent
      for (const collection of collections) {
        // Ensure consistent parentID handling (server might return false, undefined, null, or actual ID)
        const parentID = collection.parentID === false ? null : collection.parentID;
        
        if (!parentID) {
          rootCollections.push(collection);
        } else {
          if (!collectionsByParent[parentID]) {
            collectionsByParent[parentID] = [];
          }
          collectionsByParent[parentID].push(collection);
        }
      }
      
      console.log(`Library ${libID} root collections:`, rootCollections);
      console.log(`Library ${libID} collections by parent:`, collectionsByParent);
      
      // If we didn't find any root collections but we have collections,
      // use all collections as root (flat structure)
      if (rootCollections.length === 0 && collections.length > 0) {
        console.log(`No root collections found for library ${libID}, using flat structure`);
        // Add all collections at the top level
        for (const collection of collections) {
          const option = document.createElement("option");
          option.value = `${collection.id}-${libID}`;
          option.text = `• ${collection.name}`;
          optgroup.appendChild(option);
        }
      } else {
        // Function to recursively add collections to the dropdown
        function addCollectionOptions(collection, level) {
          const indent = '—'.repeat(level - 1);
          const option = document.createElement("option");
          option.value = `${collection.id}-${libID}`;
          option.text = indent + (indent ? ' ' : '') + collection.name;
          optgroup.appendChild(option);
          
          // Add child collections if any
          if (collectionsByParent[collection.id]) {
            for (const childCollection of collectionsByParent[collection.id]) {
              addCollectionOptions(childCollection, level + 1);
            }
          }
        }
        
        // Add root collections and their children
        for (const rootCollection of rootCollections) {
          addCollectionOptions(rootCollection, 1);
        }
      }
    }
  
    
    // Re-select the previously selected collection if available
    chrome.storage.local.get(["currentCollection", "currentLibraryID"], (data) => {
      if (data.currentCollection && data.currentLibraryID) {
        const selectValue = `${data.currentCollection}-${data.currentLibraryID}`;
        if ([...dropdown.options].some(option => option.value === selectValue)) {
          dropdown.value = selectValue;
        }
      }
    });
  }

  // Save the state of the Springer switch
  springerSwitch.addEventListener("change", (event) => {
    chrome.runtime.sendMessage({ action: "setSpringerSwitch", value: event.target.checked });
  });

  // Debug mode toggle
  debugMode.addEventListener("change", (event) => {
    chrome.runtime.sendMessage({ action: "setDebugMode", value: event.target.checked });
    if (event.target.checked) {
      showDebugLogs();
      // Refresh logs every 5 seconds when debug mode is on
      window.debugLogsInterval = setInterval(showDebugLogs, 5000);
    } else {
      document.getElementById("debugInfo").innerHTML = "";
      if (window.debugLogsInterval) {
        clearInterval(window.debugLogsInterval);
      }
    }
  });

  // Load debug mode state
  chrome.storage.local.get(["debugMode"], (data) => {
    if (data.debugMode) {
      debugMode.checked = true;
      showDebugLogs();
      // Refresh logs every 5 seconds
      window.debugLogsInterval = setInterval(showDebugLogs, 5000);
    }
  });

  // Fetch items with DOIs but no PDFs when "Fetch Items" button is clicked
  fetchItemsButton.addEventListener("click", () => {
    const collectionId = document.getElementById("collectionsDropdown").value;
    const page = document.getElementById("pageInput").value;
    const itemsPerPage = document.getElementById("itemsPerPageInput").value;
    const tagFilter = document.getElementById("tagFilter").value;
    const excludeJournals = document.getElementById("excludeJournals").value;
  
    if (collectionId) {
      const [scopeObjectKey, libraryID] = collectionId.split("-");
      console.log(`Scope Object Key: ${scopeObjectKey}, Library ID: ${libraryID}, Page: ${page}, Items Per Page: ${itemsPerPage}, Tag Filter: ${tagFilter}, Exclude Journals: ${excludeJournals}`);
      chrome.storage.local.set({
        currentPage: page,
        currentCollection: scopeObjectKey,
        currentLibraryID: libraryID,
        itemsPerPage: itemsPerPage,
        tagFilter: tagFilter,
        excludeJournals: excludeJournals
      });
      
      // Try first with just the basic parameters, without DOI and attachment filters
      chrome.runtime.sendMessage({
        action: "getItemsWithDOIsButNoPDFs",
        libraryID,
        scopeObjectKey,
        page,
        itemsPerPage,
        tagFilter,
        excludeJournals,
        doi: 0,  // Changed from 1 to 0 to disable DOI filter
        attachment: -1  // Changed from 0 to -1 to disable attachment filter
      }, (response) => {
        // Handler code remains the same
        if (response && response.error) {
          console.error("getItemsWithDOIsButNoPDFs error:", response.error);
          errorElement.innerText = response.error;
          errorElement.classList.remove('d-none');
          
          // Debug details remain the same
        } else if (response && response.data) {
          console.log("getItemsWithDOIsButNoPDFs response:", response.data);
          resultList.innerHTML = ""; // Clear previous results
          const itemStatuses = {};
          
          // Check if we got items back
          if (response.data.items && response.data.items.length > 0) {
            response.data.items.forEach(item => {
              const itemElement = document.createElement("li");
              itemElement.className = "list-group-item";
              itemElement.id = `item-${item.itemID}`;
              itemElement.innerHTML = `
                <div class="doi">${item.DOI || 'No DOI'}</div>
                <span class="status" id="status-${item.itemID}"></span>
                <div>${item.title}</div>`;
              resultList.appendChild(itemElement);
              itemStatuses[item.itemID] = { downloaded: false, title: item.title, doi: item.DOI };
            });
          } else {
            // No items returned
            resultList.innerHTML = "<li class='list-group-item'>No items found in this collection. Try changing your filters.</li>";
          }
          
          // Store items in the order they are retrieved
          chrome.storage.local.set({
            itemStatuses: itemStatuses,
            currentItems: response.data.items || [],
            currentPage: page,
            totalPages: response.data.totalPages || 1,
            totalItems: response.data.totalItems || 0
          });
  
          // Update UI elements as before
          
          // Enable Start and Stop buttons only if items were returned
          if (response.data.items && response.data.items.length > 0) {
            startProcessButton.disabled = false;
          } else {
            startProcessButton.disabled = true;
          }
          stopProcessButton.disabled = false;
        } else {
          console.error("Unexpected error occurred while fetching items.");
          errorElement.innerText = `Unexpected error occurred while fetching items.`;
          errorElement.classList.remove('d-none');
        }
      });
    }
  });

  // Start processing items when "Start" button is clicked
  startProcessButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startProcessing" }, response => {
      if (chrome.runtime.lastError) {
        console.error("Error sending startProcessing message:", chrome.runtime.lastError);
      }
    });
  });

  // Placeholder for stop process functionality
  stopProcessButton.addEventListener("click", () => {
    // Implement logic to stop semi-automation if needed
  });
});

// Listen for status updates from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateStatus") {
    const statusElement = document.getElementById(`status-${request.itemID}`);
    if (statusElement) {
      if (request.success) {
        statusElement.textContent = "✔️";
        statusElement.style.color = "green";
      } else {
        statusElement.textContent = "❌";
        statusElement.style.color = "red";
      }
    }
  }

  if (request.action === "fetchNextPage") {
    const currentCollection = document.getElementById("collectionsDropdown").value;
    const currentPage = request.currentPage;
    const itemsPerPage = document.getElementById("itemsPerPageInput").value;
    const tagFilter = document.getElementById("tagFilter").value;
    const excludeJournals = document.getElementById("excludeJournals").value;

    if (currentCollection) {
      const [scopeObjectKey, libraryID] = currentCollection.split("-");
      console.log(`Fetching page ${currentPage}`);
      chrome.storage.local.set({
        currentPage: currentPage,
        currentCollection: scopeObjectKey,
        currentLibraryID: libraryID,
        itemsPerPage: itemsPerPage,
        tagFilter: tagFilter,
        excludeJournals: excludeJournals
      });
      chrome.runtime.sendMessage({
        action: "getItemsWithDOIsButNoPDFs",
        libraryID,
        scopeObjectKey,
        page: currentPage,
        itemsPerPage,
        tagFilter,
        excludeJournals
      }, (response) => {
        if (response && response.error) {
          console.error("getItemsWithDOIsButNoPDFs error:", response.error);
          errorElement.innerText = 'You need Zotero open as well as the ZotAPI extension installed for this to work.';
          errorElement.classList.remove('d-none'); // Show the error message
        } else if (response && response.data) {
          console.log("fetchNextPage response:", response.data);
          resultList.innerHTML = ""; // Clear previous results
          const itemStatuses = {};
          response.data.items.forEach(item => {
            const itemElement = document.createElement("li");
            itemElement.className = "list-group-item";
            itemElement.id = `item-${item.itemID}`;
            itemElement.innerHTML = `
              <div class="doi">${item.DOI}</div>
              <span class="status" id="status-${item.itemID}"></span>
              <div>${item.title}</div>`;
            resultList.appendChild(itemElement);
            itemStatuses[item.itemID] = { downloaded: false, title: item.title, doi: item.DOI };
          });
          // Store items in the order they are retrieved
          chrome.storage.local.set({
            itemStatuses: itemStatuses,
            currentItems: response.data.items,
            currentPage: currentPage,
            totalPages: response.data.totalPages,
            totalItems: response.data.totalItems
          });

          const currentPageElement = document.getElementById("currentPage");
          if (currentPageElement) {
            currentPageElement.textContent = currentPage;
          }
          const totalPagesElement = document.getElementById("totalPages");
          if (totalPagesElement) {
            totalPagesElement.textContent = response.data.totalPages;
          }
          const itemsRemainingElement = document.getElementById("itemsRemaining");
          if (itemsRemainingElement) {
            itemsRemainingElement.textContent = response.data.totalItems;
          }
        } else {
          console.error("Unexpected error occurred while fetching items.");
          errorElement.innerText = `Unexpected error occurred while fetching items.`;
          errorElement.classList.remove('d-none'); // Show the error message
        }
      });
    }
  }
});

// Display item statuses
function displayItemStatuses(currentItems, currentIndex) {
  const resultList = document.getElementById("result");
  resultList.innerHTML = ""; // Clear previous results
  currentItems.forEach((item, index) => {
    const itemElement = document.createElement("li");
    itemElement.className = "list-group-item";
    itemElement.id = `item-${item.itemID}`;
    itemElement.innerHTML = `
      <div class="doi">${item.DOI}</div>
      <span class="status" id="status-${item.itemID}">${index < currentIndex ? "✔️" : ""}</span>
      <div>${item.title}</div>`;
    if (index < currentIndex) {
      itemElement.querySelector(".status").style.color = "green";
    }
    resultList.appendChild(itemElement);
  });
}

// Add debug logs display functionality
function showDebugLogs() {
  const debugElement = document.getElementById("debugInfo");
  if (!debugElement) return;
  
  chrome.storage.local.get(["debugLogs"], (result) => {
    if (result.debugLogs && result.debugLogs.length > 0) {
      const lastTenLogs = result.debugLogs.slice(-10);
      let logHtml = "<strong>Last 10 Debug Logs:</strong><br>";
      lastTenLogs.forEach(log => {
        logHtml += `<div class="log-entry mb-1">
          <small>${log.timestamp}: ${log.message}</small>
        </div>`;
      });
      debugElement.innerHTML = logHtml;
      debugElement.className = "mt-3 small text-monospace bg-light p-2";
      
      // Add clear logs button if it doesn't exist
      if (!document.getElementById("clearLogs")) {
        const clearLogsButton = document.createElement("button");
        clearLogsButton.id = "clearLogs";
        clearLogsButton.className = "btn btn-sm btn-outline-secondary mt-2";
        clearLogsButton.textContent = "Clear Debug Logs";
        clearLogsButton.addEventListener("click", () => {
          chrome.storage.local.set({ debugLogs: [] });
          debugElement.innerHTML = "<strong>Logs cleared</strong>";
        });
        debugElement.after(clearLogsButton);
      }
    } else {
      debugElement.innerHTML = "<strong>No debug logs available</strong>";
      debugElement.className = "mt-3 text-info";
    }
  });
}