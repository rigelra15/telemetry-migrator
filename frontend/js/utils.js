// ================= UTILITY FUNCTIONS =================

/**
 * Convert datetime-local input to milliseconds UTC
 * User enters WIB (local time), new Date() interprets as local and
 * getTime() automatically returns UTC milliseconds for the API.
 */
function convertToMillisUTC(str) {
  const date = new Date(str);
  return date.getTime();
}

/**
 * Convert milliseconds to datetime-local format: YYYY-MM-DDTHH:MM:SS
 * Uses local timezone methods so the displayed value matches what the user originally entered (WIB).
 */
function convertMillisToDatetimeLocal(millis) {
  const date = new Date(millis);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Format date for display (WIB / local timezone)
 * Uses current language from i18n system
 */
function formatDate(millis) {
  const date = new Date(millis);
  // Get current language from i18n system (default to browser locale if not available)
  const lang = window.getCurrentLanguage ? window.getCurrentLanguage() : (navigator.language || 'en');
  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  
  return date.toLocaleString(locale, {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format datetime-local for display
 */
function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Format timestamp to relative time (e.g., "2m 30s ago", "5h 30m ago")
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  // Less than 1 minute - show seconds
  if (diff < 60000) {
    const seconds = Math.floor(diff / 1000);
    if (seconds < 5) return "Just now";
    return `${seconds}s ago`;
  }
  
  // Less than 1 hour - show minutes and seconds
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}m ${seconds}s ago`;
  }
  
  // Less than 1 day - show hours and minutes
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m ago`;
  }
  
  // Less than 7 days - show days and hours
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    return `${days}d ${hours}h ago`;
  }
  
  // Show date
  return date.toLocaleDateString();
}

/**
 * Format full timestamp with relative time
 * e.g., "31m ago | 14 February 2026 08:37:20 AM"
 */
function formatFullTimestamp(timestamp) {
  const date = new Date(timestamp);
  const relative = formatTimestamp(timestamp);
  
  // Format: "14 February 2026 08:37:20 AM"
  const options = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };
  
  const fullDate = date.toLocaleString('en-GB', options);
  return `${relative} | ${fullDate}`;
}

/**
 * Fetch entity name from ThingsBoard API
 * @param {string} entityType - ASSET or DEVICE
 * @param {string} entityId - Entity UUID
 * @param {string} source - 'source' or 'destination' to indicate which token to use
 * @returns {Promise<object>} Entity info including name
 */
async function checkEntityName(entityType, entityId, source = 'source') {
  try {
    const response = await axios.get('http://localhost:8000/api/entity/info', {
      params: {
        entityType: entityType.toUpperCase(),
        entityId: entityId,
        source: source
      }
    });
    
    if (response.data.success) {
      return {
        success: true,
        name: response.data.name,
        label: response.data.label,
        type: response.data.type
      };
    } else {
      return {
        success: false,
        error: 'Failed to fetch entity info'
      };
    }
  } catch (error) {
    console.error('Error fetching entity name:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message || 'Failed to fetch entity name'
    };
  }
}

// Export to window object for global access
window.convertToMillisUTC = convertToMillisUTC;
window.checkEntityName = checkEntityName;
window.convertMillisToDatetimeLocal = convertMillisToDatetimeLocal;
window.formatDate = formatDate;
window.formatDateTimeLocal = formatDateTimeLocal;
window.formatTimestamp = formatTimestamp;
window.formatFullTimestamp = formatFullTimestamp;
