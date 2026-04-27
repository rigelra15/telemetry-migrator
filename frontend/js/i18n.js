// ================= i18n LANGUAGE SYSTEM =================

let currentLang = 'en';
let translations = {};

/**
 * Load language file
 */
async function loadLanguage(lang) {
  try {
    const response = await fetch(`./i18n/${lang}.json`);
    if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
    translations = await response.json();
    currentLang = lang;
    
    // Save to localStorage
    localStorage.setItem('preferredLanguage', lang);
    
    // Update all elements with data-i18n
    updatePageLanguage();
    
    return true;
  } catch (error) {
    console.error('Error loading language:', error);
    return false;
  }
}

/**
 * Get translation by key path (e.g., "source.title")
 */
function t(keyPath) {
  const keys = keyPath.split('.');
  let value = translations;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      console.warn(`Translation key not found: ${keyPath}`);
      return keyPath; // Return key if not found
    }
  }
  
  return value;
}

/**
 * Update all elements with data-i18n attribute
 */
function updatePageLanguage() {
  // Update text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = t(key);
    
    if (typeof translation === 'string') {
      // Special handling for option elements - preserve their value
      if (el.tagName === 'OPTION') {
        el.textContent = translation;
      } else {
        el.textContent = translation;
      }
    }
  });
  
  // Update placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translation = t(key);
    
    if (typeof translation === 'string') {
      el.placeholder = translation;
    }
  });
  
  // Update tooltips
  document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
    const key = el.getAttribute('data-i18n-tooltip');
    const translation = t(key);
    
    if (typeof translation === 'string') {
      // Find tooltip-text child
      const tooltipText = el.querySelector('.tooltip-text');
      if (tooltipText) {
        tooltipText.textContent = translation;
      }
    }
  });
  
  // Update HTML content (for complex elements)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const translation = t(key);
    
    if (typeof translation === 'string') {
      el.innerHTML = translation;
    }
  });
  
  // Update language toggle button state
  updateLanguageToggleState();
  
  // Trigger custom event for date/time re-rendering (if needed on specific pages)
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
}

/**
 * Toggle between languages
 */
function toggleLanguage() {
  const newLang = currentLang === 'en' ? 'id' : 'en';
  loadLanguage(newLang);
}

/**
 * Update language toggle button visual state
 */
function updateLanguageToggleState() {
  const langButton = document.getElementById('langToggleBtn');
  if (langButton) {
    const flagIcon = langButton.querySelector('.flag-icon');
    const langText = langButton.querySelector('.lang-text');
    
    if (currentLang === 'en') {
      if (flagIcon) flagIcon.setAttribute('data-icon', 'emojione:flag-for-united-states');
      if (langText) langText.textContent = 'EN';
    } else {
      if (flagIcon) flagIcon.setAttribute('data-icon', 'emojione:flag-for-indonesia');
      if (langText) langText.textContent = 'ID';
    }
  }
}

/**
 * Initialize i18n system
 */
async function initI18n() {
  // Get saved language or use default
  const savedLang = localStorage.getItem('preferredLanguage') || 'en';
  await loadLanguage(savedLang);
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initI18n);
} else {
  initI18n();
}

// Export functions to window
window.loadLanguage = loadLanguage;
window.toggleLanguage = toggleLanguage;
window.t = t;
window.getCurrentLanguage = () => currentLang;
