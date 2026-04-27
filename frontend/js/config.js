// ================= CONFIGURATION =================

const API_URL = "http://localhost:8000";

let config = null;

async function loadConfig() {
  try {
    const res = await fetch(`${API_URL}/api/config`);
    config = await res.json();
    window.config = config;
    console.log("Config loaded:", config);
    return config;
  } catch (error) {
    console.error("Failed to load config:", error);
    alert("Failed to load configuration from backend");
    return null;
  }
}

// Export for use in other modules
window.API_URL = API_URL;
window.config = config;
window.loadConfig = loadConfig;

// Load config on page load
loadConfig();
window.loadConfig = loadConfig;
