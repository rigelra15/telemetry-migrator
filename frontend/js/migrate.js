// Global variable to track log view mode and store raw logs
let logViewMode = "formatted"; // 'raw' or 'formatted'
let rawLogContent = ""; // Store raw log content
let elapsedTimerInterval = null; // Timer interval for elapsed time
let migrationStartTime = null; // Migration start timestamp

/**
 * Format elapsed time in human-readable format
 */
function formatElapsedTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Get current elapsed time string
 */
function getElapsedTimeStr() {
  if (!migrationStartTime) return '0s';
  const elapsedSeconds = Math.floor((Date.now() - migrationStartTime) / 1000);
  return formatElapsedTime(elapsedSeconds);
}

/**
 * Start elapsed time counter (just tracks time, formatted view reads it)
 */
function startElapsedTimer() {
  if (elapsedTimerInterval) {
    clearInterval(elapsedTimerInterval);
  }
  migrationStartTime = Date.now();

  // Only update the elapsed time text, not re-render entire HTML (avoids flicker)
  elapsedTimerInterval = setInterval(() => {
    const el = document.getElementById('migration-elapsed-time');
    if (el) {
      el.textContent = getElapsedTimeStr();
    }
  }, 1000);
}

/**
 * Stop elapsed time counter
 */
function stopElapsedTimer() {
  if (elapsedTimerInterval) {
    clearInterval(elapsedTimerInterval);
    elapsedTimerInterval = null;
  }
}

/**
 * Toggle log view between raw and formatted
 */
function toggleLogView(mode) {
  if (!mode || (mode !== "raw" && mode !== "formatted")) return;

  logViewMode = mode;

  // Update button styles
  const rawBtn = document.getElementById("rawViewBtn");
  const formattedBtn = document.getElementById("formattedViewBtn");

  if (mode === "raw") {
    // Raw button active
    rawBtn.style.background = "linear-gradient(to right, #1E22AA, #E5005A)";
    rawBtn.style.color = "white";
    rawBtn.classList.remove("bg-white", "hover:bg-gray-50", "text-gray-700");

    // Formatted button inactive
    formattedBtn.style.background = "white";
    formattedBtn.style.color = "#374151";
    formattedBtn.classList.add("hover:bg-gray-50");
  } else {
    // Formatted button active
    formattedBtn.style.background =
      "linear-gradient(to right, #1E22AA, #E5005A)";
    formattedBtn.style.color = "white";
    formattedBtn.classList.remove(
      "bg-white",
      "hover:bg-gray-50",
      "text-gray-700",
    );

    // Raw button inactive
    rawBtn.style.background = "white";
    rawBtn.style.color = "#374151";
    rawBtn.classList.add("hover:bg-gray-50");
  }

  // Re-render current logs with new view mode
  renderLogs(rawLogContent);
}

// Export to window for HTML onclick handlers
window.toggleLogView = toggleLogView;

/**
 * Parse raw log text into structured data for formatted view
 */
