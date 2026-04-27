// ================= AUTHENTICATION =================

/**
 * Initialize login page handlers
 */
function initLoginPage() {
  const sourceLogin = document.getElementById("sourceLogin");
  const destLogin = document.getElementById("destLogin");

  if (sourceLogin && destLogin) {
    // Check login status on page load
    checkLoginStatus();

    // Source login handler
    sourceLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!window.config) return alert("Config not loaded");

      const username = document.getElementById("sourceUsername").value;
      const password = document.getElementById("sourcePassword").value;

      try {
        const res = await axios.post(`${window.API_URL}/api/login/source`, {
          username,
          password,
        });

        if (res.data.success) {
          document.getElementById("sourceMsg").innerHTML = '<span class="iconify text-green-600" data-icon="mdi:check-circle"></span> Source OK';
          
          // Show logged in state
          document.getElementById("sourceLogin").classList.add("hidden");
          document.getElementById("sourceLoggedIn").classList.remove("hidden");
          document.getElementById("sourceUsernameDisplay").textContent = username;
          
          await checkLoginStatus();
        }
      } catch (error) {
        document.getElementById("sourceMsg").innerHTML = `
          <div class="flex items-start gap-2 text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200 mt-2">
            <span class="iconify text-lg shrink-0 mt-0.5" data-icon="mdi:close-circle"></span>
            <span class="font-medium text-xs leading-relaxed">Login Failed. Please check your username and password, or try again later.</span>
          </div>
        `;
        console.error(error);
      }
    });

    // Destination login handler
    destLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!window.config) return alert("Config not loaded");

      const username = document.getElementById("destUsername").value;
      const password = document.getElementById("destPassword").value;

      try {
        const res = await axios.post(`${window.API_URL}/api/login/destination`, {
          username,
          password,
        });

        if (res.data.success) {
          document.getElementById("destMsg").innerHTML = '<span class="iconify text-green-600" data-icon="mdi:check-circle"></span> Destination OK';
          
          // Show logged in state
          document.getElementById("destLogin").classList.add("hidden");
          document.getElementById("destLoggedIn").classList.remove("hidden");
          document.getElementById("destUsernameDisplay").textContent = username;
          
          await checkLoginStatus();
        }
      } catch (error) {
        document.getElementById("destMsg").innerHTML = `
          <div class="flex items-start gap-2 text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200 mt-2">
            <span class="iconify text-lg shrink-0 mt-0.5" data-icon="mdi:close-circle"></span>
            <span class="font-medium text-xs leading-relaxed">Login Failed. Please check your username and password, or try again later.</span>
          </div>
        `;
        console.error(error);
      }
    });
  }
}

/**
 * Check authentication status with backend
 */
async function checkLoginStatus() {
  try {
    const res = await axios.get(`${window.API_URL}/api/auth/status`);
    
    // Update UI based on login status
    if (res.data.sourceLoggedIn) {
      document.getElementById("sourceLogin").classList.add("hidden");
      document.getElementById("sourceLoggedIn").classList.remove("hidden");
      const username = res.data.sourceUsername || "***";
      document.getElementById("sourceUsernameDisplay").textContent = username;
    }
    
    if (res.data.destLoggedIn) {
      document.getElementById("destLogin").classList.add("hidden");
      document.getElementById("destLoggedIn").classList.remove("hidden");
      const username = res.data.destUsername || "***";
      document.getElementById("destUsernameDisplay").textContent = username;
    }
    
    // Show next button if both logged in
    const nextButton = document.getElementById("nextButtonContainer");
    if (nextButton && res.data.bothLoggedIn) {
      nextButton.classList.remove("hidden");
    }
  } catch (error) {
    console.error("Failed to check login status:", error);
  }
}

/**
 * Logout source account
 */
async function changeSourceAccount() {
  try {
    await axios.delete(`${window.API_URL}/api/logout?target=source`);
    // Clear saved form data when logging out
    await window.clearSession();
    document.getElementById("sourceLogin").classList.remove("hidden");
    document.getElementById("sourceLoggedIn").classList.add("hidden");
    document.getElementById("sourceUsername").value = "";
    document.getElementById("sourcePassword").value = "";
    document.getElementById("sourceMsg").innerHTML = "";
    const nextButton = document.getElementById("nextButtonContainer");
    if (nextButton) nextButton.classList.add("hidden");
  } catch (error) {
    console.error("Logout failed:", error);
  }
}

/**
 * Logout destination account
 */
async function changeDestAccount() {
  try {
    await axios.delete(`${window.API_URL}/api/logout?target=destination`);
    // Clear saved form data when logging out
    await window.clearSession();
    document.getElementById("destLogin").classList.remove("hidden");
    document.getElementById("destLoggedIn").classList.add("hidden");
    document.getElementById("destUsername").value = "";
    document.getElementById("destPassword").value = "";
    document.getElementById("destMsg").innerHTML = "";
    const nextButton = document.getElementById("nextButtonContainer");
    if (nextButton) nextButton.classList.add("hidden");
  } catch (error) {
    console.error("Logout failed:", error);
  }
}

/**
 * Navigate to source page
 */
function goToSourcePage() {
  window.location.href = "source.html";
}

// Export to window object for global access
window.initLoginPage = initLoginPage;
window.checkLoginStatus = checkLoginStatus;
window.changeSourceAccount = changeSourceAccount;
window.changeDestAccount = changeDestAccount;
window.goToSourcePage = goToSourcePage;

// Auto-initialize if on login page when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById("sourceLogin")) {
      initLoginPage();
    }
  });
} else {
  // DOM already loaded
  if (document.getElementById("sourceLogin")) {
    initLoginPage();
  }
}
