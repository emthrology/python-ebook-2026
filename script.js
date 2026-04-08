import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs";

/* ── Book Catalog ── */
const BOOK_CATALOG = {
  fundamentals: {
    title: "Fundamentals for Self-Taught Programmers",
    file: "./books/fundamentals.pdf",
    pages: 254,
  },
  "functional-go": {
    title: "Functional Programming in Go",
    file: "./books/functional-go.pdf",
    pages: 248,
  },
};

const params = new URLSearchParams(window.location.search);
const bookKey = params.get("book") || Object.keys(BOOK_CATALOG)[0];
const bookConfig = BOOK_CATALOG[bookKey];

/* ── PDF state ── */
let pdfDoc = null;
let totalPages = 0;
let desktopSheetCount = 0;
const textCache = [];
const renderCache = {};
const RENDER_WINDOW = 5;

/* ── DOM refs ── */
const book = document.getElementById("book");
const sheetTemplate = document.getElementById("sheetTemplate");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const prevPage = document.getElementById("prevPage");
const nextPage = document.getElementById("nextPage");
const pageRange = document.getElementById("pageRange");
const pageIndicator = document.getElementById("pageIndicator");
const progressText = document.getElementById("progressText");
const pageCountText = document.getElementById("pageCountText");
const stageIndicator = document.getElementById("stageIndicator");
const spreadIndicator = document.getElementById("spreadIndicator");
const searchSummary = document.getElementById("searchSummary");
const highlightHint = document.getElementById("highlightHint");
const tocList = document.getElementById("tocList");
const tocPanel = document.getElementById("tocPanel");
const tocToggle = document.getElementById("tocToggle");
const fullscreenToggle = document.getElementById("fullscreenToggle");
const searchPanelToggle = document.getElementById("searchPanelToggle");
const extractPanelToggle = document.getElementById("extractPanelToggle");
const pageStages = document.getElementById("pageStages");
const searchPanel = document.getElementById("searchPanel");
const extractPanel = document.getElementById("extractPanel");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");
const searchResults = document.getElementById("searchResults");
const searchCountBadge = document.getElementById("searchCountBadge");
const zoomInButton = document.getElementById("zoomInButton");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomResetButton = document.getElementById("zoomResetButton");
const zoomValue = document.getElementById("zoomValue");
const highlightToggle = document.getElementById("highlightToggle");
const clearHighlightsButton = document.getElementById("clearHighlightsButton");
const extractCurrentButton = document.getElementById("extractCurrentButton");
const extractAllButton = document.getElementById("extractAllButton");
const copyExtractButton = document.getElementById("copyExtractButton");
const downloadExtractButton = document.getElementById("downloadExtractButton");
const extractOutput = document.getElementById("extractOutput");
const extractModeBadge = document.getElementById("extractModeBadge");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");

const sheets = [];
const mobileMediaQuery = window.matchMedia("(max-width: 900px)");
let currentSheet = 0;
let currentExtractText = "";
let textExtractionDone = false;
const state = {
  zoom: 1,
  highlightMode: false,
  searchQuery: "",
  searchResults: [],
  highlightsByPage: new Map(),
};

/* ── Utilities ── */
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isMobileView() {
  return mobileMediaQuery.matches;
}

function getMaxStep() {
  return isMobileView() ? totalPages - 1 : desktopSheetCount;
}

function getVisiblePageIndices() {
  if (isMobileView()) {
    return [clamp(currentSheet, 0, totalPages - 1)];
  }
  if (currentSheet === 0) return [0];
  if (currentSheet >= desktopSheetCount) {
    return [totalPages - 1].filter((i) => i >= 0);
  }
  return [currentSheet * 2 - 1, currentSheet * 2].filter(
    (i) => i >= 0 && i < totalPages,
  );
}

function goToPage(pageIndex) {
  if (isMobileView()) {
    goToSheet(clamp(pageIndex, 0, totalPages - 1));
  } else {
    if (pageIndex <= 0) {
      goToSheet(0);
      return;
    }
    goToSheet(Math.ceil(pageIndex / 2));
  }
}

/* ── PDF rendering ── */
function waitForLayout(element) {
  return new Promise((resolve) => {
    if (element.clientWidth > 0 && element.clientHeight > 0) {
      resolve();
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          observer.disconnect();
          resolve();
          return;
        }
      }
    });
    observer.observe(element);
    // Fallback timeout
    setTimeout(() => { observer.disconnect(); resolve(); }, 500);
  });
}

