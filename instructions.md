Please write a project brief for the chrome extension. I have the following connectors built in a zotero plugin that we can interface with. It is as follows:

To get a list of all collections:
curl --location --request POST 'http://127.0.0.1:23119/connector/getSelectedCollection' \
--header 'Content-Type: application/json'

Output example:
{
    "libraryID": 1,
    "libraryName": "My Library",
    "libraryEditable": true,
    "editable": true,
    "id": 5,
    "name": "AI Ethics",
    "targets": [
        {
            "id": "L1",
            "name": "My Library",
            "level": 0
        },
        {
            "id": "C4",
            "name": "AI and Managerial Decision Making",
            "level": 1
        },

Remember C means Collection, and the 4 is the id we need to use if id = C4 like above. Next is how we then get the items for C4 which is in L1, or libraryID 1:

curl --location 'http://localhost:23119/zotserver/getItemsInCollection' \
--header 'Content-Type: application/json' \
--data '{
  "libraryID": 1,
  "objectType": "item",
  "scopeObject": "collections",
  "scopeObjectKey": "4",
  "doi": 1,
  "attachment": 0,
  "sort": "doi",
  "order": "A",
  "page": 1,
  "itemsPerPage": 2
}
'

For the above take note that doi = 1 means that we want only those items that have a doi number, and attachment 0 is for those items not having an attachment. Sorted ascending by doi. A = Ascending and Z is Descending. page is the page number to retrieve, and itemsPerPage is how many items per page to retrieve.

Here is an exampl eof the output or return values:
{
    "items": [
        {
            "itemID": 661,
            "key": "KX3T7GLR",
            "version": 1735,
            "itemType": "journalArticle",
            "title": "An AI decision-making framework for business value maximization",
            "date": "2023-02",
            "url": "https://doi.org/10.1002%2Faaai.12076",
            "extra": "Publisher: Wiley",
            "volume": "44",
            "pages": "67–84",
            "publicationTitle": "AI Magazine",
            "DOI": "10.1002/aaai.12076",
            "issue": "1",
            "creators": [
                {
                    "firstName": "Naveen",
                    "lastName": "Gudigantala",
                    "creatorType": "author"
                },
                {
                    "firstName": "Sreedhar",
                    "lastName": "Madhavaram",
                    "creatorType": "author"
                },
                {
                    "firstName": "Pelin",
                    "lastName": "Bicen",
                    "creatorType": "author"
                }
            ],
            "tags": [],
            "collections": [
                "8GZFBX9L",
                "XIS8HTUY"
            ],
            "relations": {},
            "dateAdded": "2023-05-19T09:48:53Z",
            "dateModified": "2023-05-19T09:48:53Z",
            "attachments": []
        },
        {
            "itemID": 660,
            "key": "EVFG5UIR",
            "version": 1735,
            "itemType": "journalArticle",
            "title": "Trends in Workplace Wearable Technologies and Connected-Worker Solutions for Next-Generation Occupational Safety, Health, and Productivity",
            "date": "2021-09",
            "url": "https://doi.org/10.1002%2Faisy.202100099",
            "extra": "Publisher: Wiley",
            "volume": "4",
            "pages": "2100099",
            "publicationTitle": "Advanced Intelligent Systems",
            "DOI": "10.1002/aisy.202100099",
            "issue": "1",
            "creators": [
                {
                    "firstName": "Vishal",
                    "lastName": "Patel",
                    "creatorType": "author"
                },
                {
                    "firstName": "Austin",
                    "lastName": "Chesmore",
                    "creatorType": "author"
                },
                {
                    "firstName": "Christopher M.",
                    "lastName": "Legner",
                    "creatorType": "author"
                },
                {
                    "firstName": "Santosh",
                    "lastName": "Pandey",
                    "creatorType": "author"
                }
            ],
            "tags": [],
            "collections": [
                "8GZFBX9L",
                "XIS8HTUY"
            ],
            "relations": {},
            "dateAdded": "2023-05-19T09:48:54Z",
            "dateModified": "2023-05-19T09:48:54Z",
            "attachments": []
        }
    ],
    "currentPage": 1,
    "totalPages": 25,
    "totalItems": 50
}
Then our chrome extension needs to present the list of items to process, the current page number, the total pages and the total items to process. It needs to then have a start and stop button. The start button needs to start the semi-automation if clicked. The semi automation will then work as follows:
1) add https://doi.org/ before the doi number and visit the page.
2) the user then needs to find the pdf to download and initiate the download
3) The chrome extention monitors whether or when the file downloads. If it finds a file that is downloaded, then send the file to zotero using the following post request:

curl --location 'http://localhost:23119/zotserver/attachFile' \
--header 'Content-Type: application/json' \
--data '{
  "itemID": 665,
  "filePath": "D:\\Users\\leonj\\Downloads\\test.pdf",
  "title": "Example PDF"
}
'

The title of the file should be as follows:
auth.lower + shorttitle(3,3) + year + zdpf
last name of first author without spaces, in lowercase because of the .lower filter
The first n (default: 3) words of the title, apply capitalization to first m (default: 0) of those.
year of publication if any,
zdpf = this is a constant text added at the end to indicate we used this extension to add the file.

After uploading with the above, success will be indicated as follows:
{
    "success": true,
    "attachmentItemID": 25952
}

Then the extension should indicate to the left of the item in the list a green tick. If not successful, then it should have a red cross. Either way, it should proceed to the next item as above untill the user clicks the stop button. Below is the current code that you need to adapt to work as described:

manifest.json:
{
  "manifest_version": 3,
  "name": "Zotero DOI PDF Finder",
  "version": "1.0",
  "permissions": [
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "http://127.0.0.1:23119/"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}

background.js:
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

popup.html:
<!-- popup.html -->

<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      width: 300px;
      padding: 20px;
      font-family: Arial, sans-serif;
    }
    #result {
      white-space: pre-wrap;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>Zotero DOI PDF Finder</h1>
  <label for="collectionsDropdown">Select Collection:</label>
  <select id="collectionsDropdown">
    <option value="">Select a collection</option>
  </select>
  <button id="fetchItems">Fetch Items with DOIs but no PDFs</button>
  <div id="result"></div>
  <script src="popup.js"></script>
</body>
</html>

popup.js:
// popup.js

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
        option.value = collection.id;
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
    chrome.runtime.sendMessage({ action: "getItemsWithDOIsButNoPDFs", collectionId }, (response) => {
      const resultDiv = document.getElementById("result");
      resultDiv.innerHTML = "";
      if (response && response.error) {
        console.error("getItemsWithDOIsButNoPDFs error:", response.error);
        resultDiv.innerText = `Error: ${response.error}`;
      } else if (response && response.items) {
        console.log("getItemsWithDOIsButNoPDFs items:", response.items);
        const items = response.items;
        items.forEach(item => {
          const doiLink = `https://doi.org/${item.data.DOI}`;
          const itemElement = document.createElement("div");
          itemElement.innerHTML = `<a href="${doiLink}" target="_blank">${item.data.DOI}</a> - ${item.data.title}`;
          resultDiv.appendChild(itemElement);
        });
      } else {
        console.error("Unexpected error occurred while fetching items.");
        resultDiv.innerText = `Unexpected error occurred while fetching items.`;
      }
    });
  });
});
