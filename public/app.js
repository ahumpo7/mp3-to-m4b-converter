// State Management
let currentFile = null;
let currentFileId = null;
let totalDuration = 0;
let originalMetadata = {};
let chapters = [];
let hasOriginalCover = false;
let customCoverFile = null;
let keepCover = true;
let activeEventSource = null;
let activeJobId = null;

// Palette for visual timeline segments
const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', 
  '#f97316', '#eab308', '#10b981', '#06b6d4', 
  '#3b82f6', '#a855f7', '#14b8a6', '#f59e0b'
];

// DOM Elements
const uploadSection = document.getElementById('uploadSection');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadStatusTitle = document.getElementById('uploadStatusTitle');
const uploadStatusDesc = document.getElementById('uploadStatusDesc');

const studioSection = document.getElementById('studioSection');
const summaryFileName = document.getElementById('summaryFileName');
const summaryDuration = document.getElementById('summaryDuration');
const summarySize = document.getElementById('summarySize');
const summaryBitrate = document.getElementById('summaryBitrate');
const summaryChaptersBadge = document.getElementById('summaryChaptersBadge');
const btnChangeFile = document.getElementById('btnChangeFile');

// Cover
const coverImage = document.getElementById('coverImage');
const coverPlaceholder = document.getElementById('coverPlaceholder');
const coverFileInput = document.getElementById('coverFileInput');
const btnRemoveCover = document.getElementById('btnRemoveCover');
const coverStatusBadge = document.getElementById('coverStatusBadge');

// Metadata inputs
const metaTitle = document.getElementById('metaTitle');
const metaArtist = document.getElementById('metaArtist');
const metaComposer = document.getElementById('metaComposer');
const metaAlbum = document.getElementById('metaAlbum');
const metaYear = document.getElementById('metaYear');
const metaGenre = document.getElementById('metaGenre');
const metaComment = document.getElementById('metaComment');

// Chapters
const chapterCountDisplay = document.getElementById('chapterCountDisplay');
const chapterTimelineBar = document.getElementById('chapterTimelineBar');
const chaptersTableBody = document.getElementById('chaptersTableBody');
const noChaptersNotice = document.getElementById('noChaptersNotice');
const timelineMidPoint = document.getElementById('timelineMidPoint');
const timelineEndPoint = document.getElementById('timelineEndPoint');
const btnAddChapter = document.getElementById('btnAddChapter');
const btnImportChapters = document.getElementById('btnImportChapters');
const btnAutoSplit = document.getElementById('btnAutoSplit');
const btnClearChapters = document.getElementById('btnClearChapters');

// Modals
const importModal = document.getElementById('importModal');
const importTextarea = document.getElementById('importTextarea');
const importPreviewNotice = document.getElementById('importPreviewNotice');
const btnCloseImportModal = document.getElementById('btnCloseImportModal');
const btnApplyImport = document.getElementById('btnApplyImport');
const btnCancelImport = document.getElementById('btnCancelImport');

const splitModal = document.getElementById('splitModal');
const splitIntervalSelect = document.getElementById('splitIntervalSelect');
const splitPrefixInput = document.getElementById('splitPrefixInput');
const btnCloseSplitModal = document.getElementById('btnCloseSplitModal');
const btnApplySplit = document.getElementById('btnApplySplit');
const btnCancelSplit = document.getElementById('btnCancelSplit');

// Conversion
const optBitrate = document.getElementById('optBitrate');
const optChannels = document.getElementById('optChannels');
const optSampleRate = document.getElementById('optSampleRate');
const btnStartConversion = document.getElementById('btnStartConversion');

// Progress
const progressSection = document.getElementById('progressSection');
const conversionProgressBar = document.getElementById('conversionProgressBar');
const conversionPercentText = document.getElementById('conversionPercentText');
const statProcessedTime = document.getElementById('statProcessedTime');
const statTotalDuration = document.getElementById('statTotalDuration');
const statSpeed = document.getElementById('statSpeed');
const statEta = document.getElementById('statEta');
const btnCancelConversion = document.getElementById('btnCancelConversion');