async function renderPdfPage(pageNum, canvas) {
  const key = pageNum;
  if (renderCache[key]?.rendering || renderCache[key]?.rendered) return;
  renderCache[key] = { rendering: true, rendered: false };

  try {
    const container = canvas.parentElement;
    await waitForLayout(container);

    const page = await pdfDoc.getPage(pageNum);
    const containerWidth = container.clientWidth || 400;
    const containerHeight = container.clientHeight || 560;

    const defaultViewport = page.getViewport({ scale: 1 });
    const scaleW = containerWidth / defaultViewport.width;
    const scaleH = containerHeight / defaultViewport.height;
    const baseScale = Math.min(scaleW, scaleH);

    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: baseScale * dpr });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = Math.floor(baseScale * defaultViewport.width) + "px";
    canvas.style.height =
      Math.floor(baseScale * defaultViewport.height) + "px";

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    renderCache[key] = { rendering: false, rendered: true };
  } catch {
    renderCache[key] = { rendering: false, rendered: false };
  }
}

function createPageContent(pageNum) {
  const container = document.createElement("div");
  container.className = "page-pdf-container";
  container.dataset.pageNum = String(pageNum);

  const canvas = document.createElement("canvas");
  canvas.className = "pdf-page-canvas";
  container.appendChild(canvas);

  const highlightLayer = document.createElement("div");
  highlightLayer.className = "highlight-layer";
  highlightLayer.dataset.pageIndex = String(pageNum - 1);
  container.appendChild(highlightLayer);

  const pageNumEl = document.createElement("p");
  pageNumEl.className = "page-number";
  pageNumEl.textContent = `Page ${String(pageNum).padStart(3, "0")}`;
  container.appendChild(pageNumEl);

  return container;
}

/* ── Sliding window DOM ── */
function getWindowRange() {
  const isMobile = isMobileView();
  if (isMobile) {
    const start = Math.max(0, currentSheet - RENDER_WINDOW);
    const end = Math.min(totalPages - 1, currentSheet + RENDER_WINDOW);
    return { start, end, isMobile: true };
  }
  const start = Math.max(0, currentSheet - RENDER_WINDOW);
  const end = Math.min(desktopSheetCount - 1, currentSheet + RENDER_WINDOW);
  return { start, end, isMobile: false };
}

function renderBook() {
  const isMobile = isMobileView();
  pageRange.max = String(getMaxStep());
  book.innerHTML = "";
  sheets.length = 0;
  // Clear render cache since DOM is rebuilt with new canvases
  for (const key in renderCache) delete renderCache[key];
  book.classList.toggle("is-mobile", isMobile);

  const { start, end } = getWindowRange();

  if (isMobile) {
    for (let pageIndex = start; pageIndex <= end; pageIndex++) {
      const sheet = sheetTemplate.content.firstElementChild.cloneNode(true);
      const front = sheet.querySelector(".page-front .page-inner");
      const back = sheet.querySelector(".page-back .page-inner");

      sheet.dataset.index = String(pageIndex);
      sheet.dataset.sheetIndex = String(pageIndex);
      sheet.classList.add("sheet-mobile");
      sheet.style.zIndex = String(totalPages - pageIndex);

      front.innerHTML = "";
      front.appendChild(createPageContent(pageIndex + 1));
      back.innerHTML = "";

      book.append(sheet);
      sheets.push(sheet);

      const canvas = front.querySelector(".pdf-page-canvas");
      requestAnimationFrame(() => renderPdfPage(pageIndex + 1, canvas));
    }
  } else {
    for (let sheetIndex = start; sheetIndex <= end; sheetIndex++) {
      const sheet = sheetTemplate.content.firstElementChild.cloneNode(true);
      sheet.dataset.index = String(sheetIndex);
      sheet.dataset.sheetIndex = String(sheetIndex);
      sheet.style.zIndex = String(desktopSheetCount - sheetIndex);

      const front = sheet.querySelector(".page-front .page-inner");
      const back = sheet.querySelector(".page-back .page-inner");

      const frontPageNum = sheetIndex * 2 + 1;
      const backPageNum = sheetIndex * 2 + 2;

      front.innerHTML = "";
      front.appendChild(createPageContent(frontPageNum));

      back.innerHTML = "";
      if (backPageNum <= totalPages) {
        back.appendChild(createPageContent(backPageNum));
      } else {
        back.innerHTML =
          '<div class="page-cover"><div><span class="cover-badge">END</span></div></div>';
      }

      book.append(sheet);
      sheets.push(sheet);

      const frontCanvas = front.querySelector(".pdf-page-canvas");
      requestAnimationFrame(() => renderPdfPage(frontPageNum, frontCanvas));
      if (backPageNum <= totalPages) {
        const backCanvas = back.querySelector(".pdf-page-canvas");
        requestAnimationFrame(() => renderPdfPage(backPageNum, backCanvas));
      }
    }
  }

  renderHighlights();
}

