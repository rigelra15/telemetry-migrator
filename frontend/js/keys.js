// ================= KEYS SELECTION DIALOG =================

let allKeys = [];
let selectedKeys = new Set();

/**
 * Open keys selection dialog
 */
async function openKeysDialog() {
  const entityType = document.getElementById("senderEntityType")?.value.trim();
  const entityId = document.getElementById("senderEntityId")?.value.trim();
  
  if (!entityType || !entityId) {
    alert("Please enter Entity Type and Entity ID first");
    return;
  }

  // Show modal
  document.getElementById("keysModal").classList.remove("hidden");
  
  // Show loading state
  const loading = document.getElementById("keysLoading");
  const error = document.getElementById("keysError");
  const keysList = document.getElementById("keysList");
  
  loading.classList.remove("hidden");
  error.classList.add("hidden");
  keysList.classList.add("hidden");

  // Load current keys from input
  const currentKeys = document.getElementById("senderKeys")?.value.trim();
  if (currentKeys) {
    currentKeys.split(",").forEach(key => selectedKeys.add(key.trim()));
  }

  try {
    // Fetch keys from backend
    const res = await axios.get(`${window.API_URL}/api/keys`, {
      params: {
        entityType: entityType.toUpperCase(),
        entityId: entityId
      }
    });

    allKeys = res.data.keys || [];
    
    // Hide loading, show list
    loading.classList.add("hidden");
    keysList.classList.remove("hidden");
    
    // Render keys
    renderKeys(allKeys);
    document.getElementById("keysCount").textContent = `${allKeys.length} keys available`;
    
  } catch (err) {
    console.error("Error fetching keys:", err);
    loading.classList.add("hidden");
    error.classList.remove("hidden");
    
    const errorMsg = err.response?.data?.detail || err.message || "Unknown error";
    document.getElementById("keysErrorMessage").textContent = errorMsg;
  }
}

/**
 * Render keys checkboxes
 */
function renderKeys(keys) {
  const container = document.getElementById("keysContainer");
  container.innerHTML = "";

  if (keys.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No keys found</p>';
    return;
  }

  keys.forEach(key => {
    const isChecked = selectedKeys.has(key);
    const div = document.createElement("div");
    div.className = "flex items-center gap-2 p-2 rounded hover:bg-gray-50";
    div.innerHTML = `
      <input
        type="checkbox"
        id="key-${key}"
        value="${key}"
        ${isChecked ? "checked" : ""}
        onchange="toggleKey('${key}')"
        class="w-4 h-4 rounded"
        style="accent-color: #1E22AA;"
      />
      <label for="key-${key}" class="flex-1 cursor-pointer text-sm text-gray-700">
        ${key}
      </label>
    `;
    container.appendChild(div);
  });
}

/**
 * Toggle key selection
 */
function toggleKey(key) {
  if (selectedKeys.has(key)) {
    selectedKeys.delete(key);
  } else {
    selectedKeys.add(key);
  }
}

/**
 * Filter keys based on search
 */
function filterKeys() {
  const search = document.getElementById("keysSearch").value.toLowerCase();
  const filtered = allKeys.filter(key => key.toLowerCase().includes(search));
  renderKeys(filtered);
  document.getElementById("keysCount").textContent = `${filtered.length} of ${allKeys.length} keys`;
}

/**
 * Select all visible keys
 */
function selectAllKeys() {
  const search = document.getElementById("keysSearch").value.toLowerCase();
  const filtered = allKeys.filter(key => key.toLowerCase().includes(search));
  filtered.forEach(key => selectedKeys.add(key));
  renderKeys(filtered);
}

/**
 * Clear all visible keys
 */
function clearAllKeys() {
  const search = document.getElementById("keysSearch").value.toLowerCase();
  const filtered = allKeys.filter(key => key.toLowerCase().includes(search));
  filtered.forEach(key => selectedKeys.delete(key));
  renderKeys(filtered);
}

/**
 * Apply selected keys to input field
 */
function applySelectedKeys() {
  const keysInput = document.getElementById("senderKeys");
  keysInput.value = Array.from(selectedKeys).join(", ");
  closeKeysDialog();
}

/**
 * Close keys dialog
 */
function closeKeysDialog() {
  document.getElementById("keysModal").classList.add("hidden");
  document.getElementById("keysSearch").value = "";
}

/**
 * Toggle select keys button enabled/disabled
 */
function toggleSelectKeysButton() {
  const entityType = document.getElementById("senderEntityType")?.value.trim();
  const entityId = document.getElementById("senderEntityId")?.value.trim();
  const selectBtn = document.getElementById("selectKeysBtn");
  
  if (selectBtn) {
    if (entityType && entityId) {
      selectBtn.disabled = false;
    } else {
      selectBtn.disabled = true;
    }
  }
}

// Export to window object
window.openKeysDialog = openKeysDialog;
window.closeKeysDialog = closeKeysDialog;
window.renderKeys = renderKeys;
window.toggleKey = toggleKey;
window.filterKeys = filterKeys;
window.selectAllKeys = selectAllKeys;
window.clearAllKeys = clearAllKeys;
window.applySelectedKeys = applySelectedKeys;
window.toggleSelectKeysButton = toggleSelectKeysButton;