// Complete
const completeSection = document.getElementById('completeSection');
const completeFileName = document.getElementById('completeFileName');
const completeFileSize = document.getElementById('completeFileSize');
const completeChapterCount = document.getElementById('completeChapterCount');
const completeSummaryText = document.getElementById('completeSummaryText');
const btnDownloadM4b = document.getElementById('btnDownloadM4b');
const btnConvertAnother = document.getElementById('btnConvertAnother');
const audioPreviewPlayer = document.getElementById('audioPreviewPlayer');
const playerChapterSelect = document.getElementById('playerChapterSelect');

const toastContainer = document.getElementById('toastContainer');

// Utility: Format seconds to HH:MM:SS
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Utility: Parse time string to seconds
function parseTime(timeStr) {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

// Format file size
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Toast notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// --- Upload & Analysis ---
dropzone.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover'].forEach(name => {
  dropzone.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(name => {
  dropzone.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    handleFileSelected(files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length > 0) {
    handleFileSelected(fileInput.files[0]);
  }
});

btnChangeFile.addEventListener('click', () => {
  fileInput.value = '';
  uploadSection.classList.remove('hidden');
  studioSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  completeSection.classList.add('hidden');
  uploadProgressContainer.classList.add('hidden');
  dropzone.classList.remove('hidden');
});

function handleFileSelected(file) {
  currentFile = file;
  dropzone.classList.add('hidden');
  uploadProgressContainer.classList.remove('hidden');
  uploadProgressBar.style.width = '15%';
  uploadStatusTitle.textContent = 'Uploading File...';
  uploadStatusDesc.textContent = `Sending ${file.name} (${formatBytes(file.size)}) to server`;

  const formData = new FormData();
  formData.append('audio', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/analyze');

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 75);
      uploadProgressBar.style.width = `${pct}%`;
      if (pct >= 70) {
        uploadStatusTitle.textContent = 'Analyzing Metadata & Chapters...';
        uploadStatusDesc.textContent = 'Extracting ID3v2 chapter frames and cover art via FFprobe...';
      }
    }
  });

  xhr.onload = () => {
    uploadProgressBar.style.width = '100%';
    if (xhr.status === 200) {
      try {
        const data = JSON.parse(xhr.responseText);
        setTimeout(() => initializeStudio(data), 200);
      } catch (err) {
        showToast('Error reading analysis response.');
        resetUpload();
      }
    } else {
      showToast(`Upload failed: ${xhr.statusText}`);
      resetUpload();
    }
  };

  xhr.onerror = () => {
    showToast('Network error during upload.');
    resetUpload();
  };

  xhr.send(formData);
}

function resetUpload() {
  dropzone.classList.remove('hidden');
  uploadProgressContainer.classList.add('hidden');
  uploadProgressBar.style.width = '0%';
}

// --- Initialize Studio View ---
function initializeStudio(data) {
  currentFileId = data.fileId;
  totalDuration = data.duration || 0;
  originalMetadata = data.metadata || {};

  if (Array.isArray(data.chapters) && data.chapters.length > 0) {
    chapters = [...data.chapters];
  } else {
    const defaultTitle = originalMetadata.title || data.originalName.replace(/\.[^/.]+$/, '');
    chapters = [{
      id: 1,
      start: 0,
      end: totalDuration,
      startTimeStr: '00:00:00',
      endTimeStr: formatTime(totalDuration),
      durationStr: formatTime(totalDuration),
      title: defaultTitle
    }];
  }
  hasOriginalCover = !!data.hasCover;
  customCoverFile = null;
  keepCover = hasOriginalCover;

  // Update Summary Bar
  summaryFileName.textContent = data.originalName;
  summaryDuration.textContent = data.durationFormatted || formatTime(totalDuration);
  summarySize.textContent = formatBytes(data.size);
  summaryBitrate.textContent = `${Math.round((data.bitrate || 128000) / 1000)} kbps`;
  summaryChaptersBadge.textContent = `${chapters.length} chapters`;

  // Update Cover
  if (data.hasCover && data.coverDataUrl) {
    coverImage.src = data.coverDataUrl;
    coverImage.classList.remove('hidden');
    coverPlaceholder.classList.add('hidden');
    coverStatusBadge.textContent = 'Original Cover';
    coverStatusBadge.className = 'badge-mini badge-green';
  } else {
    coverImage.src = '';
    coverImage.classList.add('hidden');
    coverPlaceholder.classList.remove('hidden');
    coverStatusBadge.textContent = 'No Cover';
    coverStatusBadge.className = 'badge-mini';
  }

  // Pre-fill Metadata Fields
  metaTitle.value = originalMetadata.title || data.originalName.replace(/\.[^/.]+$/, '');
  metaArtist.value = originalMetadata.artist || '';
  metaComposer.value = originalMetadata.composer || '';
  metaAlbum.value = originalMetadata.album || metaTitle.value;
  metaYear.value = originalMetadata.year || '';
  metaGenre.value = originalMetadata.genre || 'Audiobook';
  metaComment.value = originalMetadata.comment || '';

  // Render Chapters & Timeline
  renderChapters();

  // Switch Sections
  uploadSection.classList.add('hidden');
  studioSection.classList.remove('hidden');
  showToast(`Loaded ${data.originalName} (${chapters.length} chapters detected)`);
}