function updateRenderWindow() {
  const { start, end, isMobile } = getWindowRange();

  const existingIndices = new Set();
  sheets.forEach((s) => existingIndices.add(Number(s.dataset.sheetIndex)));

  const neededIndices = new Set();
  for (let i = start; i <= end; i++) neededIndices.add(i);

  let needsRebuild = false;
  for (const idx of neededIndices) {
    if (!existingIndices.has(idx)) {
      needsRebuild = true;
      break;
    }
  }

  if (needsRebuild) {
    // Clear caches for pages far outside window to save memory
    const windowPageStart = isMobile ? start : start * 2;
    const windowPageEnd = isMobile ? end : (end + 1) * 2;
    for (const key in renderCache) {
      const pageNum = Number(key);
      if (pageNum < windowPageStart - 10 || pageNum > windowPageEnd + 10) {
        delete renderCache[key];
      }
    }
    renderBook();
  }
}

/* ── Highlights ── */
function renderHighlights() {
  document.querySelectorAll(".highlight-layer").forEach((layer) => {
    const pageIndex = Number(layer.dataset.pageIndex);
    const items = state.highlightsByPage.get(pageIndex) ?? [];
    layer.innerHTML = items
      .map(
        (item) => `
        <span class="highlight-chip"
          style="left:${item.x}%; top:${item.y}%; width:${item.width}%; height:${item.height}%"
        ></span>`,
      )
      .join("");
  });
}

// Event delegation for highlights on dynamic DOM
book.addEventListener("click", (event) => {
  if (!state.highlightMode) return;
  const container = event.target.closest(".page-pdf-container");
  if (!container) return;

  const pageIndex = Number(container.dataset.pageNum) - 1;
  const rect = container.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  const nextItem = {
    x: clamp(x - 15, 2, 78),
    y: clamp(y - 4, 2, 92),
    width: 30,
    height: 8,
  };
  const existing = state.highlightsByPage.get(pageIndex) ?? [];
  state.highlightsByPage.set(pageIndex, [...existing, nextItem]);
  renderHighlights();
});

/* ── TOC ── */
async function buildToc() {
  let outline = null;
  try {
    outline = await pdfDoc.getOutline();
  } catch {
    /* no outline */
  }

  if (!outline || outline.length === 0) {
    // Fallback: create entries every 20 pages
    const step = Math.max(1, Math.floor(totalPages / 15));
    const items = [];
    for (let i = 0; i < totalPages; i += step) {
      items.push({ pageNum: i + 1, title: `Page ${i + 1}` });
    }
    tocList.innerHTML = items
      .map(
        (item) => `
        <button class="toc-item" type="button" data-target-page="${item.pageNum - 1}">
          ${escapeHtml(item.title)}
          <small>Page ${String(item.pageNum).padStart(3, "0")}</small>
        </button>`,
      )
      .join("");
  } else {
    const tocItems = [];
    for (const item of outline) {
      try {
        let pageIndex = 0;
        if (typeof item.dest === "string") {
          const dest = await pdfDoc.getDestination(item.dest);
          if (dest) {
            pageIndex = await pdfDoc.getPageIndex(dest[0]);
          }
        } else if (Array.isArray(item.dest)) {
          pageIndex = await pdfDoc.getPageIndex(item.dest[0]);
        }
        tocItems.push({ title: item.title, pageIndex });
      } catch {
        tocItems.push({ title: item.title, pageIndex: 0 });
      }
    }

    tocList.innerHTML = tocItems
      .map(
        (item) => `
        <button class="toc-item" type="button" data-target-page="${item.pageIndex}">
          ${escapeHtml(item.title)}
          <small>Page ${String(item.pageIndex + 1).padStart(3, "0")}</small>
        </button>`,
      )
      .join("");
  }

  tocList.querySelectorAll(".toc-item").forEach((button) => {
    button.addEventListener("click", () => {
      goToPage(Number(button.dataset.targetPage));
    });
  });
}

