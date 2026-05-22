// ================= DESTINATION FORM HANDLING =================

// Debounce timer for auto-check entity ID
let destEntityIdCheckTimer = null;

/**
 * Handle entity ID input with debounce for auto-check
 */
function handleDestEntityIdInput() {
  console.log('handleDestEntityIdInput called');
  
  // Clear previous timer
  if (destEntityIdCheckTimer) {
    clearTimeout(destEntityIdCheckTimer);
  }
  
  const entityType = document.getElementById("receiverEntityType")?.value.trim();
  const entityId = document.getElementById("receiverEntityId")?.value.trim();
  
  console.log('Entity Type:', entityType, 'Entity ID:', entityId);
  
  // Only auto-check if both fields are filled
  if (entityType && entityId) {
    console.log('Setting timer for auto-check in 1.5 seconds...');
    // Set new timer for 1.5 seconds (no loading state shown)
    destEntityIdCheckTimer = setTimeout(() => {
      console.log('Timer triggered, calling checkDestEntityName...');
      checkDestEntityName();
    }, 1500);
  } else {
    // Clear entity name if fields are empty
    const entityNameDisplay = document.getElementById("destEntityNameDisplay");
    if (entityNameDisplay) {
      entityNameDisplay.textContent = "-";
    }
  }
}

/**
 * Handle entity type dropdown change for destination
 */
function handleDestEntityTypeChange() {
  const select = document.getElementById("receiverEntityTypeSelect");
  const input = document.getElementById("receiverEntityType");
  const val = select.value;

  if (val === 'OTHER') {
    input.classList.remove('hidden');
    input.required = true;
    input.value = '';
    input.focus();
  } else {
    input.classList.add('hidden');
    input.required = false;
    input.value = val;
  }

  safeToggleCheckDestButton();
  safeHandleDestEntityIdInput();
}

window.handleDestEntityTypeChange = handleDestEntityTypeChange;

/**
 * Get the effective entity type value for destination
 */
function getDestEntityType() {
  const select = document.getElementById("receiverEntityTypeSelect");
  if (select.value === 'OTHER') {
    return document.getElementById("receiverEntityType").value.trim().toUpperCase();
  }
  return select.value;
}

// Export immediately after definition to avoid issues
window.handleDestEntityIdInput = handleDestEntityIdInput;
console.log('Exported handleDestEntityIdInput to window:', typeof window.handleDestEntityIdInput);

/**
 * Initialize destination page
 */
async function initDestinationPage() {
  const receiverForm = document.getElementById("receiverForm");
  if (!receiverForm) return;

  // Check auth status on page load
  await checkAuthAndRedirect();

  // Restore saved target config from backend
  const savedTarget = await window.loadSession('targetConfig');
  if (savedTarget) {
    try {
      if (savedTarget.targetEntityType) {
        const select = document.getElementById("receiverEntityTypeSelect");
        const input = document.getElementById("receiverEntityType");
        const knownTypes = ['DEVICE', 'ASSET', 'ENTITY_VIEW', 'CUSTOMER', 'USER', 'TENANT'];
        if (knownTypes.includes(savedTarget.targetEntityType)) {
          select.value = savedTarget.targetEntityType;
          input.value = savedTarget.targetEntityType;
          input.classList.add('hidden');
        } else {
          select.value = 'OTHER';
          input.value = savedTarget.targetEntityType;
          input.classList.remove('hidden');
          input.required = true;
        }
      }
      if (savedTarget.targetEntityId) document.getElementById("receiverEntityId").value = savedTarget.targetEntityId;
      if (savedTarget.scope) document.getElementById("receiverScope").value = savedTarget.scope;
      
      const entityNameDisplay = document.getElementById("destEntityNameDisplay");
      if (savedTarget.targetEntityName) {
        entityNameDisplay.textContent = savedTarget.targetEntityName;
      } else {
        entityNameDisplay.textContent = "-";
      }
      
      if (window.toggleCheckDestButton) window.toggleCheckDestButton();
    } catch (e) {
      console.error("Failed to restore destination form data:", e);
    }
  }

  // Form submit handler
  receiverForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const params = await window.loadSession('migrationParams');
    if (!params) return alert("Missing source parameters");

    const targetEntityType = getDestEntityType();
    if (!targetEntityType) {
      alert("Please select or enter a Target Entity Type.");
      return;
    }
    const targetEntityId = document.getElementById("receiverEntityId").value;
    const scope = document.getElementById("receiverScope").value;

    const targetConfig = {
      targetEntityType,
      targetEntityId,
      scope,
      targetEntityName: document.getElementById("destEntityNameDisplay").textContent.trim() !== '-' 
        ? document.getElementById("destEntityNameDisplay").textContent.trim() 
        : null
    };

    // Save target config to backend file storage
    await window.saveSession('targetConfig', targetConfig);
    
    // Save to history
    await window.addToHistory('destination', targetConfig);

    // Navigate to migrate page
    window.location.href = "migrate.html";
  });
}

/**
 * Toggle Check Entity button state based on entity type and ID
 */
function toggleCheckDestButton() {
  const entityType = getDestEntityType();
  const entityId = document.getElementById("receiverEntityId")?.value.trim();
  const checkBtn = document.getElementById("checkDestEntityBtn");
  if (checkBtn) {
    checkBtn.disabled = !(entityType && entityId);
  }
}

/**
 * Check entity name for destination entity
 */
async function checkDestEntityName() {
  const entityType = getDestEntityType();
  const entityId = document.getElementById("receiverEntityId").value.trim();
  
  if (!entityType || !entityId) return;
  
  const btn = document.getElementById("checkDestEntityBtn");
  const entityNameDisplay = document.getElementById("destEntityNameDisplay");
  const originalHTML = btn ? btn.innerHTML : '';
  
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="iconify animate-spin" data-icon="mdi:loading"></span> Checking...';
    }
    
    const result = await window.checkEntityName(entityType, entityId, 'destination');
    entityNameDisplay.textContent = result.success ? result.name : "-";
  } catch (error) {
    console.error("Error checking entity name:", error);
    entityNameDisplay.textContent = "-";
  } finally {
    if (btn) {
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
window.initDestinationPage = initDestinationPage;
window.checkDestEntityName = checkDestEntityName;
window.toggleCheckDestButton = toggleCheckDestButton;
// handleDestEntityIdInput already exported earlier

/**
 * Clear all destination form fields and saved session
 */
async function clearDestinationForm() {
  if (!confirm('Clear all fields?')) return;

  // Reset dropdown and hide manual input
  document.getElementById("receiverEntityTypeSelect").value = '';
  const input = document.getElementById("receiverEntityType");
  input.value = '';
  input.classList.add('hidden');
  input.required = false;

  document.getElementById("receiverEntityId").value = '';
  document.getElementById("destEntityNameDisplay").textContent = '-';

  const checkBtn = document.getElementById("checkDestEntityBtn");
  if (checkBtn) checkBtn.disabled = true;

  await window.clearSession('targetConfig');
}

window.clearDestinationForm = clearDestinationForm;

console.log('All destination.js functions exported:', {
  initDestinationPage: typeof window.initDestinationPage,
  checkDestEntityName: typeof window.checkDestEntityName,
  toggleCheckDestButton: typeof window.toggleCheckDestButton,
  handleDestEntityIdInput: typeof window.handleDestEntityIdInput
});

// Auto-initialize if on destination page when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById("receiverForm")) {
      initDestinationPage();
    }
  });
} else {
  // DOM already loaded
  if (document.getElementById("receiverForm")) {
    initDestinationPage();
  }
}