// --- Cover Art Handlers ---
coverFileInput.addEventListener('change', () => {
  if (coverFileInput.files && coverFileInput.files[0]) {
    const file = coverFileInput.files[0];
    customCoverFile = file;
    keepCover = true;

    const reader = new FileReader();
    reader.onload = (e) => {
      coverImage.src = e.target.result;
      coverImage.classList.remove('hidden');
      coverPlaceholder.classList.add('hidden');
      coverStatusBadge.textContent = 'Custom Cover';
      coverStatusBadge.className = 'badge-mini badge-green';
      showToast('New cover artwork selected.');
    };
    reader.readAsDataURL(file);
  }
});

btnRemoveCover.addEventListener('click', () => {
  customCoverFile = null;
  keepCover = false;
  coverImage.src = '';
  coverImage.classList.add('hidden');
  coverPlaceholder.classList.remove('hidden');
  coverStatusBadge.textContent = 'No Cover (Removed)';
  coverStatusBadge.className = 'badge-mini';
  showToast('Cover artwork removed from output.');
});

// --- Chapters & Timeline Rendering ---
function renderChapters() {
  chapterCountDisplay.textContent = chapters.length;
  summaryChaptersBadge.textContent = `${chapters.length} chapters`;

  // Render Timeline Bar
  chapterTimelineBar.innerHTML = '';
  timelineEndPoint.textContent = formatTime(totalDuration);
  timelineMidPoint.textContent = formatTime(totalDuration / 2);

  if (chapters.length === 0) {
    noChaptersNotice.classList.remove('hidden');
    chaptersTableBody.innerHTML = '';
    return;
  }

  noChaptersNotice.classList.add('hidden');

  // Render Timeline Segments
  chapters.forEach((ch, idx) => {
    const seg = document.createElement('div');
    seg.className = 'timeline-segment';
    const chDur = Math.max(0, ch.end - ch.start);
    const pct = totalDuration > 0 ? (chDur / totalDuration) * 100 : (100 / chapters.length);
    seg.style.width = `${pct}%`;
    seg.style.backgroundColor = PALETTE[idx % PALETTE.length];
    seg.title = `${ch.title} (${ch.startTimeStr || formatTime(ch.start)} - ${ch.endTimeStr || formatTime(ch.end)})`;

    seg.addEventListener('click', () => {
      const row = document.getElementById(`chapter-row-${idx}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        row.style.backgroundColor = 'rgba(99, 102, 241, 0.2)';
        setTimeout(() => row.style.backgroundColor = '', 1000);
      }
    });

    chapterTimelineBar.appendChild(seg);
  });

  // Render Table Rows
  chaptersTableBody.innerHTML = '';
  chapters.forEach((ch, idx) => {
    const tr = document.createElement('tr');
    tr.id = `chapter-row-${idx}`;

    const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PALETTE[idx % PALETTE.length]};margin-right:6px"></span>`;

    tr.innerHTML = `
      <td style="color:var(--text-dim);font-weight:600">${colorDot}${idx + 1}</td>
      <td>
        <input type="text" class="ch-input" value="${escapeHtml(ch.title)}" data-idx="${idx}" data-field="title">
      </td>
      <td>
        <input type="text" class="ch-input ch-time" value="${ch.startTimeStr || formatTime(ch.start)}" data-idx="${idx}" data-field="start">
      </td>
      <td>
        <input type="text" class="ch-input ch-time" value="${ch.endTimeStr || formatTime(ch.end)}" data-idx="${idx}" data-field="end">
      </td>
      <td class="ch-time" style="color:var(--text-dim)">
        ${formatTime(Math.max(0, ch.end - ch.start))}
      </td>
      <td>
        <button class="btn btn-danger-ghost btn-xs btn-del-ch" data-idx="${idx}" title="Delete chapter">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </td>
    `;
    chaptersTableBody.appendChild(tr);
  });

  // Add event listeners for table inputs
  chaptersTableBody.querySelectorAll('.ch-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const field = e.target.dataset.field;
      if (field === 'title') {
        chapters[idx].title = e.target.value.trim() || `Chapter ${idx + 1}`;
      } else if (field === 'start') {
        const sec = parseTime(e.target.value);
        chapters[idx].start = sec;
        chapters[idx].startTimeStr = formatTime(sec);
      } else if (field === 'end') {
        const sec = parseTime(e.target.value);
        chapters[idx].end = sec;
        chapters[idx].endTimeStr = formatTime(sec);
      }
      renderChapters();
    });
  });

  // Delete buttons
  chaptersTableBody.querySelectorAll('.btn-del-ch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('.btn-del-ch');
      const idx = parseInt(targetBtn.dataset.idx, 10);
      chapters.splice(idx, 1);
      renderChapters();
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Add Chapter
btnAddChapter.addEventListener('click', () => {
  let startSec = 0;
  if (chapters.length > 0) {
    const last = chapters[chapters.length - 1];
    startSec = last.end;
  }
  const endSec = totalDuration > startSec ? totalDuration : startSec + 300;
  chapters.push({
    id: chapters.length + 1,
    start: startSec,
    end: endSec,
    startTimeStr: formatTime(startSec),
    endTimeStr: formatTime(endSec),
    title: `Chapter ${chapters.length + 1}`
  });
  renderChapters();
  showToast(`Added Chapter ${chapters.length}`);
});

// Clear Chapters
btnClearChapters.addEventListener('click', () => {
  if (chapters.length === 0) return;
  if (confirm('Are you sure you want to remove all chapters?')) {
    chapters = [];
    renderChapters();
    showToast('All chapters cleared.');
  }
});

// --- Import Chapters Modal ---
btnImportChapters.addEventListener('click', () => {
  importTextarea.value = '';
  importPreviewNotice.classList.add('hidden');
  importModal.showModal();
});

btnCloseImportModal.addEventListener('click', () => importModal.close());
btnCancelImport.addEventListener('click', () => importModal.close());

importTextarea.addEventListener('input', () => {
  const parsed = parseImportText(importTextarea.value);
  if (parsed.length > 0) {
    importPreviewNotice.textContent = `Found ${parsed.length} chapter marks ready to import.`;
    importPreviewNotice.classList.remove('hidden');
  } else {
    importPreviewNotice.classList.add('hidden');
  }
});

btnApplyImport.addEventListener('click', () => {
  const parsed = parseImportText(importTextarea.value);
  if (parsed.length === 0) {
    showToast('No valid chapter timestamps found in text.');
    return;
  }
  chapters = parsed;
  renderChapters();
  importModal.close();
  showToast(`Successfully imported ${parsed.length} chapters.`);
});

function parseImportText(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rawList = [];

  // Check CUE format
  let currentTitle = '';
  let inCue = false;

  for (const line of lines) {
    // CUE sheet parsing
    if (line.match(/TRACK\s+\d+\s+AUDIO/i)) {
      inCue = true;
      currentTitle = '';
      continue;
    }
    if (inCue && line.match(/TITLE\s+"?([^"]+)"?/i)) {
      const match = line.match(/TITLE\s+"?([^"]+)"?/i);
      currentTitle = match[1];
      continue;
    }
    if (inCue && line.match(/INDEX\s+01\s+(\d+:\d+:\d+)/i)) {
      const match = line.match(/INDEX\s+01\s+(\d+:\d+:\d+)/i);
      const cueTime = match[1]; // mm:ss:ff
      const parts = cueTime.split(':').map(Number);
      const sec = parts[0] * 60 + parts[1] + (parts[2] / 75);
      rawList.push({ time: sec, title: currentTitle || `Chapter ${rawList.length + 1}` });
      continue;
    }

    // Standard timestamp lines: e.g. "01:23:45 Chapter Title" or "Chapter 1 - 05:30"
    const timeMatch = line.match(/(?:^|\s|\()(\d{1,2}:\d{2}(?::\d{2})?)(?:\s|\)|$)/);
    if (timeMatch) {
      const timeStr = timeMatch[1];
      const sec = parseTime(timeStr);
      let title = line.replace(timeMatch[0], '').replace(/^[\s\-–—:\.\)]+|[\s\-–—:\.\(]+$/g, '').trim();
      if (!title) title = `Chapter ${rawList.length + 1}`;
      rawList.push({ time: sec, title });
    }
  }

  if (rawList.length === 0) return [];

  // Sort by time
  rawList.sort((a, b) => a.time - b.time);

  // Compute start/end for each chapter
  const result = [];
  for (let i = 0; i < rawList.length; i++) {
    const cur = rawList[i];
    const start = cur.time;
    let end = totalDuration;
    if (i < rawList.length - 1) {
      end = rawList[i + 1].time;
    }
    result.push({
      id: i + 1,
      start,
      end,
      startTimeStr: formatTime(start),
      endTimeStr: formatTime(end),
      title: cur.title
    });
  }
  return result;
}