function updateToc() {
  const buttons = Array.from(tocList.querySelectorAll(".toc-item"));
  if (buttons.length === 0) return;

  const visiblePages = getVisiblePageIndices();
  const currentPage = visiblePages[0] ?? 0;

  buttons.forEach((button) => {
    const targetPage = Number(button.dataset.targetPage);
    const nextButton = button.nextElementSibling;
    const nextPage = nextButton
      ? Number(nextButton.dataset.targetPage)
      : totalPages;
    button.classList.toggle(
      "is-active",
      currentPage >= targetPage && currentPage < nextPage,
    );
  });
}

/* ── Page Stages (simplified for many pages) ── */
function buildPageStages() {
  // Hide page stages for large books - too many chips
  if (totalPages > 30) {
    pageStages.classList.add("is-hidden");
    return;
  }
  pageStages.classList.remove("is-hidden");
  pageStages.innerHTML = Array.from(
    { length: totalPages },
    (_, i) => `
      <button class="page-stage-chip" type="button" data-page-index="${i}">
        <span>Page ${String(i + 1).padStart(3, "0")}</span>
      </button>`,
  ).join("");

  pageStages.querySelectorAll(".page-stage-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      goToPage(Number(chip.dataset.pageIndex));
    });
  });
}

function updatePageStages() {
  const visible = new Set(getVisiblePageIndices());
  pageStages.querySelectorAll(".page-stage-chip").forEach((chip) => {
    const pageIndex = Number(chip.dataset.pageIndex);
    chip.classList.toggle("is-active", visible.has(pageIndex));
  });
}

