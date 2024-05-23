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