// --- Auto-Split Modal ---
btnAutoSplit.addEventListener('click', () => {
  splitModal.showModal();
});

btnCloseSplitModal.addEventListener('click', () => splitModal.close());
btnCancelSplit.addEventListener('click', () => splitModal.close());

btnApplySplit.addEventListener('click', () => {
  const interval = parseInt(splitIntervalSelect.value, 10) || 1800;
  const prefix = splitPrefixInput.value || 'Chapter ';

  const newChapters = [];
  let currentStart = 0;
  let chNum = 1;

  while (currentStart < totalDuration) {
    const currentEnd = Math.min(totalDuration, currentStart + interval);
    newChapters.push({
      id: chNum,
      start: currentStart,
      end: currentEnd,
      startTimeStr: formatTime(currentStart),
      endTimeStr: formatTime(currentEnd),
      title: `${prefix}${chNum}`
    });
    currentStart = currentEnd;
    chNum++;
  }

  chapters = newChapters;
  renderChapters();
  splitModal.close();
  showToast(`Generated ${newChapters.length} chapters.`);
});

// --- Start Conversion ---
btnStartConversion.addEventListener('click', () => {
  if (!currentFileId) {
    showToast('No active file selected.');
    return;
  }

  const metadata = {
    title: metaTitle.value.trim(),
    artist: metaArtist.value.trim(),
    composer: metaComposer.value.trim(),
    album: metaAlbum.value.trim(),
    year: metaYear.value.trim(),
    genre: metaGenre.value.trim(),
    comment: metaComment.value.trim()
  };

  const audioOptions = {
    bitrate: optBitrate.value,
    channels: optChannels.value,
    sampleRate: optSampleRate.value
  };

  const formData = new FormData();
  formData.append('fileId', currentFileId);
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('chapters', JSON.stringify(chapters));
  formData.append('audioOptions', JSON.stringify(audioOptions));
  formData.append('keepCover', keepCover);

  if (customCoverFile) {
    formData.append('newCover', customCoverFile);
  }

  // Switch to progress view
  studioSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  conversionProgressBar.style.width = '0%';
  conversionPercentText.textContent = '0%';
  statTotalDuration.textContent = formatTime(totalDuration);
  statProcessedTime.textContent = '00:00:00';
  statSpeed.textContent = 'Starting...';
  statEta.textContent = 'Calculating...';

  fetch('/api/convert', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success && data.jobId) {
      activeJobId = data.jobId;
      startProgressStream(data.jobId);
    } else {
      throw new Error(data.error || 'Failed to start conversion');
    }
  })
  .catch(err => {
    showToast(`Conversion failed: ${err.message}`);
    progressSection.classList.add('hidden');
    studioSection.classList.remove('hidden');
  });
});

