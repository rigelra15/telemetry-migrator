// ================= SOURCE FORM HANDLING =================

// Debounce timer for auto-check entity ID
let entityIdCheckTimer = null;

/**
 * Handle entity ID input with debounce for auto-check
 */
function handleEntityIdInput() {
  // Clear previous timer
  if (entityIdCheckTimer) {
    clearTimeout(entityIdCheckTimer);
  }
  
  const entityType = document.getElementById("senderEntityType")?.value.trim();
  const entityId = document.getElementById("senderEntityId")?.value.trim();
  
  // Only auto-check if both fields are filled
  if (entityType && entityId) {
    // Set new timer for 1.5 seconds (no loading state shown)
    entityIdCheckTimer = setTimeout(() => {
      checkSourceEntityName();
    }, 1500);
  } else {
    // Clear entity name if fields are empty
    const entityNameDisplay = document.getElementById("sourceEntityNameDisplay");
    if (entityNameDisplay) {
      entityNameDisplay.textContent = "-";
    }
  }
}

/**
 * Initialize source page
 */
async function initSourcePage() {
  const senderForm = document.getElementById("senderForm");
  if (!senderForm) return;

  // Check auth status on page load
  await checkAuthAndRedirect();

  // Restore saved source params from backend
  const savedParams = await window.loadSession('migrationParams');
  if (savedParams) {
    try {
      // Required fields
      if (savedParams.entityType) document.getElementById("senderEntityType").value = savedParams.entityType;
      if (savedParams.entityId) document.getElementById("senderEntityId").value = savedParams.entityId;
      if (savedParams.keys) document.getElementById("senderKeys").value = savedParams.keys;
      
      if (savedParams.start) {
        document.getElementById("senderStart").value = window.convertMillisToDatetimeLocal(savedParams.start);
      }
      if (savedParams.end) {
        document.getElementById("senderEnd").value = window.convertMillisToDatetimeLocal(savedParams.end);
      }
      
      // Restore entity name if available
      if (savedParams.entityName) {
        const entityNameDisplay = document.getElementById("sourceEntityNameDisplay");
        if (entityNameDisplay) {
          entityNameDisplay.textContent = savedParams.entityName;
        }
      }
      
      // Optional fields
      if (savedParams.intervalType) document.getElementById("intervalType").value = savedParams.intervalType;
      if (savedParams.interval !== undefined) document.getElementById("interval").value = savedParams.interval;
      if (savedParams.timeZone) document.getElementById("timeZone").value = savedParams.timeZone;
      if (savedParams.limit) document.getElementById("senderLimit").value = savedParams.limit;
      if (savedParams.agg) document.getElementById("agg").value = savedParams.agg;
      if (savedParams.orderBy) document.getElementById("orderBy").value = savedParams.orderBy;
      if (savedParams.useStrictDataTypes) document.getElementById("useStrictDataTypes").checked = true;
      
      const rangeMode = document.getElementById("rangeMode");
      if (rangeMode && savedParams.rangeMode) rangeMode.value = savedParams.rangeMode;
      
      // Enable Select Keys button if entity type and ID are filled
      if (window.toggleSelectKeysButton) {
        window.toggleSelectKeysButton();
      }
      
      // Enable Check button if entity type and ID are filled
      if (window.toggleCheckSourceButton) {
        window.toggleCheckSourceButton();
      }
    } catch (e) {
      console.error("Failed to restore source form data:", e);
    }
  }

  // Form submit handler
  senderForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const rangeMode = document.getElementById("rangeMode");
    const params = {
      // Required fields
      entityType: document.getElementById("senderEntityType").value.toUpperCase(),
      entityId: document.getElementById("senderEntityId").value,
      keys: document.getElementById("senderKeys").value.trim(),
      start: window.convertToMillisUTC(document.getElementById("senderStart").value),
      end: window.convertToMillisUTC(document.getElementById("senderEnd").value),
      rangeMode: rangeMode ? rangeMode.value : "1",
      entityName: document.getElementById("sourceEntityNameDisplay").textContent.trim() !== '-' 
        ? document.getElementById("sourceEntityNameDisplay").textContent.trim() 
        : null
    };

    // Add optional fields if provided
    const intervalType = document.getElementById("intervalType").value;
    if (intervalType) params.intervalType = intervalType;
    
    const interval = document.getElementById("interval").value;
    if (interval !== '') params.interval = parseInt(interval);
    
    const timeZone = document.getElementById("timeZone").value.trim();
    if (timeZone) params.timeZone = timeZone;
    
    const limit = document.getElementById("senderLimit").value;
    if (limit) params.limit = parseInt(limit);
    
    const agg = document.getElementById("agg").value;
    if (agg) params.agg = agg;
    
    const orderBy = document.getElementById("orderBy").value;
    if (orderBy) params.orderBy = orderBy;
    
    const useStrictDataTypes = document.getElementById("useStrictDataTypes").checked;
    if (useStrictDataTypes) params.useStrictDataTypes = true;

    // Save to backend file storage
    await window.saveSession('migrationParams', params);
    
    // Save to history
    await window.addToHistory('source', params);

    window.location.href = "destination.html";
  });
}