function parseLogToStructured(logText) {
  const lines = logText.split('\n');
  const result = {
    initSteps: [],
    days: [],
    summary: null,
    currentPhase: 'init',
    error: null
  };
  
  let currentDay = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.match(/^[=\-]{10,}$/)) continue;
    
    const tsMatch = trimmed.match(/^\[[\d\-\s:]+\]\s*(.*)$/);
    const content = tsMatch ? tsMatch[1] : trimmed;
    if (!content) continue;
    
    // Migration error
    if (content.includes('Migration Error:')) {
      result.error = content.replace('Migration Error:', '').trim();
      continue;
    }
    
    // Summary section
    if (content === 'Migration Complete') {
      result.currentPhase = 'summary';
      if (currentDay) { result.days.push(currentDay); currentDay = null; }
      result.summary = {};
      continue;
    }
    
    if (result.currentPhase === 'summary' && result.summary) {
      const cleaned = content;
      const m = cleaned.match(/^(Total days processed|Successful days|Total records fetched|Total records posted|Total time):\s*(.+)$/);
      if (m) {
        result.summary[m[1].trim()] = m[2].trim();
      }
      continue;
    }
    
    // Day marker — new format: [Day 1] Processing 20251101 00:00:00-12:00:00...
    // Also supports old format without time range: [Day 1] Processing 20251101...
    const dayMatch = content.match(/^\[Day (\d+)\]\s*Processing\s+(\d{8})(?:\s+(\d{2}:\d{2}:\d{2})-(\d{2}:\d{2}:\d{2}))?/);
    if (dayMatch) {
      if (currentDay) result.days.push(currentDay);
      currentDay = {
        dayNum: parseInt(dayMatch[1]),
        dateStr: dayMatch[2],
        timeStart: dayMatch[3] || null,  // e.g. "00:00:00"
        timeEnd: dayMatch[4] || null,    // e.g. "12:00:00"
        status: 'in_progress',
        rawDataPoints: null,
        transformedRecords: null,
        postedRecords: null,
        batches: [],
        events: []
      };
      result.currentPhase = 'migration';
      continue;
    }
    
    // Inside a day context
    if (currentDay) {
      // Fetch success - this is the RAW data points count
      const fetchMatch = content.match(/SUCCESS:\s*Fetched data for .+ \((\d+) records\)/);
      if (fetchMatch) {
        currentDay.rawDataPoints = parseInt(fetchMatch[1]);
        continue;
      }
      // No data
      if (content.match(/INFO:\s*No data (found )?for/) || content.match(/No data to post/)) {
        currentDay.status = 'no_data';
        continue;
      }
      // Post info - this is the TRANSFORMED count (grouped by timestamp) = matches summary
      const postMatch = content.match(/Posting (\d+) records/);
      if (postMatch) {
        currentDay.transformedRecords = parseInt(postMatch[1]);
        continue;
      }
      // Batch result
      const batchMatch = content.match(/Batch (\d+)\/(\d+):\s*(OK|FAILED)\s*(.+)/);
      if (batchMatch) {
        currentDay.batches.push({
          num: parseInt(batchMatch[1]),
          total: parseInt(batchMatch[2]),
          success: batchMatch[3] === 'OK',
          detail: batchMatch[4]
        });
        continue;
      }
      // Day success
      if (content.match(/SUCCESS:\s*All \d+ records posted/)) {
        const postedMatch = content.match(/All (\d+) records/);
        currentDay.postedRecords = postedMatch ? parseInt(postedMatch[1]) : 0;
        currentDay.status = 'success';
        continue;
      }
      // Day warning (partial)
      if (content.match(/WARNING:\s*Posted \d+\/\d+/)) {
        const warnMatch = content.match(/Posted (\d+)\/(\d+)/);
        if (warnMatch) {
          currentDay.postedRecords = parseInt(warnMatch[1]);
          currentDay.transformedRecords = parseInt(warnMatch[2]);
        }
        currentDay.status = 'partial';
        continue;
      }
      // Day failed
      if (content.match(/FAILED:|ERROR:.*Failed to fetch/)) {
        currentDay.status = 'failed';
        currentDay.events.push(content);
        continue;
      }
      // Token refresh
      if (content.includes('token expired') || content.includes('token refreshed')) {
        currentDay.events.push(content);
        continue;
      }
      continue;
    }
    
    // Init phase steps
    if (result.currentPhase === 'init') {
      const cleaned = content;
      if (cleaned.match(/^(Final format|Total keys|Cleaned|Converted|API Request Debug|Keys sample|interval:|limit:)/)) continue;
      if (cleaned.match(/^\s/) || cleaned.length < 3) continue;
      result.initSteps.push(cleaned);
    }
  }
  
  if (currentDay) result.days.push(currentDay);
  return result;
}

// Theme colors
const THEME = {
  blue: '#1E22AA',
  pink: '#E5005A',
  blueBg: '#1E22AA10',
  pinkBg: '#E5005A10',
  blueBorder: '#1E22AA30',
  pinkBorder: '#E5005A30',
};

/**
 * Build formatted HTML from structured data
 */