// --- Progress Stream (SSE) ---
function startProgressStream(jobId) {
  if (activeEventSource) {
    activeEventSource.close();
  }

  const startTime = Date.now();
  const eventSource = new EventSource(`/api/progress/${jobId}`);
  activeEventSource = eventSource;

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'progress') {
        const pct = Math.min(100, Math.max(0, data.percent || 0));
        conversionProgressBar.style.width = `${pct}%`;
        conversionPercentText.textContent = `${pct}%`;

        if (data.currentTimeStr) {
          statProcessedTime.textContent = data.currentTimeStr;
        } else if (data.currentTime) {
          statProcessedTime.textContent = formatTime(data.currentTime);
        }

        if (data.speed) {
          statSpeed.textContent = data.speed;
        }

        // Calculate ETA
        const elapsed = (Date.now() - startTime) / 1000;
        if (pct > 5 && pct < 100) {
          const estimatedTotal = (elapsed / pct) * 100;
          const remainingSec = Math.max(0, estimatedTotal - elapsed);
          statEta.textContent = formatTime(remainingSec);
        }
      } else if (data.type === 'complete') {
        eventSource.close();
        activeEventSource = null;
        onConversionComplete(data);
      } else if (data.type === 'error') {
        eventSource.close();
        activeEventSource = null;
        showToast(`Conversion error: ${data.message}`);
        progressSection.classList.add('hidden');
        studioSection.classList.remove('hidden');
      }
    } catch (e) {
      console.warn('SSE JSON parse error:', e);
    }
  };

  eventSource.onerror = () => {
    // If connection drops, it will auto-retry
  };
}

