// ================= SOURCE FORM HANDLING =================

// Debounce timer for auto-check entity ID
let entityIdCheckTimer = null;

/**
 * Handle entity ID input with debounce for auto-check
 */
function handleEntityIdInput() {
  if (entityIdCheckTimer) clearTimeout(entityIdCheckTimer);
  
  const entityType = getSourceEntityType();
  const entityId = document.getElementById("senderEntityId")?.value.trim();
  
  if (entityType && entityId) {
    entityIdCheckTimer = setTimeout(() => {
      checkSourceEntityName();
    }, 1500);
  } else {
    const entityNameDisplay = document.getElementById("sourceEntityNameDisplay");
    if (entityNameDisplay) entityNameDisplay.textContent = "-";
  }
}

/**
 * Handle entity type dropdown change for source
 * Shows manual input field when "OTHER" is selected
 */
function handleSourceEntityTypeChange() {
  const select = document.getElementById("senderEntityTypeSelect");
  const input = document.getElementById("senderEntityType");
  const val = select.value;

  if (val === 'OTHER') {
    input.classList.remove('hidden');
    input.required = true;
    input.value = '';
    input.focus();
  } else {
    input.classList.add('hidden');
    input.required = false;
    input.value = val; // sync value to hidden input so form logic still works
  }

  safeToggleSelectKeysButton();
  safeToggleCheckSourceButton();
  safeHandleEntityIdInput();
}

window.handleSourceEntityTypeChange = handleSourceEntityTypeChange;

/**
 * Get the effective entity type value (from dropdown or manual input)
 */
function getSourceEntityType() {
  const select = document.getElementById("senderEntityTypeSelect");
  if (select.value === 'OTHER') {
    return document.getElementById("senderEntityType").value.trim().toUpperCase();
  }
  return select.value;
}
async function initSourcePage() {
  const senderForm = document.getElementById("senderForm");
  if (!senderForm) return;

  // Check auth status on page load
  await checkAuthAndRedirect();

  // Restore saved source params from backend
  const savedParams = await window.loadSession('migrationParams');
  if (savedParams) {
    try {
      // Restore entity type — set dropdown, show manual input if needed
      if (savedParams.entityType) {
        const select = document.getElementById("senderEntityTypeSelect");
        const input = document.getElementById("senderEntityType");
        const knownTypes = ['DEVICE', 'ASSET', 'ENTITY_VIEW', 'CUSTOMER', 'USER', 'TENANT'];
        if (knownTypes.includes(savedParams.entityType)) {
          select.value = savedParams.entityType;
          input.value = savedParams.entityType;
          input.classList.add('hidden');
        } else {
          select.value = 'OTHER';
          input.value = savedParams.entityType;
          input.classList.remove('hidden');
          input.required = true;
        }
      }

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
      
      if (window.toggleSelectKeysButton) window.toggleSelectKeysButton();
      if (window.toggleCheckSourceButton) window.toggleCheckSourceButton();
    } catch (e) {
      console.error("Failed to restore source form data:", e);
    }
  }

  // Form submit handler
  senderForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const entityType = getSourceEntityType();
    if (!entityType) {
      alert("Please select or enter an Entity Type.");
      return;
    }

    const rangeMode = document.getElementById("rangeMode");
    const params = {
      entityType: entityType,
      entityId: document.getElementById("senderEntityId").value,
      keys: document.getElementById("senderKeys").value.trim(),
      start: window.convertToMillisUTC(document.getElementById("senderStart").value),
      end: window.convertToMillisUTC(document.getElementById("senderEnd").value),
      rangeMode: rangeMode ? rangeMode.value : "1",
      entityName: document.getElementById("sourceEntityNameDisplay").textContent.trim() !== '-' 
        ? document.getElementById("sourceEntityNameDisplay").textContent.trim() 
        : null
    };

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

    await window.saveSession('migrationParams', params);
    await window.addToHistory('source', params);

    window.location.href = "destination.html";
  });
}

/**
 * Toggle Check Entity button state based on entity type and ID
 */
function toggleCheckSourceButton() {
  const entityType = getSourceEntityType();
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
  const entityType = getSourceEntityType();
  const entityId = document.getElementById("senderEntityId").value.trim();
  const entityNameDisplay = document.getElementById("sourceEntityNameDisplay");
  
  if (!entityType || !entityId) {
    if (entityNameDisplay) entityNameDisplay.textContent = "-";
    return;
  }
  
  const btn = document.getElementById("checkSourceEntityBtn");
  const originalHTML = btn ? btn.innerHTML : null;
  
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="iconify animate-spin" data-icon="mdi:loading"></span> Checking...';
    }
    
    const result = await window.checkEntityName(entityType, entityId, 'source');
    
    if (entityNameDisplay) {
      entityNameDisplay.textContent = (result.success && result.name) ? result.name : '-';
    }
  } catch (error) {
    console.error("Error checking entity name:", error);
    if (entityNameDisplay) entityNameDisplay.textContent = '-';
  } finally {
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

/**
 * Clear all source form fields and saved session
 */
async function clearSourceForm() {
  if (!confirm('Clear all fields?')) return;

  // Reset dropdown and hide manual input
  document.getElementById("senderEntityTypeSelect").value = '';
  const input = document.getElementById("senderEntityType");
  input.value = '';
  input.classList.add('hidden');
  input.required = false;

  document.getElementById("senderEntityId").value = '';
  document.getElementById("senderKeys").value = '';
  document.getElementById("senderStart").value = '';
  document.getElementById("senderEnd").value = '';
  document.getElementById("sourceEntityNameDisplay").textContent = '-';

  // Clear optional fields
  document.getElementById("intervalType").value = '';
  document.getElementById("interval").value = '';
  document.getElementById("timeZone").value = '';
  document.getElementById("senderLimit").value = '';
  document.getElementById("agg").value = '';
  document.getElementById("orderBy").value = '';
  document.getElementById("useStrictDataTypes").checked = false;

  // Disable buttons
  const selectBtn = document.getElementById("selectKeysBtn");
  const checkBtn = document.getElementById("checkSourceEntityBtn");
  if (selectBtn) selectBtn.disabled = true;
  if (checkBtn) checkBtn.disabled = true;

  await window.clearSession('migrationParams');
}

window.clearSourceForm = clearSourceForm;

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