function buildFormattedHTML(data) {
  let html = '';
  
  const isComplete = !!data.summary;
  const hasError = !!data.error;
  const isRunning = !isComplete && !hasError && (data.initSteps.length > 0 || data.days.length > 0);
  
  // Compute live stats from parsed days (for live-updating cards)
  let liveTotalDays = data.days.length;
  let liveSuccessDays = data.days.filter(d => d.status === 'success').length;
  let liveFetched = 0;
  let livePosted = 0;
  for (const day of data.days) {
    if (day.transformedRecords !== null) liveFetched += day.transformedRecords;
    else if (day.rawDataPoints !== null) liveFetched += day.rawDataPoints;
    if (day.postedRecords !== null) livePosted += day.postedRecords;
  }
  
  // Use summary values when available (more accurate), otherwise use live computed
  const totalDays = isComplete ? (data.summary['Total days processed'] || String(liveTotalDays)) : String(liveTotalDays);
  const successDays = isComplete ? (data.summary['Successful days'] || String(liveSuccessDays)) : String(liveSuccessDays);
  const fetched = isComplete ? (data.summary['Total records fetched'] || String(liveFetched)) : String(liveFetched);
  const posted = isComplete ? (data.summary['Total records posted'] || String(livePosted)) : String(livePosted);
  
  // --- Status Banner (always visible once migration starts) ---
  if (isRunning || isComplete || hasError) {
    let bannerColor, bannerBg, bannerBorder, bannerIcon, bannerText, timeDisplay;
    
    if (hasError) {
      bannerColor = THEME.pink;
      bannerBg = THEME.pinkBg;
      bannerBorder = THEME.pinkBorder;
      bannerIcon = 'mdi:alert-circle';
      bannerText = 'Migration Failed';
      timeDisplay = getElapsedTimeStr();
    } else if (isComplete) {
      const allFailed = successDays === '0' && totalDays !== '0';
      bannerColor = allFailed ? THEME.pink : THEME.blue;
      bannerBg = allFailed ? THEME.pinkBg : THEME.blueBg;
      bannerBorder = allFailed ? THEME.pinkBorder : THEME.blueBorder;
      bannerIcon = allFailed ? 'mdi:alert-circle' : 'mdi:check-circle';
      bannerText = allFailed ? 'Migration Failed' : 'Migration Complete';
      timeDisplay = data.summary['Total time'] || getElapsedTimeStr();
    } else {
      bannerColor = THEME.blue;
      bannerBg = THEME.blueBg;
      bannerBorder = THEME.blueBorder;
      bannerIcon = 'mdi:progress-clock';
      bannerText = 'Migration In Progress';
      timeDisplay = getElapsedTimeStr();
    }
    
    html += `<div class="p-3 rounded-lg mb-3 flex items-center gap-2" style="background:${bannerBg};border:1px solid ${bannerBorder}">
      <span class="iconify text-xl" style="color:${bannerColor}" data-icon="${bannerIcon}"></span>
      <span class="font-bold text-sm" style="color:${bannerColor}">${bannerText}</span>
      <span class="text-xs text-gray-500 ml-auto flex items-center gap-1"><span class="iconify" data-icon="mdi:timer-outline"></span><span id="migration-elapsed-time">${timeDisplay}</span></span>
    </div>`;
  }
  
  // --- Error detail ---
  if (hasError) {
    html += `<div class="p-3 rounded-lg mb-3 flex items-start gap-2" style="background:${THEME.pinkBg};border:1px solid ${THEME.pinkBorder}">
      <span class="iconify text-xl mt-0.5" style="color:${THEME.pink}" data-icon="mdi:alert-circle"></span>
      <div>
        <div class="font-bold text-sm" style="color:${THEME.pink}">Error Details</div>
        <div class="text-xs mt-1" style="color:${THEME.pink}">${data.error}</div>
      </div>
    </div>`;
  }
  
  // --- Summary Cards (always visible once migration starts, live updating) ---
  if (isRunning || isComplete || hasError) {
    const allSuccess = successDays === totalDays && totalDays !== '0';
    
    html += `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">`;
    html += buildMetricCard('mdi:calendar-check', 'Days', `${successDays}/${totalDays}`, allSuccess ? THEME.blue : (successDays === '0' && totalDays !== '0' ? THEME.pink : THEME.blue));
    html += buildMetricCard('mdi:calendar-range', 'Total Days', totalDays, THEME.blue);
    html += buildMetricCard('mdi:database-arrow-down', 'Fetched', parseInt(fetched).toLocaleString(), THEME.blue);
    html += buildMetricCard('mdi:database-arrow-up', 'Posted', parseInt(posted).toLocaleString(), THEME.pink);
    html += `</div>`;
  }
  
  // --- Per-Day Cards ---
  if (data.days.length > 0) {
    html += `<div class="mb-2">
      <div class="flex items-center gap-2 my-2">
        <span class="iconify text-sm" style="color:${THEME.blue}" data-icon="mdi:calendar-sync"></span>
        <span class="text-xs font-semibold uppercase tracking-wide" style="color:${THEME.blue}">Daily Progress</span>
        <span class="text-xs text-gray-400 ml-auto">${data.days.length} day(s)</span>
      </div>
      <div class="space-y-2">`;
    
    for (const day of data.days) {
      html += buildDayCard(day);
    }
    html += `</div></div>`;
  }
  
  return html || '<div class="text-sm text-gray-400 text-center py-4">Waiting for migration data...</div>';
}

function buildMetricCard(icon, label, value, color) {
  return `<div class="p-2.5 rounded-lg bg-white text-center" style="border:1px solid ${color}20">
    <div class="flex items-center justify-center gap-1 mb-1">
      <span class="iconify text-sm" style="color:${color}" data-icon="${icon}"></span>
      <span class="text-xs text-gray-500">${label}</span>
    </div>
    <div class="text-lg font-bold" style="color:${color}">${value}</div>
  </div>`;
}