/* ── Search ── */
async function extractAllTextInBackground() {
  if (loadingText) {
    loadingText.textContent = "페이지 텍스트 인덱싱 중...";
  }
  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      textCache[i - 1] = textContent.items.map((item) => item.str).join(" ");
    } catch {
      textCache[i - 1] = "";
    }
    if (i % 10 === 0) {
      if (searchSummary) {
        searchSummary.textContent = `인덱싱 중... ${i}/${totalPages}`;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  textExtractionDone = true;
  if (searchSummary) {
    searchSummary.textContent = "검색 준비 완료";
  }
}

function performSearch() {
  const query = searchInput.value.trim().toLowerCase();
  state.searchQuery = query;

  if (!query) {
    state.searchResults = [];
    updateSearchResultsPanel();
    return;
  }

  if (!textExtractionDone) {
    searchSummary.textContent = "텍스트 인덱싱이 아직 진행 중입니다...";
    return;
  }

  state.searchResults = textCache
    .map((text, index) => {
      if (!text) return null;
      const normalized = text.toLowerCase();
      const matchIndex = normalized.indexOf(query);
      if (matchIndex === -1) return null;
      const snippetStart = Math.max(0, matchIndex - 28);
      const snippetEnd = Math.min(
        text.length,
        matchIndex + query.length + 56,
      );
      return {
        pageIndex: index,
        title: `Page ${index + 1}`,
        snippet: text.slice(snippetStart, snippetEnd).trim(),
      };
    })
    .filter(Boolean);

  updateSearchResultsPanel();
}

function clearSearch() {
  searchInput.value = "";
  state.searchQuery = "";
  state.searchResults = [];
  updateSearchResultsPanel();
}

function updateSearchResultsPanel() {
  if (!state.searchQuery) {
    searchResults.innerHTML =
      '<p class="empty-message">검색어를 입력하면 관련 페이지가 여기에 표시됩니다.</p>';
    if (textExtractionDone) {
      searchSummary.textContent = "검색 준비 완료";
    }
    searchCountBadge.textContent = "0건";
    return;
  }

  if (state.searchResults.length === 0) {
    searchResults.innerHTML =
      '<p class="empty-message">일치하는 페이지를 찾지 못했습니다.</p>';
    searchSummary.textContent = `"${state.searchQuery}" 검색 결과가 없습니다.`;
    searchCountBadge.textContent = "0건";
    return;
  }

  searchResults.innerHTML = state.searchResults
    .map(
      (result) => `
      <button class="search-result-item" type="button" data-target-page="${result.pageIndex}">
        <strong>Page ${String(result.pageIndex + 1).padStart(3, "0")} · ${escapeHtml(result.title)}</strong>
        <span>${escapeHtml(result.snippet)}</span>
      </button>`,
    )
    .join("");

  searchResults.querySelectorAll(".search-result-item").forEach((button) => {
    button.addEventListener("click", () => {
      goToPage(Number(button.dataset.targetPage));
    });
  });

  searchSummary.textContent = `"${state.searchQuery}" 검색 결과 ${state.searchResults.length}건`;
  searchCountBadge.textContent = `${state.searchResults.length}건`;
}

/* ── Text extraction ── */
function collectPageText(pageIndex) {
  return (
    textCache[pageIndex] ||
    `[Page ${pageIndex + 1} - 텍스트 추출 대기 중]`
  );
}

function setExtractOutput(mode, pageIndices) {
  currentExtractText = pageIndices
    .map(
      (index) =>
        `Page ${index + 1}\n${collectPageText(index)}`,
    )
    .join("\n\n---\n\n");
  extractOutput.textContent = currentExtractText;
  extractModeBadge.textContent = mode;
}

async function copyExtractText() {
  if (!currentExtractText) return;
  await navigator.clipboard.writeText(currentExtractText);
  extractModeBadge.textContent = "복사 완료";
}

function downloadExtractText() {
  if (!currentExtractText) return;
  const blob = new Blob([currentExtractText], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${bookConfig.title}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  extractModeBadge.textContent = "TXT 저장 완료";
}

/* ── Zoom ── */
function applyZoom() {
  book.style.setProperty("--book-scale", String(state.zoom));
  zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
}

/* ── UI update ── */
function updateUi() {
  const isMobile = isMobileView();

  sheets.forEach((sheet) => {
    const sheetIndex = Number(sheet.dataset.sheetIndex);

    if (isMobile) {
      sheet.classList.remove("is-flipped");
      sheet.classList.toggle("is-current", sheetIndex === currentSheet);
      sheet.classList.toggle(
        "is-left-of-current",
        sheetIndex < currentSheet,
      );
      sheet.classList.toggle(
        "is-right-of-current",
        sheetIndex > currentSheet,
      );
      sheet.style.zIndex =
        sheetIndex === currentSheet
          ? String(totalPages + 1)
          : String(totalPages - sheetIndex);
    } else {
      sheet.classList.remove(
        "is-current",
        "is-left-of-current",
        "is-right-of-current",
      );
      sheet.classList.toggle("is-flipped", sheetIndex < currentSheet);
      sheet.style.zIndex =
        sheetIndex < currentSheet
          ? String(sheetIndex + 1)
          : String(desktopSheetCount - sheetIndex);
    }
  });

  const visibleIndices = getVisiblePageIndices();
  const stageLabel = visibleIndices.map((i) => i + 1).join("-");
  const progressBase = visibleIndices.length
    ? visibleIndices[visibleIndices.length - 1] + 1
    : 1;
  const percentage = Math.round((progressBase / totalPages) * 100);

  pageIndicator.textContent =
    visibleIndices.map((i) => `Page ${i + 1}`).join(" / ") || "Cover";
  progressText.textContent = `${percentage}%`;
  pageCountText.textContent = `${totalPages} Pages`;
  stageIndicator.textContent = `${stageLabel || "1"} / ${totalPages}`;
  spreadIndicator.textContent =
    visibleIndices.map((i) => `Page ${i + 1}`).join(" · ") || "-";
  highlightHint.textContent = state.highlightMode
    ? "하이라이트 모드가 켜져 있습니다. 페이지를 클릭하면 표시가 추가됩니다."
    : "하이라이트를 켜면 페이지를 클릭해 표시를 남길 수 있습니다.";
  highlightToggle.classList.toggle("is-active", state.highlightMode);
  highlightToggle.title = state.highlightMode
    ? "하이라이트 끄기"
    : "하이라이트 켜기";
  highlightToggle.setAttribute(
    "aria-label",
    state.highlightMode ? "하이라이트 끄기" : "하이라이트 켜기",
  );
  pageRange.value = String(currentSheet);

  prevButton.disabled = currentSheet === 0;
  prevPage.disabled = currentSheet === 0;
  nextButton.disabled = currentSheet === getMaxStep();
  nextPage.disabled = currentSheet === getMaxStep();

  updateToc();
  updatePageStages();
}

/* ── Navigation ── */
function goToSheet(index) {
  currentSheet = Math.max(0, Math.min(index, getMaxStep()));
  updateRenderWindow();
  updateUi();
}

function nextSheet() {
  if (currentSheet < getMaxStep()) goToSheet(currentSheet + 1);
}

function prevSheet() {
  if (currentSheet > 0) goToSheet(currentSheet - 1);
}

/* ── Panel toggle ── */
function togglePanel(panel) {
  const otherPanel = panel === searchPanel ? extractPanel : searchPanel;
  const isOpening = panel.classList.contains("is-collapsed");
  otherPanel.classList.add("is-collapsed");
  panel.classList.toggle("is-collapsed", !isOpening);
  searchPanelToggle.classList.toggle(
    "is-active",
    isOpening && panel === searchPanel,
  );
  extractPanelToggle.classList.toggle(
    "is-active",
    isOpening && panel === extractPanel,
  );
  if (!isOpening) {
    searchPanelToggle.classList.remove("is-active");
    extractPanelToggle.classList.remove("is-active");
  }
}

function clearCurrentHighlights() {
  getVisiblePageIndices().forEach((index) => {
    state.highlightsByPage.delete(index);
  });
  renderHighlights();
}

/* ── Init ── */
async function init() {
  if (!bookConfig) {
    book.innerHTML =
      '<div class="pdf-loading"><p>알 수 없는 책입니다.</p></div>';
    return;
  }

  document.title = bookConfig.title;

  if (loadingOverlay) loadingOverlay.style.display = "flex";
  if (loadingText)
    loadingText.textContent = `"${bookConfig.title}" 로딩 중...`;

  try {
    const loadingTask = pdfjsLib.getDocument(bookConfig.file);
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    desktopSheetCount = Math.ceil(totalPages / 2);

    renderBook();
    await buildToc();
    buildPageStages();
    updateSearchResultsPanel();
    applyZoom();
    updateUi();

    if (loadingOverlay) loadingOverlay.style.display = "none";

    // Background text extraction
    extractAllTextInBackground();
  } catch (err) {
    book.innerHTML = `<div class="pdf-loading"><p>PDF 로드 실패: ${escapeHtml(err.message)}</p></div>`;
    if (loadingOverlay) loadingOverlay.style.display = "none";
  }
}

/* ── Event listeners ── */
prevButton.addEventListener("click", prevSheet);
nextButton.addEventListener("click", nextSheet);
prevPage.addEventListener("click", prevSheet);
nextPage.addEventListener("click", nextSheet);

pageRange.addEventListener("input", (event) => {
  goToSheet(Number(event.target.value));
});

tocToggle.addEventListener("click", () => {
  tocPanel.classList.toggle("is-collapsed");
  tocToggle.textContent = tocPanel.classList.contains("is-collapsed")
    ? "+"
    : "×";
});

fullscreenToggle.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
    return;
  }
  await document.exitFullscreen();
});

