/**
 * Authentication Handler
 * Handles token expiration and refresh
 */

/**
 * Show token expired dialog with options
 * @param {string} source - 'source' or 'destination'
 * @returns {Promise<boolean>} - true if token refreshed, false if user chose to login again
 */
async function showTokenExpiredDialog(source) {
  const sourceName = source === 'source' ? 'Source' : 'Destination';
  
  // Create modal
  const modalHTML = `
    <div id="tokenExpiredModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div class="p-6">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-4">
            <div class="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <span class="iconify text-orange-600 text-2xl" data-icon="mdi:lock-clock"></span>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">Session Expired</h3>
              <p class="text-sm text-gray-600">${sourceName} System</p>
            </div>
          </div>
          
          <!-- Message -->
          <div class="mb-6">
            <p class="text-gray-700">Your ${sourceName.toLowerCase()} session has expired. Please choose an option:</p>
          </div>
          
          <!-- Options -->
          <div class="space-y-3">
            <!-- Refresh Token Option -->
            <button onclick="handleRefreshToken('${source}')" class="w-full flex items-center gap-3 p-4 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition">
              <span class="iconify text-blue-600 text-xl flex-shrink-0" data-icon="mdi:refresh"></span>
              <div class="text-left">
                <div class="font-semibold text-gray-900">Refresh Token</div>
                <div class="text-sm text-gray-600">Continue with your current account</div>
              </div>
            </button>
            
            <!-- Login Again Option -->
            <button onclick="handleLoginAgain('${source}')" class="w-full flex items-center gap-3 p-4 border-2 border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition">
              <span class="iconify text-purple-600 text-xl flex-shrink-0" data-icon="mdi:account-switch"></span>
              <div class="text-left">
                <div class="font-semibold text-gray-900">Login Again</div>
                <div class="text-sm text-gray-600">Switch to a different account</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Return a promise that resolves with user choice
  return new Promise((resolve) => {
    window._tokenExpiredResolve = resolve;
  });
}

/**
 * Handle refresh token action
 */
async function handleRefreshToken(source) {
  const modal = document.getElementById('tokenExpiredModal');
  if (modal) {
    // Show loading state
    modal.querySelector('.space-y-3').innerHTML = `
      <div class="flex items-center justify-center py-8">
        <span class="iconify animate-spin text-4xl text-blue-600" data-icon="mdi:loading"></span>
      </div>
      <p class="text-center text-gray-600">Refreshing token...</p>
    `;
  }
  
  try {
    const response = await axios.post(`${window.API_URL}/api/auth/refresh/${source}`);
    
    if (response.data.success) {
      // Success - close modal and continue
      if (modal) modal.remove();
      if (window._tokenExpiredResolve) {
        window._tokenExpiredResolve(true);
        delete window._tokenExpiredResolve;
      }
    } else {
      throw new Error('Refresh failed');
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
    
    // Show error and fallback to login
    if (modal) {
      modal.querySelector('.space-y-3').innerHTML = `
        <div class="text-center py-4">
          <span class="iconify text-5xl text-red-600 mb-2" data-icon="mdi:alert-circle"></span>
          <p class="text-gray-700 mb-4">Token refresh failed. Please login again.</p>
          <button onclick="handleLoginAgain('${source}')" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Login Again
          </button>
        </div>
      `;
    }
  }
}

/**
 * Handle login again action
 */
async function handleLoginAgain(source) {
  const modal = document.getElementById('tokenExpiredModal');
  
  try {
    // Logout first to clear old credentials
    await axios.post(`${window.API_URL}/api/auth/logout/${source}`);
  } catch (error) {
    console.error('Logout error:', error);
  }
  
  // Close modal
  if (modal) modal.remove();
  if (window._tokenExpiredResolve) {
    window._tokenExpiredResolve(false);
    delete window._tokenExpiredResolve;
  }
  
  // Redirect to appropriate login page
  if (source === 'source') {
    window.location.href = 'source.html';
  } else {
    window.location.href = 'destination.html';
  }
}

/**
 * Setup axios interceptor to handle 401 errors globally
 */
function setupAuthInterceptor() {
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      
      // Check if it's a 401 error and not already retried
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        
        // Determine source from URL or request data
        let source = 'source';
        if (originalRequest.url.includes('destination') || 
            originalRequest.data?.includes('destination')) {
          source = 'destination';
        }
        
        // Show token expired dialog
        const refreshed = await showTokenExpiredDialog(source);
        
        if (refreshed) {
          // Retry the original request
          return axios(originalRequest);
        }
      }
      
      return Promise.reject(error);
    }
  );
}

// Export functions to window
window.showTokenExpiredDialog = showTokenExpiredDialog;
window.handleRefreshToken = handleRefreshToken;
window.handleLoginAgain = handleLoginAgain;
window.setupAuthInterceptor = setupAuthInterceptor;

// Auto-setup interceptor when script loads
if (typeof axios !== 'undefined') {
  setupAuthInterceptor();
}