function buildDayCard(day) {
  const statusConfig = {
    success:     { bg: THEME.blueBg, border: THEME.blueBorder, color: THEME.blue, icon: 'mdi:check-circle', text: 'Success' },
    failed:      { bg: THEME.pinkBg, border: THEME.pinkBorder, color: THEME.pink, icon: 'mdi:close-circle', text: 'Failed' },
    partial:     { bg: THEME.pinkBg, border: THEME.pinkBorder, color: THEME.pink, icon: 'mdi:alert-circle', text: 'Partial' },
    no_data:     { bg: '#f9fafb', border: '#e5e7eb', color: '#6b7280', icon: 'mdi:database-off-outline', text: 'No Data' },
    in_progress: { bg: THEME.blueBg, border: THEME.blueBorder, color: THEME.blue, icon: 'mdi:progress-clock', text: 'In Progress' }
  };
  const s = statusConfig[day.status] || statusConfig.in_progress;
  const dayId = 'day-detail-' + day.dayNum;
  
  // Use transformedRecords (matches summary) for header; fallback to rawDataPoints if no transformed yet
  const headerRecords = day.transformedRecords !== null ? day.transformedRecords : day.rawDataPoints;
  
  // Format date: 20251101 -> "1 Nov 2025" (readable)
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let displayDate = day.dateStr;
  if (day.dateStr && day.dateStr.length === 8) {
    const y = day.dateStr.slice(0,4);
    const m = parseInt(day.dateStr.slice(4,6)) - 1;
    const d = parseInt(day.dateStr.slice(6,8));
    displayDate = `${d} ${monthNames[m] || '???'} ${y}`;
  }
  // Build time range display
  let timeRangeDisplay = '';
  if (day.timeStart && day.timeEnd) {
    timeRangeDisplay = `${day.timeStart} - ${day.timeEnd}`;
  }
  
  let html = `<div class="rounded-lg overflow-hidden" style="background:${s.bg};border:1px solid ${s.border}">
    <div class="flex items-center justify-between p-2.5 cursor-pointer hover:opacity-80 transition" onclick="document.getElementById('${dayId}').classList.toggle('hidden')">
      <div class="flex items-center gap-2">
        <span class="iconify" data-icon="${s.icon}" style="color:${s.color}"></span>
        <span class="text-xs font-semibold text-gray-700">Day ${day.dayNum}</span>
        <span class="text-xs text-gray-400">|</span>
        <span class="text-xs font-medium text-gray-600">${displayDate}</span>${timeRangeDisplay ? `
        <span class="text-xs text-gray-400">|</span>
        <span class="text-xs text-gray-400">${timeRangeDisplay}</span>` : ''}
      </div>
      <div class="flex items-center gap-2">`;
  
  // Show consistent metric in header (transformed records = matches summary)
  if (headerRecords !== null) {
    html += `<span class="text-xs text-gray-500 flex items-center gap-0.5"><span class="iconify text-xs" style="color:${THEME.blue}" data-icon="mdi:database-arrow-down"></span>${headerRecords.toLocaleString()}</span>`;
  }
  if (day.postedRecords !== null) {
    html += `<span class="text-xs text-gray-500 flex items-center gap-0.5"><span class="iconify text-xs" style="color:${THEME.pink}" data-icon="mdi:database-arrow-up"></span>${day.postedRecords.toLocaleString()}</span>`;
  }
  
  html += `<span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background:${s.color}15;color:${s.color}">${s.text}</span>
        <span class="iconify text-gray-400 text-xs" data-icon="mdi:chevron-down"></span>
      </div>
    </div>`;
  
  // Collapsible detail
  html += `<div id="${dayId}" class="hidden p-2.5 text-xs space-y-1.5" style="border-top:1px solid ${s.border}">`;
  
  // Show raw data points if different from transformed (the discrepancy explanation)
  if (day.rawDataPoints !== null && day.transformedRecords !== null && day.rawDataPoints !== day.transformedRecords) {
    html += `<div class="flex items-center gap-2"><span class="iconify" style="color:${THEME.blue}80" data-icon="mdi:database-search"></span><span class="text-gray-500">Raw data points from API: <strong class="text-gray-700">${day.rawDataPoints.toLocaleString()}</strong></span></div>`;
  }
  if (day.transformedRecords !== null) {
    html += `<div class="flex items-center gap-2"><span class="iconify" style="color:${THEME.blue}" data-icon="mdi:database-arrow-down"></span><span class="text-gray-600">Records (grouped by timestamp): <strong>${day.transformedRecords.toLocaleString()}</strong></span></div>`;
  } else if (day.rawDataPoints !== null) {
    html += `<div class="flex items-center gap-2"><span class="iconify" style="color:${THEME.blue}" data-icon="mdi:database-arrow-down"></span><span class="text-gray-600">Fetched: <strong>${day.rawDataPoints.toLocaleString()}</strong> data points</span></div>`;
  }
  if (day.postedRecords !== null) {
    html += `<div class="flex items-center gap-2"><span class="iconify" style="color:${THEME.pink}" data-icon="mdi:database-arrow-up"></span><span class="text-gray-600">Posted: <strong>${day.postedRecords.toLocaleString()}</strong> records</span></div>`;
  }
  
  // Batch progress
  if (day.batches.length > 0) {
    const successBatches = day.batches.filter(b => b.success).length;
    html += `<div class="flex items-center gap-2 mt-1"><span class="iconify" style="color:${THEME.blue}" data-icon="mdi:progress-check"></span><span class="text-gray-600">Batches: ${successBatches}/${day.batches.length} successful</span></div>`;
    
    // Batch mini progress bar using theme colors
    html += `<div class="flex gap-0.5 mt-1">`;
    for (const b of day.batches) {
      const barColor = b.success ? THEME.blue : THEME.pink;
      html += `<div class="h-1.5 flex-1 rounded-full" style="background:${barColor}" title="Batch ${b.num}: ${b.success ? 'OK' : 'Failed'}"></div>`;
    }
    html += `</div>`;
  }
  
  // Events
  if (day.events.length > 0) {
    html += `<div class="mt-1.5 pt-1.5 border-t border-gray-200 space-y-1">`;
    for (const evt of day.events) {
      const isErr = evt.includes('ERROR') || evt.includes('FAILED');
      const evtColor = isErr ? THEME.pink : THEME.blue;
      html += `<div class="flex items-center gap-1 text-xs" style="color:${evtColor}">
        <span class="iconify" data-icon="${isErr ? 'mdi:alert-outline' : 'mdi:information-outline'}"></span>
        <span>${evt}</span>
      </div>`;
    }
    html += `</div>`;
  }
  
  html += `</div></div>`;
  return html;
}