searchPanelToggle.addEventListener("click", () => togglePanel(searchPanel));
extractPanelToggle.addEventListener("click", () => togglePanel(extractPanel));

searchButton.addEventListener("click", performSearch);
clearSearchButton.addEventListener("click", clearSearch);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") performSearch();
});

zoomInButton.addEventListener("click", () => {
  state.zoom = clamp(state.zoom + 0.1, 0.8, 1.8);
  applyZoom();
});

zoomOutButton.addEventListener("click", () => {
  state.zoom = clamp(state.zoom - 0.1, 0.8, 1.8);
  applyZoom();
});

zoomResetButton.addEventListener("click", () => {
  state.zoom = 1;
  applyZoom();
});

highlightToggle.addEventListener("click", () => {
  state.highlightMode = !state.highlightMode;
  updateUi();
});

clearHighlightsButton.addEventListener("click", clearCurrentHighlights);

extractCurrentButton.addEventListener("click", () => {
  setExtractOutput("현재 페이지", getVisiblePageIndices());
});

extractAllButton.addEventListener("click", () => {
  setExtractOutput(
    "전체 페이지",
    Array.from({ length: totalPages }, (_, i) => i),
  );
});

copyExtractButton.addEventListener("click", async () => {
  try {
    await copyExtractText();
  } catch {
    extractModeBadge.textContent = "복사 실패";
  }
});

downloadExtractButton.addEventListener("click", downloadExtractText);

mobileMediaQuery.addEventListener("change", () => {
  if (!pdfDoc) return;
  const pageIndex = getVisiblePageIndices()[0] ?? 0;
  currentSheet = isMobileView()
    ? pageIndex
    : pageIndex <= 0
      ? 0
      : Math.ceil(pageIndex / 2);
  renderBook();
  updateUi();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") nextSheet();
  if (event.key === "ArrowLeft") prevSheet();
});

/* ── Start ── */
init();