// Cancel Conversion
btnCancelConversion.addEventListener('click', () => {
  if (activeJobId) {
    fetch(`/api/cancel/${activeJobId}`, { method: 'POST' });
  }
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
  progressSection.classList.add('hidden');
  studioSection.classList.remove('hidden');
  showToast('Conversion cancelled.');
});

// --- Conversion Complete ---
function onConversionComplete(data) {
  progressSection.classList.add('hidden');
  completeSection.classList.remove('hidden');

  completeFileName.textContent = data.fileName;
  completeFileSize.textContent = formatBytes(data.fileSize);
  completeChapterCount.textContent = `${chapters.length} chapters`;
  completeSummaryText.textContent = `Successfully created ${data.fileName} with ${chapters.length} chapter markers and full metadata.`;

  btnDownloadM4b.href = data.downloadUrl;
  btnDownloadM4b.setAttribute('download', data.fileName);

  // Setup In-Browser Audio Player
  if (data.streamUrl) {
    audioPreviewPlayer.src = data.streamUrl;
    playerChapterSelect.innerHTML = '';

    if (chapters.length > 0) {
      chapters.forEach((ch, idx) => {
        const opt = document.createElement('option');
        opt.value = ch.start;
        opt.textContent = `${idx + 1}. ${ch.title} (${ch.startTimeStr || formatTime(ch.start)})`;
        playerChapterSelect.appendChild(opt);
      });

      playerChapterSelect.onchange = () => {
        const startSec = parseFloat(playerChapterSelect.value);
        audioPreviewPlayer.currentTime = startSec;
        audioPreviewPlayer.play();
      };
    } else {
      const opt = document.createElement('option');
      opt.textContent = 'Full Audiobook (No separate chapters)';
      playerChapterSelect.appendChild(opt);
    }
  }

  showToast('🎉 M4B Audiobook ready for download!');
}

// Convert Another File
btnConvertAnother.addEventListener('click', () => {
  audioPreviewPlayer.pause();
  audioPreviewPlayer.src = '';
  fileInput.value = '';
  currentFile = null;
  currentFileId = null;
  chapters = [];
  activeJobId = null;

  completeSection.classList.add('hidden');
  studioSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  dropzone.classList.remove('hidden');
  uploadProgressContainer.classList.add('hidden');
  uploadProgressBar.style.width = '0%';
});
