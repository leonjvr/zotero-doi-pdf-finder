let currentItems = [];
let currentIndex = 0;
let currentCollection = '';
let currentLibraryID = '';
let currentPage = 1;
let itemsPerPage = 10;
let currentTabId = null;

function debugLog(message, data = null) {
  console.log("[DEBUG] " + message);
  if (data) {
    console.log(data);
  }
  
  chrome.storage.local.get(["debugMode"], (result) => {
    if (result.debugMode) {
      let debugInfo = {
        timestamp: new Date().toISOString(),
        message: message,
        data: data
      };
      
      chrome.storage.local.get(["debugLogs"], (result) => {
        let logs = result.debugLogs || [];
        logs.push(debugInfo);
        // Keep only the last 100 logs
        if (logs.length > 100) {
          logs = logs.slice(-100);
        }
        chrome.storage.local.set({ debugLogs: logs });
      });
    }
  });
}

function setActiveIcon() {
  chrome.action.setIcon({ path: "icons/active_icon.png" });
}

function setNormalIcon() {
  chrome.action.setIcon({ path: "icons/icon48.png" });
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: title,
    message: message,
    priority: 2
  });
}

chrome.runtime.onInstalled.addListener(() => {
  debugLog("Extension installed, initializing storage...");
  chrome.storage.local.get(["currentPage", "currentCollection"], (data) => {
    if (!data.currentPage) {
      chrome.storage.local.set({ currentPage: 1, currentCollection: "" });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog("Received message:", request);

  if (request.action === "getSelectedCollection") {
      fetch("http://localhost:23119/zotapi/getSelectedCollection", {
          method: "POST",
          headers: {
              "Content-Type": "application/json"
          }
      })
      .then(response => {
          debugLog("Received response:", response);
          if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
      })
      .then(data => {
          debugLog("getSelectedCollection response:", data);
          sendResponse({ data });
      })
      .catch(error => {
          console.error("getSelectedCollection error:", error);
          sendResponse({ error: 'You need Zotero open as well as the ZotAPI extension installed for this to work.' });
      });

      return true;  // Keeps the message channel open for sendResponse
  }

  if (request.action === "getItemsWithDOIsButNoPDFs") {
    currentCollection = request.scopeObjectKey;
    currentLibraryID = request.libraryID;
    currentPage = parseInt(request.page, 10);
    itemsPerPage = parseInt(request.itemsPerPage, 10);
  
    debugLog("Requesting items from Zotero with params:", {
      libraryID: parseInt(request.libraryID, 10),
      scopeObjectKey: parseInt(request.scopeObjectKey, 10),
      page: currentPage,
      itemsPerPage: itemsPerPage,
      doi: request.doi !== undefined ? request.doi : 1,  // Default to 1 if not specified
      attachment: request.attachment !== undefined ? request.attachment : 0,  // Default to 0 if not specified
      tag: request.tagFilter,
      excludeJournals: request.excludeJournals ? request.excludeJournals.split(',').map(j => j.trim()) : []
    });
  
    // Try the test endpoint first to verify the server is running
    fetch('http://localhost:23119/zotapi/test', {
      method: "GET"
    })
    .then(response => {
      if (!response.ok) {
        throw new Error("Zotero server is not responding to test endpoint. Is ZotAPI installed correctly?");
      }
      return response.json();
    })
    .then(testData => {
      debugLog("Test endpoint response:", testData);
      
      // Now make the actual request
      return fetch('http://localhost:23119/zotapi/getItemsInCollection', {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          libraryID: parseInt(request.libraryID, 10),
          scopeObjectKey: parseInt(request.scopeObjectKey, 10),
          doi: request.doi !== undefined ? request.doi : 1,
          attachment: request.attachment !== undefined ? request.attachment : 0,
          page: currentPage,
          itemsPerPage: itemsPerPage,
          tag: request.tagFilter,
          excludeJournals: request.excludeJournals ? request.excludeJournals.split(',').map(j => j.trim()) : []
        })
      });
    })
    .then(response => {
      debugLog("Received response:", response);
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`HTTP error! status: ${response.status}, text: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      debugLog("getItemsWithDOIsButNoPDFs response:", data);
      
      // Even though we're not getting items, let's check for other info that might be useful
      debugLog("Response structure:", Object.keys(data));
      
      // Create a fallback response if we didn't get proper items
      let processedData = {
        totalItems: data.totalItems || 0,
        totalPages: data.totalPages || 1,
        currentPage: data.currentPage || currentPage,
        itemsPerPage: data.itemsPerPage || itemsPerPage,
        items: []
      };
  
      // Check if the data has an items property
      if (data.items && Array.isArray(data.items)) {
        // Map items to ensure each has a URL property if it has a DOI
        processedData.items = data.items.map(item => {
          // Create a defensive copy of the item
          const processedItem = {...item};
          if (processedItem.DOI) {
            processedItem.url = `https://doi.org/${processedItem.DOI}`;
            debugLog("Created URL for item", { 
              itemID: processedItem.itemID, 
              DOI: processedItem.DOI, 
              url: processedItem.url 
            });
          } else {
            debugLog("Item has no DOI", { 
              itemID: processedItem.itemID, 
              title: processedItem.title 
            });
          }
          return processedItem;
        });
      } 
      // Check if the data itself is an array
      else if (Array.isArray(data)) {
        processedData.items = data.map(item => {
          const processedItem = {...item};
          if (processedItem.DOI) {
            processedItem.url = `https://doi.org/${processedItem.DOI}`;
            debugLog("Created URL for item", { 
              itemID: processedItem.itemID, 
              DOI: processedItem.DOI, 
              url: processedItem.url 
            });
          }
          return processedItem;
        });
        processedData.totalItems = data.length;
      }
      // Show a debug message even if no items were found
      else {
        debugLog("No valid items found in the response");
      }
  
      // If there are no items but the collection has items as reported in the logs
      if (processedData.items.length === 0) {
        // Display a message in the UI to let the user know there's a plugin issue
        debugLog("ZotAPI found items but couldn't retrieve them - likely a plugin issue");
        
        // Create some mock data if debugging is enabled
        chrome.storage.local.get(["debugMode"], (result) => {
          if (result.debugMode) {
            debugLog("Debug mode is enabled - adding some mock items for testing");
            
            // These won't be real items, just placeholders for testing the UI
            processedData.items = [
              {
                itemID: 1001,
                title: "MOCK ITEM: ZotAPI issue detected - please check plugin",
                DOI: "10.1234/mock.123",
                url: "https://doi.org/10.1234/mock.123",
                creators: [{ lastName: "ZotAPI", firstName: "Issue", creatorType: "author" }],
                date: new Date().toISOString().split('T')[0]
              }
            ];
            processedData.totalItems = 1;
          }
        });
      }
      
      // Set current items and index
      currentItems = processedData.items || [];
      currentIndex = 0;
      
      // Sort items if needed
      if (currentItems.length > 0) {
        currentItems.sort((a, b) => {
          if (a.DOI && b.DOI) return a.DOI.localeCompare(b.DOI);
          return 0;
        });
      }
      
      // Final check to ensure all items have URLs
      debugLog("Final processed items check:", { 
        count: currentItems.length, 
        itemsWithDOIs: currentItems.filter(i => !!i.DOI).length,
        itemsWithURLs: currentItems.filter(i => !!i.url).length
      });
      
      // Store the processed items in storage
      chrome.storage.local.set({
        currentItems: currentItems,
        currentIndex: currentIndex,
        currentCollection: currentCollection,
        currentLibraryID: currentLibraryID,
        currentPage: currentPage,
        itemsPerPage: itemsPerPage,
        totalPages: processedData.totalPages,
        totalItems: processedData.totalItems
      });
      
      sendResponse({ data: processedData });
    })
    .catch(error => {
      console.error("getItemsWithDOIsButNoPDFs error:", error);
      const errorMessage = error.toString();
      debugLog("Error details:", errorMessage);
      sendResponse({ 
        error: "Error fetching items from Zotero. Make sure Zotero is running and ZotAPI plugin is installed. Details: " + errorMessage 
      });
    });
  
    return true; // Keeps the message channel open for sendResponse
  }
  

  if (request.action === "startProcessing") {
    setActiveIcon();
    chrome.storage.local.get(["currentItems", "currentIndex", "currentCollection", "currentLibraryID", "currentPage", "itemsPerPage", "tagFilter", "excludeJournals"], (data) => {
      if (data.currentItems && data.currentItems.length > 0) {
        currentItems = data.currentItems;
        currentIndex = data.currentIndex || 0;
        currentCollection = data.currentCollection;
        currentLibraryID = data.currentLibraryID;
        currentPage = data.currentPage || 1;
        itemsPerPage = data.itemsPerPage || 10;
        debugLog("Starting to process items", { 
          totalItems: currentItems.length, 
          startingAt: currentIndex,
          itemsWithURLs: currentItems.filter(i => !!i.url).length
        });
        processNextItem();
      } else {
        debugLog("No items to process.");
        showNotification("No items to process", "No items found with DOIs that need PDF attachments.");
      }
    });
    sendResponse({});
    return true;
  }

  if (request.action === "getStatus") {
    chrome.storage.local.get(["currentItems", "currentIndex", "currentCollection", "currentLibraryID", "currentPage", "itemsPerPage", "totalPages", "totalItems", "springerSwitch", "tagFilter", "excludeJournals", "debugMode", "debugLogs"], (data) => {
      sendResponse({
        currentItems: data.currentItems,
        currentIndex: data.currentIndex,
        currentCollection: data.currentCollection,
        currentLibraryID: data.currentLibraryID,
        currentPage: data.currentPage,
        itemsPerPage: data.itemsPerPage,
        totalPages: data.totalPages,
        totalItems: data.totalItems,
        springerSwitch: data.springerSwitch,
        tagFilter: data.tagFilter,
        excludeJournals: data.excludeJournals,
        debugMode: data.debugMode,
        debugLogs: data.debugLogs ? data.debugLogs.slice(-10) : []
      });
    });
    return true;
  }

  if (request.action === "setSpringerSwitch") {
    chrome.storage.local.set({ springerSwitch: request.value });
    return true;
  }

  if (request.action === "setDebugMode") {
    chrome.storage.local.set({ debugMode: request.value });
    if (!request.value) {
      // Clear logs when turning off debug mode
      chrome.storage.local.set({ debugLogs: [] });
    }
    return true;
  }

  return false; // Ensures other messages don't get stuck
});