/**
 * Render logs based on current view mode
 */
function renderLogs(logText) {
  const logContent = document.getElementById("logContent");
  if (!logContent) return;

  // Store raw log content
  rawLogContent = logText;

  if (logViewMode === "raw") {
    // Raw view: Simple pre-formatted text with minimal styling
    const escapedLog = logText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    logContent.innerHTML = `<pre class="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">${escapedLog}</pre>`;
  } else {
    // Formatted view: Proper structured UI dashboard
    const structuredData = parseLogToStructured(logText);
    logContent.innerHTML = buildFormattedHTML(structuredData);
  }

  // Auto-scroll to bottom
  const statusBox = document.getElementById("statusBox");
  if (statusBox) {
    statusBox.scrollTop = statusBox.scrollHeight;
  }
}

/**
 * Initialize migration page
 */
async function initMigratePage() {
  const startMigrationBtn = document.getElementById("startMigrationBtn");
  const migrationSummary = document.getElementById("migrationSummary");

  if (!startMigrationBtn || !migrationSummary) return;

  // Check auth status and load usernames on page load
  await loadMigrationSummary();

  // Start migration handler
  startMigrationBtn.addEventListener("click", startMigration);
  
  // Listen for language changes to update date/time formatting
  window.addEventListener('languageChanged', async () => {
    // Re-load and re-render migration summary to update date formats
    const params = await window.loadSession("migrationParams");
    const targetConfig = await window.loadSession("targetConfig");
    
    if (params && targetConfig) {
      displaySourceSummary(params);
      displayDestinationSummary(targetConfig);
    }
  });
}

/**
 * Load migration summary
 */
