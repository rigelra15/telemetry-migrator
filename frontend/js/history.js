// ================= HISTORY MANAGEMENT =================

// Global interval IDs for timestamp updates
let sourceTimestampInterval = null;
let destTimestampInterval = null;

/**
 * Update all visible timestamps in realtime
 */
function updateTimestamps() {
  // Update all elements with data-timestamp attribute
  document.querySelectorAll('[data-timestamp]').forEach(el => {
    const timestamp = parseInt(el.dataset.timestamp);
    if (timestamp) {
      el.textContent = window.formatFullTimestamp(timestamp);
    }
  });
}

/**
 * Format keys string into badge HTML
 */
function formatKeysAsBadges(keysString) {
  if (!keysString || keysString === '-') return '<span class="text-gray-500 text-xs">No keys</span>';
  
  const keysArray = keysString.split(',').map(k => k.trim()).filter(k => k);
  
  return `
    <div class="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
      ${keysArray.map((key, index) => `
        <div class="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs bg-blue-50 border border-blue-200">
          <span class="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
            ${index + 1}
          </span>
          <span class="flex-1 text-blue-700 font-medium truncate" title="${key}">${key}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Open source history detail modal
 */
async function openSourceHistoryModal(id) {
  const history = await window.loadHistory('source');
  const item = history.find(h => h.id === id);
  
  if (!item) return;
  
  const modal = document.getElementById('sourceHistoryModal');
  const content = document.getElementById('sourceHistoryModalContent');
  
  // Format dates
  const startDate = item.start ? window.formatDate(item.start) : '-';
  const endDate = item.end ? window.formatDate(item.end) : '-';
  
  content.innerHTML = `
    <div class="space-y-4">
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity Type</label>
        <div class="mt-1 text-sm font-semibold text-gray-800">${item.entityType}</div>
      </div>
      ${item.entityName ? `
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity Name</label>
        <div class="mt-1 text-sm font-semibold text-blue-600">${item.entityName}</div>
      </div>
      ` : ''}
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity ID</label>
        <div class="mt-1 text-xs font-mono text-gray-700 break-all">${item.entityId}</div>
      </div>
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Keys</label>
        <div class="mt-1">${formatKeysAsBadges(item.keys)}</div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Limit</label>
          <div class="mt-1 text-sm font-semibold text-gray-800">${item.limit || '-'}</div>
        </div>
        <div>
          <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Range Mode</label>
          <div class="mt-1 text-sm font-semibold text-gray-800">${item.rangeMode || '1'}</div>
        </div>
      </div>
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Start Time</label>
        <div class="mt-1 text-xs text-gray-700">${startDate}</div>
      </div>
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">End Time</label>
        <div class="mt-1 text-xs text-gray-700">${endDate}</div>
      </div>
      <div class="pt-2 border-t">
        <label class="text-xs text-gray-500 font-medium">Created</label>
        <div class="mt-1 text-xs text-gray-600">${window.formatFullTimestamp(item.timestamp)}</div>
      </div>
    </div>
  `;
  
  // Store current item id for apply function
  modal.dataset.itemId = id;
  modal.classList.remove('hidden');
}

/**
 * Open destination history detail modal
 */
async function openDestinationHistoryModal(id) {
  const history = await window.loadHistory('destination');
  const item = history.find(h => h.id === id);
  
  if (!item) return;
  
  const modal = document.getElementById('destHistoryModal');
  const content = document.getElementById('destHistoryModalContent');
  
  content.innerHTML = `
    <div class="space-y-4">
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity Type</label>
        <div class="mt-1 text-sm font-semibold text-gray-800">${item.targetEntityType}</div>
      </div>
      ${item.targetEntityName ? `
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity Name</label>
        <div class="mt-1 text-sm font-semibold text-pink-600">${item.targetEntityName}</div>
      </div>
      ` : ''}
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity ID</label>
        <div class="mt-1 text-xs font-mono text-gray-700 break-all">${item.targetEntityId}</div>
      </div>
      <div>
        <label class="text-xs text-gray-600 font-medium uppercase tracking-wide">Scope</label>
        <div class="mt-1 text-sm font-semibold text-gray-800">${item.scope || 'ANY'}</div>
      </div>
      <div class="pt-2 border-t">
        <label class="text-xs text-gray-500 font-medium">Created</label>
        <div class="mt-1 text-xs text-gray-600">${window.formatFullTimestamp(item.timestamp)}</div>
      </div>
    </div>
  `;
  
  // Store current item id for apply function
  modal.dataset.itemId = id;
  modal.classList.remove('hidden');
}

/**
 * Close source history modal
 */
function closeSourceHistoryModal() {
  document.getElementById('sourceHistoryModal').classList.add('hidden');
}

/**
 * Close destination history modal
 */
function closeDestinationHistoryModal() {
  document.getElementById('destHistoryModal').classList.add('hidden');
}

/**
 * Apply source history from modal
 */
async function applySourceHistoryFromModal() {
  const modal = document.getElementById('sourceHistoryModal');
  const id = parseInt(modal.dataset.itemId);
  
  const history = await window.loadHistory('source');
  const item = history.find(h => h.id === id);
  
  if (!item) return;
  
  // Fill form fields
  document.getElementById("senderEntityType").value = item.entityType || "";
  document.getElementById("senderEntityId").value = item.entityId || "";
  document.getElementById("senderKeys").value = item.keys || "";
  document.getElementById("senderLimit").value = item.limit || "";
  
  // Populate entity name if available
  if (item.entityName) {
    document.getElementById("sourceEntityNameDisplay").textContent = item.entityName;
    document.getElementById("sourceEntityNameContainer").classList.remove("hidden");
  } else {
    document.getElementById("sourceEntityNameDisplay").textContent = "-";
    document.getElementById("sourceEntityNameContainer").classList.add("hidden");
  }
  
  const rangeMode = document.getElementById("rangeMode");
  if (rangeMode) rangeMode.value = item.rangeMode || "1";
  
  // Handle datetime fields
  if (item.start) {
    const startDate = new Date(item.start);
    document.getElementById("senderStart").value = window.formatDateTimeLocal(startDate);
  }
  if (item.end) {
    const endDate = new Date(item.end);
    document.getElementById("senderEnd").value = window.formatDateTimeLocal(endDate);
  }
  
  closeSourceHistoryModal();
  
  // Enable buttons based on filled values (use setTimeout to ensure DOM is updated)
  setTimeout(() => {
    if (window.toggleSelectKeysButton) {
      window.toggleSelectKeysButton();
    }
    if (window.toggleCheckSourceButton) {
      window.toggleCheckSourceButton();
    }
    
    // Auto-check entity name
    if (window.checkSourceEntityName && item.entityType && item.entityId) {
      window.checkSourceEntityName();
    }
  }, 100);
  
  // Scroll to top of form
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Apply destination history from modal
 */
async function applyDestinationHistoryFromModal() {
  const modal = document.getElementById('destHistoryModal');
  const id = parseInt(modal.dataset.itemId);
  
  const history = await window.loadHistory('destination');
  const item = history.find(h => h.id === id);
  
  if (!item) return;
  
  // Fill form fields
  document.getElementById("receiverEntityType").value = item.targetEntityType || "";
  document.getElementById("receiverEntityId").value = item.targetEntityId || "";
  
  // Populate entity name if available
  if (item.targetEntityName) {
    document.getElementById("destEntityNameDisplay").textContent = item.targetEntityName;
    document.getElementById("destEntityNameContainer").classList.remove("hidden");
  } else {
    document.getElementById("destEntityNameDisplay").textContent = "-";
    document.getElementById("destEntityNameContainer").classList.add("hidden");
  }
  
  const scopeField = document.getElementById("receiverScope");
  if (scopeField) scopeField.value = item.scope || "ANY";
  
  closeDestinationHistoryModal();
  
  // Enable buttons based on filled values (use setTimeout to ensure DOM is updated)
  setTimeout(() => {
    if (window.toggleCheckDestButton) {
      window.toggleCheckDestButton();
    }
    
    // Auto-check entity name
    if (window.checkDestEntityName && item.targetEntityType && item.targetEntityId) {
      window.checkDestEntityName();
    }
  }, 100);
  
  // Scroll to top of form
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Delete source history item
 */
async function deleteSourceHistory(id) {
  await window.deleteFromHistory('source', id);
  renderSourceHistory();
}

/**
 * Delete destination history item
 */
async function deleteDestinationHistory(id) {
  await window.deleteFromHistory('destination', id);
  renderDestinationHistory();
}

/**
 * Render source history cards
 */
async function renderSourceHistory() {
  const container = document.getElementById("sourceHistoryContainer");
  if (!container) return;
  
  // Clear existing interval
  if (sourceTimestampInterval) {
    clearInterval(sourceTimestampInterval);
    sourceTimestampInterval = null;
  }
  
  const history = await window.loadHistory('source');
  
  if (history.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <p class="text-sm">No history yet</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = history.map(item => `
    <div class="border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:shadow-md transition cursor-pointer group relative" onclick="openSourceHistoryModal(${item.id})">
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm text-gray-800 truncate">${item.entityType}</div>
            ${item.entityName ? `<div class="text-xs text-blue-600 font-medium truncate">${item.entityName}</div>` : ''}
            <div class="text-xs text-gray-500 font-mono break-all">${item.entityId}</div>
          </div>
          <button 
            onclick="event.stopPropagation(); if(confirm('Delete this history?')) deleteSourceHistory(${item.id})"
            class="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-red-50 rounded"
            title="Delete"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="truncate" data-timestamp="${item.timestamp}">${window.formatFullTimestamp(item.timestamp)}</span>
        </div>
        <div class="text-xs text-gray-600">
          <span class="font-medium">${item.keys ? item.keys.split(',').length : 0}</span> keys, 
          Limit: <span class="font-medium">${item.limit}</span>
        </div>
      </div>
    </div>
  `).join('');
  
  // Start realtime timestamp updates every second
  sourceTimestampInterval = setInterval(updateTimestamps, 1000);
}

/**
 * Render destination history cards
 */
async function renderDestinationHistory() {
  const container = document.getElementById("destinationHistoryContainer");
  if (!container) return;
  
  // Clear existing interval
  if (destTimestampInterval) {
    clearInterval(destTimestampInterval);
    destTimestampInterval = null;
  }
  
  const history = await window.loadHistory('destination');
  
  if (history.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <p class="text-sm">No history yet</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = history.map(item => `
    <div class="border border-gray-200 rounded-lg p-3 hover:border-pink-400 hover:shadow-md transition cursor-pointer group relative" onclick="openDestinationHistoryModal(${item.id})">
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm text-gray-800 truncate">${item.targetEntityType}</div>
            ${item.targetEntityName ? `<div class="text-xs text-pink-600 font-medium truncate">${item.targetEntityName}</div>` : ''}
            <div class="text-xs text-gray-500 font-mono break-all">${item.targetEntityId}</div>
          </div>
          <button 
            onclick="event.stopPropagation(); if(confirm('Delete this history?')) deleteDestinationHistory(${item.id})"
            class="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-red-50 rounded"
            title="Delete"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="truncate" data-timestamp="${item.timestamp}">${window.formatFullTimestamp(item.timestamp)}</span>
        </div>
        <div class="text-xs text-gray-600">
          Scope: <span class="font-medium">${item.scope || 'ANY'}</span>
        </div>
      </div>
    </div>
  `).join('');
  
  // Start realtime timestamp updates every second
  destTimestampInterval = setInterval(updateTimestamps, 1000);
}

// Export to window object
window.openSourceHistoryModal = openSourceHistoryModal;
window.openDestinationHistoryModal = openDestinationHistoryModal;
window.closeSourceHistoryModal = closeSourceHistoryModal;
window.closeDestinationHistoryModal = closeDestinationHistoryModal;
window.applySourceHistoryFromModal = applySourceHistoryFromModal;
window.applyDestinationHistoryFromModal = applyDestinationHistoryFromModal;
window.deleteSourceHistory = deleteSourceHistory;
window.deleteDestinationHistory = deleteDestinationHistory;
window.renderSourceHistory = renderSourceHistory;
window.renderDestinationHistory = renderDestinationHistory;

// Auto-render history on page load when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById("sourceHistoryContainer")) {
      renderSourceHistory();
    }
    if (document.getElementById("destinationHistoryContainer")) {
      renderDestinationHistory();
    }
  });
} else {
  // DOM already loaded
  if (document.getElementById("sourceHistoryContainer")) {
    renderSourceHistory();
  }
  if (document.getElementById("destinationHistoryContainer")) {
    renderDestinationHistory();
  }
}