function processNextItem() {
  if (currentIndex >= currentItems.length) {
    debugLog("All items processed on this page");
    chrome.storage.local.get(["currentPage", "totalPages", "currentCollection", "currentLibraryID", "itemsPerPage", "tagFilter", "excludeJournals"], (data) => {
      if (data.currentPage < data.totalPages) {
        currentPage = data.currentPage + 1; // Increment to next page
        itemsPerPage = data.itemsPerPage;
        const scopeObjectKey = data.currentCollection;
        const libraryID = data.currentLibraryID;
        const tagFilter = data.tagFilter;
        const excludeJournals = data.excludeJournals;

        debugLog("Fetching next page of items", {
          page: currentPage,
          totalPages: data.totalPages
        });

        fetch('http://localhost:23119/zotapi/getItemsInCollection', {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            libraryID: parseInt(libraryID, 10),
            scopeObjectKey: parseInt(scopeObjectKey, 10), // Convert to number
            doi: 1,
            attachment: 0,
            page: currentPage,
            itemsPerPage: itemsPerPage,
            tag: tagFilter,
            excludeJournals: excludeJournals ? excludeJournals.split(',').map(j => j.trim()) : []
          })
        })
          .then(response => {
            debugLog("Received response for next page:", response);
            if (!response.ok) {
              return response.text().then(text => {
                throw new Error(`HTTP error! status: ${response.status}, text: ${text}`);
              });
            }
            return response.json();
          })
          .then(data => {
            debugLog("Fetched next page:", data);
            
            // Process items and ensure URLs are created
            if (data.items && Array.isArray(data.items)) {
              currentItems = data.items.map(item => {
                // Create a defensive copy
                const processedItem = {...item};
                if (processedItem.DOI) {
                  processedItem.url = `https://doi.org/${processedItem.DOI}`;
                  debugLog("Created URL for next page item", { 
                    itemID: processedItem.itemID, 
                    DOI: processedItem.DOI 
                  });
                }
                return processedItem;
              });
            } else {
              currentItems = [];
            }
            currentIndex = 0;
            
            if (currentItems.length > 0) {
              // Sort items if needed
              currentItems.sort((a, b) => {
                if (a.DOI && b.DOI) return a.DOI.localeCompare(b.DOI);
                return 0;
              });
            }
            
            debugLog("Processed next page items:", { 
              count: currentItems.length, 
              itemsWithDOIs: currentItems.filter(i => !!i.DOI).length,
              itemsWithURLs: currentItems.filter(i => !!i.url).length
            });
            
            chrome.storage.local.set({
              currentItems: currentItems,
              currentIndex: currentIndex,
              currentPage: currentPage,
              totalPages: data.totalPages || 0,
              totalItems: data.totalItems || 0
            });
            
            if (currentItems.length > 0) {
              processNextItem();
            } else {
              debugLog("No more items to process on next page");
              setNormalIcon();
              showNotification("Process Complete", "All available items have been processed.");
            }
          })
          .catch(error => {
            debugLog("Error fetching next page:", error.toString());
            setNormalIcon();
            showNotification("Error", "Failed to fetch next page of items. See debug logs for details.");
          });
      } else {
        debugLog("Reached the last page, processing complete");
        setNormalIcon();
        showNotification("Process Complete", "All available items have been processed.");
      }
    });
    return;
  }

  const item = currentItems[currentIndex];
  
  // Check for valid item with DOI and URL
  if (!item) {
    debugLog("Invalid item at index " + currentIndex, item);
    currentIndex++;
    chrome.storage.local.set({ currentIndex: currentIndex });
    processNextItem();
    return;
  }
  
  // Ensure the item has a URL - regenerate if missing
  if (!item.url && item.DOI) {
    debugLog("Item missing URL but has DOI, regenerating URL", { 
      itemID: item.itemID, 
      DOI: item.DOI 
    });
    item.url = `https://doi.org/${item.DOI}`;
  }
  
  // Final check before proceeding - must have both DOI and URL
  if (!item.DOI || !item.url) {
    debugLog("Item still missing DOI or URL after fix attempt", item);
    currentIndex++;
    chrome.storage.local.set({ currentIndex: currentIndex });
    processNextItem();
    return;
  }

  chrome.storage.local.get(["springerSwitch"], (data) => {
    let url = item.url;
    if (data.springerSwitch && item.DOI.startsWith("10.1007")) {
      url = `https://link.springer.com/content/pdf/${item.DOI}.pdf`;
      debugLog("Using Springer direct PDF URL", url);
    }
    else if (data.springerSwitch && item.DOI.startsWith("10.1186")) {
      url = `https://globalizationandhealth.biomedcentral.com/counter/pdf/${item.DOI}.pdf`;
      debugLog("Using BioMedCentral direct PDF URL", url);
    }
    else if (data.springerSwitch && item.DOI.startsWith("10.1002")) {
      url = `https://onlinelibrary.wiley.com/doi/epdf/${item.DOI}`;
      debugLog("Using Wiley direct PDF URL", url);
    }

    debugLog("Opening DOI URL:", url);
    chrome.tabs.create({ url: url }, (tab) => {
      currentTabId = tab.id;
      showNotification("Processing Item", `Opening URL for "${item.title}". Please download the PDF.`);
      
      // Set up download listener
      const downloadListener = function(downloadDelta) {
        debugLog("Download changed:", downloadDelta);
        if (downloadDelta.state && downloadDelta.state.current === "complete") {
          chrome.downloads.search({ id: downloadDelta.id }, (downloadItems) => {
            if (downloadItems.length > 0) {
              const downloadItem = downloadItems[0];
              debugLog("Download complete", downloadItem);
              
              // Check if the download is a PDF
              if (downloadItem.filename.toLowerCase().endsWith('.pdf')) {
                debugLog("PDF downloaded for item:", item);
                chrome.downloads.onChanged.removeListener(downloadListener);
                handleDownload(downloadItem, item);
              } else {
                debugLog("Downloaded file is not a PDF, ignoring", downloadItem.filename);
              }
            }
          });
        }
      };
      
      chrome.downloads.onChanged.addListener(downloadListener);
      
      // Safety timeout after 5 minutes to prevent hanging if no PDF is downloaded
      setTimeout(() => {
        chrome.downloads.onChanged.removeListener(downloadListener);
        if (currentTabId === tab.id) {
          debugLog("Download timeout for item", item);
          chrome.tabs.remove(currentTabId, () => {
            currentTabId = null;
            currentIndex++;
            chrome.storage.local.set({ currentIndex: currentIndex });
            processNextItem();
          });
        }
      }, 5 * 60 * 1000); // 5 minutes
    });
  });
}