async function loadMigrationSummary() {
  try {
    const res = await axios.get(`${window.API_URL}/api/auth/status`);
    if (!res.data.bothLoggedIn) {
      alert("Please login to both source and destination first!");
      window.location.href = "index.html";
      return;
    }

    // Display usernames
    if (res.data.sourceUsername) {
      document.getElementById("sourceUsername").innerHTML = `
        <div>
          <div class="flex items-center gap-1.5 mb-1">
            <span class="iconify text-sm text-gray-600" data-icon="mdi:account"></span>
            <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Username</span>
          </div>
          <div class="border-t border-gray-300 pt-1.5">
            <span class="font-medium text-gray-800">${res.data.sourceUsername}</span>
          </div>
        </div>
      `;
    }

    if (res.data.destUsername) {
      document.getElementById("destUsername").innerHTML = `
        <div>
          <div class="flex items-center gap-1.5 mb-1">
            <span class="iconify text-sm text-gray-600" data-icon="mdi:account"></span>
            <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Username</span>
          </div>
          <div class="border-t border-gray-300 pt-1.5">
            <span class="font-medium text-gray-800">${res.data.destUsername}</span>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error("Failed to load usernames:", error);
    window.location.href = "index.html";
    return;
  }

  // Load migration parameters
  const params = await window.loadSession("migrationParams");
  const targetConfig = await window.loadSession("targetConfig");

  if (!params || !targetConfig) {
    alert("Missing migration configuration!");
    window.location.href = "source.html";
    return;
  }

  // Fetch entity info asynchronously
  fetchEntityInfo("source", params.entityType, params.entityId);
  fetchEntityInfo(
    "destination",
    targetConfig.targetEntityType,
    targetConfig.targetEntityId,
  );

  // Display source summary
  displaySourceSummary(params);

  // Display destination summary
  displayDestinationSummary(targetConfig);

  // Display batch size in summary
  const settingsData = await window.loadSession("migrationSettings");
  const batchSize = settingsData?.batchSize || 100;
  const displayBatchSize = document.getElementById("displayBatchSize");
  if (displayBatchSize) {
    displayBatchSize.textContent = batchSize.toLocaleString();
  }
}

/**
 * Format date/time based on current language
 */
function formatDateTime(timestamp) {
  // Detect current language from i18n system (default to 'en')
  const lang = window.getCurrentLanguage ? window.getCurrentLanguage() : 'en';
  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  
  return new Date(timestamp).toLocaleString(locale, {
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
 * Fetch entity info
 */
async function fetchEntityInfo(source, entityType, entityId) {
  try {
    const res = await axios.get(`${window.API_URL}/api/entity/info`, {
      params: { entityType, entityId, source },
    });

    const entityName = res.data.success && res.data.name ? res.data.name : "-";
    const containerId =
      source === "source" ? "sourceEntityName" : "destEntityName";
    const entityNameHtml = `
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:tag"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity Name</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <span class="font-medium text-gray-800">${entityName}</span>
        </div>
      </div>
    `;
    document.getElementById(containerId).innerHTML = entityNameHtml;
  } catch (error) {
    console.error(`Failed to fetch ${source} entity info:`, error);
    const containerId =
      source === "source" ? "sourceEntityName" : "destEntityName";
    const entityNameHtml = `
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:tag"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity Name</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <span class="font-medium text-gray-800">-</span>
        </div>
      </div>
    `;
    document.getElementById(containerId).innerHTML = entityNameHtml;
  }
}

/**
 * Display source configuration summary
 */
function displaySourceSummary(params) {
  document.getElementById("summarySource").innerHTML = `
    <div class="space-y-4">
      <!-- Entity Type -->
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:shape"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity Type</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <span class="font-medium text-gray-800">${params.entityType}</span>
        </div>
      </div>
      
      <!-- Entity ID -->
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:identifier"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity ID</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs text-gray-700 flex-1 break-all">${params.entityId}</span>
            <button onclick="navigator.clipboard.writeText('${params.entityId}'); this.querySelector('.iconify').setAttribute('data-icon', 'mdi:check'); setTimeout(() => this.querySelector('.iconify').setAttribute('data-icon', 'mdi:content-copy'), 1000)" class="flex-shrink-0 p-1 hover:bg-gray-200 rounded transition" title="Copy to clipboard">
              <span class="iconify text-gray-600" data-icon="mdi:content-copy"></span>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Keys -->
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:key"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Keys</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <span class="text-xs text-gray-700">${params.keys}</span>
        </div>
      </div>
      
      <!-- Start Time -->
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:clock-start"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Start Time (WIB)</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <span class="text-xs text-gray-700">${formatDateTime(params.start)}</span>
        </div>
      </div>
      
      <!-- End Time -->
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:clock-end"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">End Time (WIB)</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <span class="text-xs text-gray-700">${formatDateTime(params.end)}</span>
        </div>
      </div>
      
      <!-- Limit -->
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:counter"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Limit per Request</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <span class="font-medium text-gray-800">${(params.limit || 100).toLocaleString()}</span>
        </div>
      </div>
      
      <!-- Batch Size -->
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:package-variant"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">POST Batch Size</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <span class="font-medium text-gray-800" id="displayBatchSize">100</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Display destination configuration summary
 */
function displayDestinationSummary(targetConfig) {
  document.getElementById("summaryDestination").innerHTML = `
    <div class="space-y-4">
      <!-- Entity Type -->
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:shape"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity Type</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <span class="font-medium text-gray-800">${targetConfig.targetEntityType}</span>
        </div>
      </div>
      
      <!-- Entity ID -->
      <div>
        <div class="flex items-center gap-1.5 mb-1">
          <span class="iconify text-sm text-gray-600" data-icon="mdi:identifier"></span>
          <span class="text-xs text-gray-600 font-medium uppercase tracking-wide">Entity ID</span>
        </div>
        <div class="border-t border-gray-300 pt-1.5">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs text-gray-700 flex-1 break-all">${targetConfig.targetEntityId}</span>
            <button onclick="navigator.clipboard.writeText('${targetConfig.targetEntityId}'); this.querySelector('.iconify').setAttribute('data-icon', 'mdi:check'); setTimeout(() => this.querySelector('.iconify').setAttribute('data-icon', 'mdi:content-copy'), 1000)" class="flex-shrink-0 p-1 hover:bg-gray-200 rounded transition" title="Copy to clipboard">
              <span class="iconify text-gray-600" data-icon="mdi:content-copy"></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}




/**
 * Start migration
 */
async function startMigration() {
  if (!window.config) return alert("Config not loaded");

  const params = await window.loadSession("migrationParams");
  const targetConfig = await window.loadSession("targetConfig");

  if (!params || !targetConfig) {
    alert("Missing migration configuration!");
    return;
  }

  const box = document.getElementById("statusBox");
  const progressSection = document.getElementById("progressSection");
  const progressBar = document.getElementById("progressBar");
  const navButtons = document.getElementById("navigationButtons");
  const startButtonContainer = document.getElementById("startButtonContainer");
  const logContent = document.getElementById("logContent");

  // Hide start button container, show progress
  if (startButtonContainer) startButtonContainer.classList.add("hidden");
  progressSection.classList.remove("hidden");

  renderLogs("[INFO] Initializing migration...");
  progressBar.style.width = "10%";

  try {
    // Check auth status first
    const authCheck = await axios.get(`${window.API_URL}/api/auth/status`);
    if (!authCheck.data.bothLoggedIn) {
      renderLogs(
        "[ERROR] Please login to both source and destination systems first!",
      );
      navButtons.classList.remove("hidden");
      return;
    }

    progressBar.style.width = "20%";

    // Get batch size from settings (default 100)
    const settingsData = await window.loadSession("migrationSettings");
    const batchSize = settingsData?.batchSize || 100;

    // Start migration on backend
    const response = await axios.post(`${window.API_URL}/api/migrate`, {
      entityType: params.entityType,
      entityId: params.entityId,
      keys: params.keys,
      limit: params.limit,
      start: params.start,
      end: params.end,
      targetEntityType: targetConfig.targetEntityType,
      targetEntityId: targetConfig.targetEntityId,
      batchSize: batchSize,
    });

    progressBar.style.width = "30%";

    if (response.data.success) {


      renderLogs("[INFO] Migration started! Monitoring progress...");

      // Start elapsed time counter
      startElapsedTimer();

      // Poll status endpoint
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await axios.get(`${window.API_URL}/api/status`);
          const status = statusRes.data;

          // Update progress bar based on actual batch progress
          if (status.totalBatches > 0) {
            const percentage = Math.round(
              (status.currentBatch / status.totalBatches) * 100,
            );
            progressBar.style.width = Math.min(percentage, 100) + "%";
          } else if (status.running) {
            // Fallback to incrementing progress
            const currentWidth = parseFloat(progressBar.style.width);
            if (currentWidth < 90) {
              progressBar.style.width = currentWidth + 2 + "%";
            }
          }



          // Format and display logs
          if (status.progress) {
            renderLogs(status.progress);
          }

          // Track log file name
          if (status.logFile) {
            currentLogFile = status.logFile;
          }

          // Check if completed or error
          if (status.completed) {
            clearInterval(pollInterval);
            stopElapsedTimer(); // Stop elapsed timer
            progressBar.style.width = "100%";



            // Check if migration actually succeeded (not just "complete" but with 0 successful days)
            const isFailed =
              status.progress &&
              (status.progress.includes("Successful days: 0") ||
                status.progress.includes("ERROR:") ||
                status.progress.includes("FAILED:"));

            if (isFailed) {
              progressBar.style.background =
                "linear-gradient(to right, #EF4444, #DC2626)";
              updateMigrateAgainButton(true);
            } else {
              updateMigrateAgainButton(false);
            }

            navButtons.classList.remove("hidden");
          } else if (status.error) {
            clearInterval(pollInterval);
            stopElapsedTimer(); // Stop elapsed timer
            progressBar.style.width = "100%";
            progressBar.style.background =
              "linear-gradient(to right, #EF4444, #DC2626)";

            updateMigrateAgainButton(true);
            navButtons.classList.remove("hidden");
          } else if (!status.running && status.progress) {
            // Migration finished (either success or error)
            clearInterval(pollInterval);
            stopElapsedTimer(); // Stop elapsed timer
            progressBar.style.width = "100%";


            // Check if failed
            const isFailed =
              status.progress.includes("Successful days: 0") ||
              status.progress.includes("ERROR:") ||
              status.progress.includes("FAILED:");

            if (isFailed) {
              progressBar.style.background =
                "linear-gradient(to right, #EF4444, #DC2626)";
              updateMigrateAgainButton(true);
            } else {
              updateMigrateAgainButton(false);
            }

            navButtons.classList.remove("hidden");
            showDownloadLogButton();
          }
        } catch (error) {
          console.error("Error polling status:", error);
        }
      }, 1000); // Poll every 1 second
    }
  } catch (error) {

    stopElapsedTimer();
    progressBar.style.width = "100%";
    progressBar.style.background =
      "linear-gradient(to right, #EF4444, #DC2626)";

    renderLogs(
      `[ERROR] Error starting migration: ${error.response?.data?.detail || error.message}`,
    );
    updateMigrateAgainButton(true); // Show retry button on error
    navButtons.classList.remove("hidden");
  }
}

/**
 * Update migrate again button visibility
 * Only show retry button when migration fails
 */
function updateMigrateAgainButton(isFailed) {
  const retryBtn = document.querySelector('[onclick="rerunMigration()"]');
  if (retryBtn) {
    if (isFailed) {
      // Show retry button for failed migrations
      const translationKey = "migrate.buttons.retryMigration";
      const text = window.t ? window.t(translationKey) : "Retry Migration";
      
      retryBtn.innerHTML = `
        <span class="iconify" data-icon="mdi:restart-alert"></span>
        <span data-i18n="${translationKey}">${text}</span>
      `;
      retryBtn.style.background = "#EF4444"; // Soft red for retry
      retryBtn.classList.remove('hidden');
    } else {
      // Hide button for successful migrations
      retryBtn.classList.add('hidden');
    }
  }
}

/**
 * Rerun migration with same configuration
 */
function rerunMigration() {
  const confirmText = "Run migration again with the same configuration?";
  if (confirm(confirmText)) {
    // Just reload - the config is already saved in session
    window.location.reload();
  }
}

/**
 * Open migration settings modal
 */
async function openMigrationSettings() {
  // Load saved batch size or default to 100
  const settingsData = await window.loadSession("migrationSettings");
  const batchSize = settingsData?.batchSize || 100;
  document.getElementById("batchSizeInput").value = batchSize;
  document.getElementById("settingsModal").classList.remove("hidden");
}

/**
 * Close migration settings modal
 */
function closeMigrationSettings() {
  document.getElementById("settingsModal").classList.add("hidden");
}

/**
 * Save migration settings
 */
async function saveMigrationSettings() {
  const batchSize = parseInt(document.getElementById("batchSizeInput").value);

  if (isNaN(batchSize) || batchSize < 1 || batchSize > 2000) {
    alert("Invalid batch size. Please enter a number between 1 and 2000.");
    return;
  }

  await window.saveSession("migrationSettings", { batchSize });
  closeMigrationSettings();

  // Update displayed batch size in summary
  const displayBatchSize = document.getElementById("displayBatchSize");
  if (displayBatchSize) {
    displayBatchSize.textContent = batchSize.toLocaleString();
  }

  // Show confirmation
  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) {
    const originalText = settingsBtn.innerHTML;
    settingsBtn.innerHTML =
      '<span class="iconify text-lg text-green-600" data-icon="mdi:check-circle"></span> Saved';
    setTimeout(() => {
      settingsBtn.innerHTML = originalText;
    }, 2000);
  }
}

/**
 * Start new migration (clear session and go to source page)
 */
async function startNewMigration() {
  await window.clearSession();
  window.location.href = "source.html";
}

// Export to window object
window.initMigratePage = initMigratePage;
window.startMigration = startMigration;
window.rerunMigration = rerunMigration;
window.startNewMigration = startNewMigration;
window.openMigrationSettings = openMigrationSettings;
window.closeMigrationSettings = closeMigrationSettings;
window.saveMigrationSettings = saveMigrationSettings;

// Auto-initialize if on migrate page when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("startMigrationBtn")) {
      initMigratePage();
    }
  });
} else {
  // DOM already loaded
  if (document.getElementById("startMigrationBtn")) {
    initMigratePage();
  }
}
