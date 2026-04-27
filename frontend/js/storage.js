// ================= STORAGE MANAGEMENT (using backend API) =================

const MAX_HISTORY = 10;

// ================= SESSION STORAGE =================

/**
 * Save session data to backend file
 */
async function saveSession(key, data) {
  try {
    const res = await axios.post(`${window.API_URL}/api/session/save?key=${key}`, {
      data: data
    });
    return res.data.success;
  } catch (error) {
    console.error(`Failed to save session '${key}':`, error);
    return false;
  }
}

/**
 * Load session data from backend file
 */
async function loadSession(key) {
  try {
    const res = await axios.get(`${window.API_URL}/api/session/load?key=${key}`);
    if (res.data.success && res.data.data) {
      return res.data.data;
    }
    return null;
  } catch (error) {
    console.error(`Failed to load session '${key}':`, error);
    return null;
  }
}

/**
 * Clear session data from backend file
 */
async function clearSession(key = null) {
  try {
    const url = key 
      ? `${window.API_URL}/api/session/clear?key=${key}`
      : `${window.API_URL}/api/session/clear`;
    const res = await axios.delete(url);
    return res.data.success;
  } catch (error) {
    console.error(`Failed to clear session:`, error);
    return false;
  }
}

// ================= HISTORY STORAGE =================

/**
 * Get current username for specific category
 */
async function getCurrentUsername(category) {
  try {
    const res = await axios.get(`${window.API_URL}/api/auth/status`);
    if (category === 'source' && res.data.sourceUsername) {
      return res.data.sourceUsername;
    } else if (category === 'destination' && res.data.destUsername) {
      return res.data.destUsername;
    }
    return null;
  } catch (error) {
    console.error(`Failed to get username for ${category}:`, error);
    return null;
  }
}

/**
 * Save history to backend file (per-user)
 */
async function saveHistory(category, history) {
  try {
    // Get current username to make history user-specific
    const username = await getCurrentUsername(category);
    const key = username ? `${category}_${username}` : category;
    
    const res = await axios.post(`${window.API_URL}/api/history/save?category=${encodeURIComponent(key)}`, {
      history: history
    });
    return res.data.success;
  } catch (error) {
    console.error(`Failed to save history '${category}':`, error);
    return false;
  }
}

/**
 * Load history from backend file (per-user)
 */
async function loadHistory(category) {
  try {
    // Get current username to load user-specific history
    const username = await getCurrentUsername(category);
    const key = username ? `${category}_${username}` : category;
    
    const res = await axios.get(`${window.API_URL}/api/history/load?category=${encodeURIComponent(key)}`);
    return res.data.history || [];
  } catch (error) {
    console.error(`Failed to load history '${category}':`, error);
    return [];
  }
}

/**
 * Check if two configurations are identical
 */
function isConfigEqual(config1, config2, category) {
  if (category === 'source') {
    return config1.entityType === config2.entityType &&
           config1.entityId === config2.entityId &&
           config1.keys === config2.keys &&
           config1.limit === config2.limit &&
           config1.start === config2.start &&
           config1.end === config2.end;
  } else if (category === 'destination') {
    return config1.targetEntityType === config2.targetEntityType &&
           config1.targetEntityId === config2.targetEntityId &&
           config1.scope === config2.scope;
  }
  return false;
}

/**
 * Add item to history (replaces duplicate if found)
 */
async function addToHistory(category, item) {
  try {
    let history = await loadHistory(category);
    
    // Check for duplicate configuration
    const duplicateIndex = history.findIndex(existingItem => isConfigEqual(existingItem, item, category));
    
    if (duplicateIndex !== -1) {
      // Remove the duplicate (we'll add updated version at the top)
      history.splice(duplicateIndex, 1);
    }
    
    // Add timestamp and ID
    const historyItem = {
      ...item,
      timestamp: Date.now(),
      id: Date.now()
    };
    
    // Add to beginning of array
    history.unshift(historyItem);
    
    // Keep only MAX_HISTORY items
    history = history.slice(0, MAX_HISTORY);
    
    await saveHistory(category, history);
    return true;
  } catch (error) {
    console.error(`Failed to add to history '${category}':`, error);
    return false;
  }
}

/**
 * Delete item from history by ID
 */
async function deleteFromHistory(category, id) {
  try {
    let history = await loadHistory(category);
    history = history.filter(item => item.id !== id);
    await saveHistory(category, history);
    return true;
  } catch (error) {
    console.error(`Failed to delete from history '${category}':`, error);
    return false;
  }
}

/**
 * Clear all history for a category
 */
async function clearHistory(category = null) {
  try {
    const url = category 
      ? `${window.API_URL}/api/history/clear?category=${category}`
      : `${window.API_URL}/api/history/clear`;
    const res = await axios.delete(url);
    return res.data.success;
  } catch (error) {
    console.error(`Failed to clear history:`, error);
    return false;
  }
}

// Export to window object for global access
window.saveSession = saveSession;
window.loadSession = loadSession;
window.clearSession = clearSession;
window.getCurrentUsername = getCurrentUsername;
window.saveHistory = saveHistory;
window.loadHistory = loadHistory;
window.addToHistory = addToHistory;
window.deleteFromHistory = deleteFromHistory;
window.clearHistory = clearHistory;
window.MAX_HISTORY = MAX_HISTORY;