function handleDownload(downloadItem, item) {
  const filePath = downloadItem.filename;
  const title = generateTitle(item);
  
  // Ensure we have a valid itemID
  if (!item.itemID) {
    debugLog("Error: Item has no itemID", item);
    currentIndex++;
    chrome.storage.local.set({ currentIndex: currentIndex });
    if (currentTabId !== null) {
      chrome.tabs.remove(currentTabId, () => {
        currentTabId = null;
        processNextItem();
      });
    } else {
      processNextItem();
    }
    return;
  }
  
  const attachFilePayload = {
    itemID: item.itemID,
    filePath: filePath,
    title: title
  };

  debugLog("Attaching file to Zotero 7:", attachFilePayload);
  showNotification("Sending file to Zotero", `Attaching file for "${item.title}"`);
  
  fetch('http://localhost:23119/zotapi/attachFile', {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(attachFilePayload)
  })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`HTTP error! status: ${response.status}, text: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      debugLog("File attached successfully:", data);
      updateStatus(item.itemID, true);
      
      // Add tag if successful
      if (data.attachmentID) {
        return addTagToItem(item.itemID, "PDF Found").then(() => data);
      }
      return data;
    })
    .then(() => {
      currentIndex++;
      chrome.storage.local.set({ currentIndex: currentIndex });
      
      if (currentTabId !== null) {
        chrome.tabs.remove(currentTabId, () => {
          currentTabId = null;
          processNextItem();
        });
      } else {
        processNextItem();
      }
    })
    .catch(error => {
      debugLog("Error attaching file:", error.toString());
      updateStatus(item.itemID, false);
      showNotification("Error", `Failed to attach file to "${item.title}": ${error.toString()}`);
      
      currentIndex++;
      chrome.storage.local.set({ currentIndex: currentIndex });
      
      if (currentTabId !== null) {
        chrome.tabs.remove(currentTabId, () => {
          currentTabId = null;
          processNextItem();
        });
      } else {
        processNextItem();
      }
    });
}

function updateStatus(itemID, success) {
  chrome.storage.local.get("itemStatuses", (data) => {
    if (data.itemStatuses && data.itemStatuses[itemID]) {
      data.itemStatuses[itemID].downloaded = success;
      chrome.storage.local.set({ itemStatuses: data.itemStatuses }, () => {
        const message = {
          action: "updateStatus",
          itemID: itemID,
          success: success
        };
        debugLog("Sending updateStatus message:", message);
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            debugLog("Error sending updateStatus message:", chrome.runtime.lastError);
          } else {
            debugLog("updateStatus message sent successfully");
          }
        });
      });
    } else {
      debugLog("itemStatuses not found or item not in statuses");
      // Initialize if not exists
      const itemStatuses = data.itemStatuses || {};
      itemStatuses[itemID] = { downloaded: success };
      chrome.storage.local.set({ itemStatuses: itemStatuses });
    }
  });
}

// Helper function to add a tag to an item
function addTagToItem(itemID, tagName) {
  return fetch('http://localhost:23119/zotapi/tagItem', {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      itemID: itemID,
      tag: tagName
    })
  })
  .then(response => {
    if (!response.ok) {
      return response.text().then(text => {
        throw new Error(`HTTP error adding tag! status: ${response.status}, text: ${text}`);
      });
    }
    return response.json();
  })
  .then(data => {
    debugLog("Tag added successfully:", data);
    return data;
  })
  .catch(error => {
    debugLog("Error adding tag:", error.toString());
    // Continue processing even if tag addition fails
    return null;
  });
}

function generateTitle(item) {
  let author = "anonymous";
  if (item.creators && item.creators.length > 0 && item.creators[0].lastName) {
    author = item.creators[0].lastName.toLowerCase();
  }
  
  const titleWords = item.title ? 
    item.title.split(" ").slice(0, 3).join(" ") : 
    "untitled";
    
  const year = item.date ? 
    item.date.split("-")[0] : 
    new Date().getFullYear();
    
  return `${author}_${titleWords}_${year}`;
}