/**
 * Toggle Check Entity button state based on entity type and ID
 */
function toggleCheckSourceButton() {
  const entityType = document.getElementById("senderEntityType")?.value.trim();
  const entityId = document.getElementById("senderEntityId")?.value.trim();
  const checkBtn = document.getElementById("checkSourceEntityBtn");
  
  if (checkBtn) {
    checkBtn.disabled = !(entityType && entityId);
  }
}

/**
 * Check entity name for source entity
 */
async function checkSourceEntityName() {
  const entityType = document.getElementById("senderEntityType").value.trim();
  const entityId = document.getElementById("senderEntityId").value.trim();
  const entityNameDisplay = document.getElementById("sourceEntityNameDisplay");
  
  if (!entityType || !entityId) {
    if (entityNameDisplay) {
      entityNameDisplay.textContent = "-";
    }
    return;
  }
  
  const btn = document.getElementById("checkSourceEntityBtn");
  const originalHTML = btn ? btn.innerHTML : null;
  
  try {
    // Show loading state on button only
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="iconify animate-spin" data-icon="mdi:loading"></span> Checking...';
    }
    
    const result = await window.checkEntityName(entityType, entityId, 'source');
    
    if (result.success && result.name) {
      // Show entity name as plain text
      if (entityNameDisplay) {
        entityNameDisplay.textContent = result.name;
      }
    } else {
      // Show dash if not found
      if (entityNameDisplay) {
        entityNameDisplay.textContent = '-';
      }
    }
  } catch (error) {
    console.error("Error checking entity name:", error);
    if (entityNameDisplay) {
      entityNameDisplay.textContent = '-';
    }
  } finally {
    // Restore button state
    if (btn && originalHTML) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }
}

/**
 * Check authentication and redirect if not logged in
 */
async function checkAuthAndRedirect() {
  try {
    const res = await axios.get(`${window.API_URL}/api/auth/status`);
    if (!res.data.bothLoggedIn) {
      alert("Please login first!");
      window.location.href = "index.html";
      return false;
    }
    return true;
  } catch (error) {
    console.error("Auth check failed:", error);
    window.location.href = "index.html";
    return false;
  }
}

// Export to window object
window.initSourcePage = initSourcePage;
window.checkSourceEntityName = checkSourceEntityName;
window.toggleCheckSourceButton = toggleCheckSourceButton;
window.handleEntityIdInput = handleEntityIdInput;

// Auto-initialize if on source page when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById("senderForm")) {
      initSourcePage();
    }
  });
} else {
  // DOM already loaded
  if (document.getElementById("senderForm")) {
    initSourcePage();
  }
}
