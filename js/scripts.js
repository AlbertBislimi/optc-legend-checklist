(function () {
  'use strict';

  var STORAGE_KEY = 'optc-legend-progress-v2';
  var LEGACY_STORAGE_KEYS = ['evohidden'];
  var LEGEND_POOLS = {
    'super-sugo': { label: 'Super Sugo', flag: 'superlrr' },
    anniversary: { label: 'Anniversary', flag: 'annilrr' },
    kizuna: { label: 'Kizuna', flag: 'kclrr' },
    'treasure-map': { label: 'Treasure Map', flag: 'tmlrr' },
    'pirate-festival': { label: 'Pirate Festival', flag: 'pflrr' }
  };
  var state = {
    legends: [],
    progress: {},
    filter: 'all',
    legendPool: 'all',
    search: '',
    sort: 'newest',
    showBaseForms: true
  };

  var elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function clampLlb(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(5, Math.round(parsed)));
  }

  function defaultProgress() {
    return { owned: false, rainbow: false, llb: 0 };
  }

  function normaliseProgressEntry(entry) {
    var next = defaultProgress();
    if (!entry || typeof entry !== 'object') return next;
    next.owned = Boolean(entry.owned || entry.rainbow || Number(entry.llb) > 0);
    next.rainbow = Boolean(entry.rainbow);
    next.llb = clampLlb(entry.llb);
    return next;
  }

  function readSavedProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

      return Object.keys(parsed).reduce(function (all, id) {
        all[id] = normaliseProgressEntry(parsed[id]);
        return all;
      }, {});
    } catch (error) {
      return null;
    }
  }

  function readSharedProgress() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return null;

    var params = new URLSearchParams(hash);
    var encoded = params.get('progress');
    if (!encoded) return null;

    try {
      var decoded = window.LZString && window.LZString.decompressFromEncodedURIComponent
        ? window.LZString.decompressFromEncodedURIComponent(encoded)
        : decodeURIComponent(encoded);
      return decoded ? parseImportedProgress(decoded) : null;
    } catch (error) {
      return null;
    }
  }

  function migrateLegacyProgress() {
    var migrated = {};
    var found = false;

    Object.keys(localStorage).forEach(function (key) {
      if (LEGACY_STORAGE_KEYS.indexOf(key) !== -1 || !/^\d+$/.test(key)) return;

      var value = localStorage.getItem(key);
      if (value === 'hidden') return;

      var entry = defaultProgress();
      if (value === 'rainbow' || value === 'srainbow') {
        entry.owned = true;
        entry.rainbow = true;
      } else if (value === 'null' || value === null || value === '') {
        entry.owned = true;
      } else {
        return;
      }

      migrated[key] = entry;
      found = true;
    });

    return found ? migrated : {};
  }

  function loadProgress() {
    var sharedProgress = readSharedProgress();
    state.progress = sharedProgress || readSavedProgress() || migrateLegacyProgress();
    if (sharedProgress) saveProgress();
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch (error) {
      setFeedback('Your browser could not save this change.');
    }
  }

  function getProgress(id) {
    if (!state.progress[id]) state.progress[id] = defaultProgress();
    return state.progress[id];
  }

  function compactProgress() {
    Object.keys(state.progress).forEach(function (id) {
      var progress = normaliseProgressEntry(state.progress[id]);
      if (!progress.owned && !progress.rainbow && !progress.llb) {
        delete state.progress[id];
      } else {
        state.progress[id] = progress;
      }
    });
  }

  function legendName(id) {
    var unit = window.units && window.units[id];
    return unit && unit.name ? String(unit.name) : 'Legend #' + id;
  }

  function legendType(id) {
    var unit = window.units && window.units[id];
    return unit && unit.type ? String(unit.type) : 'LEG';
  }

  function getLegendPools(id) {
    var flags = window.flags && window.flags[id] ? window.flags[id] : {};
    return Object.keys(LEGEND_POOLS).reduce(function (pools, pool) {
      if (flags[LEGEND_POOLS[pool].flag]) pools[pool] = true;
      return pools;
    }, {});
  }

  function getBaseIds(ids) {
    var pairs = window.getLegendBasePairs ? window.getLegendBasePairs(ids) : [];
    return (pairs || []).reduce(function (all, pair) {
      all[String(pair.base)] = true;
      return all;
    }, {});
  }

  function loadLegends() {
    var ids = window.getLegendIds ? window.getLegendIds() : [];
    var pairs = window.getLegendBasePairs ? window.getLegendBasePairs(ids) : [];
    var orderedIds = window.orderLegendIds ? window.orderLegendIds(ids, pairs) : ids;
    var baseIds = getBaseIds(ids);

    state.legends = orderedIds.map(function (id) {
      return {
        id: Number(id),
        name: legendName(id),
        type: legendType(id),
        pools: getLegendPools(id),
        isBaseForm: Boolean(baseIds[String(id)]),
        image: window.getLegendIconUrl ? window.getLegendIconUrl(id) : 'images/icons/' + id + '.png'
      };
    });
  }

  function listVisibleLegends() {
    var search = state.search.trim().toLocaleLowerCase();
    var legends = state.legends.filter(function (legend) {
      var progress = getProgress(legend.id);
      if (!state.showBaseForms && legend.isBaseForm) return false;
      if (state.filter === 'owned' && !progress.owned) return false;
      if (state.filter === 'rainbow' && !progress.rainbow) return false;
      if (state.filter === 'llb' && !progress.llb) return false;
      if (state.legendPool !== 'all' && !legend.pools[state.legendPool]) return false;
      if (!search) return true;
      return legend.name.toLocaleLowerCase().indexOf(search) !== -1 || String(legend.id).indexOf(search) !== -1;
    });

    return legends.sort(function (a, b) {
      if (state.sort === 'oldest') return a.id - b.id;
      if (state.sort === 'name') return a.name.localeCompare(b.name);
      return b.id - a.id;
    });
  }

  function getCollectionTotals() {
    var total = state.legends.length;
    var owned = 0;
    var rainbow = 0;
    var maxLlb = 0;

    state.legends.forEach(function (legend) {
      var progress = getProgress(legend.id);
      if (progress.owned) owned += 1;
      if (progress.rainbow) rainbow += 1;
      if (progress.llb === 5) maxLlb += 1;
    });

    return { total: total, owned: owned, rainbow: rainbow, maxLlb: maxLlb };
  }

  function updateCounters() {
    var totals = getCollectionTotals();
    var total = totals.total;
    var owned = totals.owned;
    var rainbow = totals.rainbow;
    var maxLlb = totals.maxLlb;

    setText(elements.ownedCount, owned, total);
    setText(elements.rainbowCount, rainbow, total);
    setText(elements.llbCount, maxLlb, total);
    elements.ownedMeter.style.width = percentage(owned, total) + '%';
    elements.rainbowMeter.style.width = percentage(rainbow, total) + '%';
    elements.llbMeter.style.width = percentage(maxLlb, total) + '%';
  }

  function setText(element, value, total) {
    element.innerHTML = value + ' <small>/ ' + total + '</small>';
  }

  function percentage(value, total) {
    return total ? Math.round((value / total) * 100) : 0;
  }

  function updateCard(card, legend) {
    var progress = getProgress(legend.id);
    var portrait = card.querySelector('[data-action="owned"]');
    var image = card.querySelector('.legend-art');
    var ownedBadge = card.querySelector('.owned-badge');
    var llbBadge = card.querySelector('.llb-badge');
    var type = card.querySelector('.legend-type');
    var id = card.querySelector('.legend-id');
    var name = card.querySelector('.legend-name');
    var rainbow = card.querySelector('[data-action="rainbow"]');
    var llb = card.querySelector('[data-action="llb"]');

    card.dataset.id = legend.id;
    card.classList.toggle('is-owned', progress.owned);
    card.classList.toggle('is-rainbow', progress.rainbow);
    card.classList.toggle('has-llb', progress.llb > 0);
    portrait.setAttribute('aria-pressed', String(progress.owned));
    portrait.setAttribute('aria-label', (progress.owned ? 'Remove ' : 'Add ') + legend.name + (progress.owned ? ' from owned legends' : ' to owned legends'));
    image.src = legend.image;
    image.alt = legend.name;
    image.onerror = function () { this.src = 'images/icons/' + legend.id + '.png'; };
    ownedBadge.textContent = progress.owned ? 'Owned' : 'Not owned';
    llbBadge.hidden = progress.llb === 0;
    llbBadge.textContent = 'LLB ' + progress.llb + '/5';
    type.textContent = legend.type;
    id.textContent = '#' + legend.id;
    name.textContent = legend.name;
    rainbow.setAttribute('aria-pressed', String(progress.rainbow));
    rainbow.setAttribute('aria-label', (progress.rainbow ? 'Remove rainbow status from ' : 'Mark ') + legend.name + (progress.rainbow ? '' : ' as rainbowed'));
    llb.value = String(progress.llb);
  }

  function buildCard(legend) {
    var card = elements.template.content.firstElementChild.cloneNode(true);
    updateCard(card, legend);
    return card;
  }

  function renderGrid() {
    var visible = listVisibleLegends();
    var fragment = document.createDocumentFragment();
    elements.grid.innerHTML = '';

    if (!visible.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<strong>No legends found.</strong>Try a different search or filter.';
      elements.grid.appendChild(empty);
    } else {
      visible.forEach(function (legend) { fragment.appendChild(buildCard(legend)); });
      elements.grid.appendChild(fragment);
    }

    elements.visibleCount.textContent = visible.length + ' of ' + state.legends.length + ' legends shown';
    updateCounters();
  }

  function updateLegendPoolOptions() {
    Array.prototype.forEach.call(elements.legendPool.options, function (option) {
      var pool = option.value;
      var count = pool === 'all'
        ? state.legends.length
        : state.legends.filter(function (legend) { return legend.pools[pool]; }).length;
      var label = pool === 'all' ? 'All legends' : LEGEND_POOLS[pool].label;
      option.textContent = label + ' (' + count + ')';
      option.disabled = pool !== 'all' && count === 0;
    });
  }

  function persistAndRender() {
    compactProgress();
    saveProgress();
    renderGrid();
  }

  function onGridClick(event) {
    var action = event.target.closest('[data-action]');
    if (!action || action.tagName === 'SELECT') return;
    var card = action.closest('.legend-card');
    if (!card) return;
    var id = card.dataset.id;
    var progress = getProgress(id);

    if (action.dataset.action === 'owned') {
      progress.owned = !progress.owned;
      if (!progress.owned) {
        progress.rainbow = false;
        progress.llb = 0;
      }
    }

    if (action.dataset.action === 'rainbow') {
      progress.rainbow = !progress.rainbow;
      if (progress.rainbow) progress.owned = true;
    }

    persistAndRender();
  }

  function onGridChange(event) {
    var select = event.target.closest('select[data-action="llb"]');
    if (!select) return;
    var card = select.closest('.legend-card');
    if (!card) return;
    var progress = getProgress(card.dataset.id);
    progress.llb = clampLlb(select.value);
    if (progress.llb > 0) progress.owned = true;
    persistAndRender();
  }

  function chooseFilter(event) {
    var button = event.target.closest('[data-filter]');
    if (!button) return;
    state.filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(function (item) {
      item.classList.toggle('is-active', item === button);
    });
    renderGrid();
  }

  function resetProgress() {
    if (!window.confirm('Reset all ownership, Rainbow, and LLB progress saved in this browser?')) return;
    state.progress = {};
    saveProgress();
    renderGrid();
  }

  function serialiseProgress() {
    compactProgress();
    return JSON.stringify({ version: 2, progress: state.progress });
  }

  function setFeedback(message) {
    if (elements.feedback) elements.feedback.textContent = message;
  }

  function openBackup() {
    openDialog('export');
  }

  function openShare() {
    openDialog('share');
  }

  function openDialog(view) {
    elements.exportData.value = serialiseProgress();
    elements.shareLink.value = createShareUrl();
    setTransferView(view);
    elements.backupDialog.showModal();
  }

  function setTransferView(view) {
    elements.exportView.hidden = view !== 'export';
    elements.importView.hidden = view !== 'import';
    elements.shareView.hidden = view !== 'share';
    if (view === 'share') elements.shareLink.value = createShareUrl();
    document.querySelectorAll('[data-transfer-view]').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.transferView === view);
    });
    setFeedback('');
  }

  function createShareUrl() {
    var payload = serialiseProgress();
    var encoded = window.LZString && window.LZString.compressToEncodedURIComponent
      ? window.LZString.compressToEncodedURIComponent(payload)
      : encodeURIComponent(payload);
    return window.location.origin + window.location.pathname + '#progress=' + encoded;
  }

  function copyText(text, input, successMessage) {
    function success() { setFeedback(successMessage); }
    function fallback() {
      input.focus();
      input.select();
      try {
        document.execCommand('copy');
        success();
      } catch (error) {
        setFeedback('Select and copy the backup text manually.');
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(success).catch(fallback);
    } else {
      fallback();
    }
  }

  function copyBackup() {
    copyText(elements.exportData.value, elements.exportData, 'Backup copied.');
  }

  function copyShareLink() {
    copyText(elements.shareLink.value, elements.shareLink, 'Share link copied.');
  }

  function nativeShareLink() {
    var url = elements.shareLink.value;
    if (!navigator.share) {
      copyShareLink();
      return;
    }

    navigator.share({
      title: 'My OPTC Legend Locker',
      text: 'Check out my OPTC legend collection.',
      url: url
    }).then(function () {
      setFeedback('Share sheet opened.');
    }).catch(function (error) {
      if (error && error.name !== 'AbortError') copyShareLink();
    });
  }

  function roundedRect(context, x, y, width, height, radius) {
    var safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.lineTo(x + width - safeRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    context.lineTo(x + width, y + height - safeRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    context.lineTo(x + safeRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    context.lineTo(x, y + safeRadius);
    context.quadraticCurveTo(x, y, x + safeRadius, y);
    context.closePath();
  }

  function loadExportImage(legend) {
    return new Promise(function (resolve) {
      function loadFallback() {
        var fallback = new Image();
        fallback.onload = function () { resolve(fallback); };
        fallback.onerror = function () { resolve(null); };
        fallback.src = 'images/icons/' + legend.id + '.png';
      }

      var image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = function () { resolve(image); };
      image.onerror = loadFallback;
      image.src = legend.image;
    });
  }

  function drawExportStat(context, label, value, x, y) {
    context.fillStyle = '#aebadd';
    context.font = '600 22px system-ui, sans-serif';
    context.fillText(label, x, y);
    context.fillStyle = '#f4f6ff';
    context.font = '800 34px system-ui, sans-serif';
    context.fillText(value, x, y + 39);
  }

  function rainbowStroke(context, x, y, size) {
    var gradient = context.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, '#ff7399');
    gradient.addColorStop(0.2, '#ffa66c');
    gradient.addColorStop(0.38, '#ffe46b');
    gradient.addColorStop(0.55, '#62edc8');
    gradient.addColorStop(0.73, '#69a9ff');
    gradient.addColorStop(0.89, '#c489ff');
    gradient.addColorStop(1, '#ff7399');
    context.strokeStyle = gradient;
    context.lineWidth = 4;
    context.strokeRect(x + 2, y + 2, size - 4, size - 4);
  }

  function renderCollectionCanvas() {
    var totals = getCollectionTotals();
    var legends = state.legends.slice().sort(function (a, b) { return b.id - a.id; });
    var columns = 20;
    var width = 1600;
    var padding = 38;
    var gap = 6;
    var headerHeight = 158;
    var tileSize = Math.floor((width - (padding * 2) - (gap * (columns - 1))) / columns);
    var rows = Math.ceil(legends.length / columns);
    var height = headerHeight + padding + (rows * tileSize) + ((rows - 1) * gap) + 50;
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');

    canvas.width = width;
    canvas.height = height;

    var background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#111d47');
    background.addColorStop(0.6, '#0a102b');
    background.addColorStop(1, '#05091a');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    var glow = context.createRadialGradient(width - 170, 40, 5, width - 170, 40, 360);
    glow.addColorStop(0, 'rgba(155, 113, 255, 0.28)');
    glow.addColorStop(1, 'rgba(155, 113, 255, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, headerHeight + 70);

    roundedRect(context, padding, 34, 78, 34, 8);
    context.fillStyle = '#7656ce';
    context.fill();
    context.fillStyle = '#f2efff';
    context.font = '800 17px system-ui, sans-serif';
    context.fillText('OPTC', padding + 10, 57);
    context.fillStyle = '#f0f3ff';
    context.font = '800 33px system-ui, sans-serif';
    context.fillText('legend locker', padding + 95, 60);
    context.fillStyle = '#b6c2e1';
    context.font = '500 19px system-ui, sans-serif';
    context.fillText('Legend collection • ' + new Date().toLocaleDateString(), padding, 98);

    drawExportStat(context, 'Owned', totals.owned + ' / ' + totals.total, width - 440, 46);
    drawExportStat(context, 'Rainbow', totals.rainbow + ' / ' + totals.total, width - 285, 46);
    drawExportStat(context, 'LLB 5', totals.maxLlb + ' / ' + totals.total, width - 130, 46);
    context.fillStyle = 'rgba(166, 185, 232, 0.25)';
    context.fillRect(padding, 128, width - (padding * 2), 1);

    return Promise.all(legends.map(loadExportImage)).then(function (images) {
      legends.forEach(function (legend, index) {
        var progress = getProgress(legend.id);
        var image = images[index];
        var column = index % columns;
        var row = Math.floor(index / columns);
        var x = padding + (column * (tileSize + gap));
        var y = headerHeight + (row * (tileSize + gap));

        roundedRect(context, x, y, tileSize, tileSize, 5);
        context.fillStyle = '#111a39';
        context.fill();
        if (image) {
          context.save();
          if (!progress.owned) context.globalAlpha = 0.33;
          context.drawImage(image, x + 3, y + 3, tileSize - 6, tileSize - 6);
          context.restore();
          if (!progress.owned) {
            context.fillStyle = 'rgba(5, 9, 25, 0.42)';
            context.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);
          }
        } else {
          context.fillStyle = '#7280aa';
          context.font = '700 16px system-ui, sans-serif';
          context.fillText('#' + legend.id, x + 6, y + (tileSize / 2));
        }

        if (progress.rainbow) {
          rainbowStroke(context, x, y, tileSize);
        } else if (progress.owned) {
          context.strokeStyle = 'rgba(112, 229, 170, 0.85)';
          context.lineWidth = 2;
          context.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
        }

        if (progress.llb > 0) {
          var badgeSize = Math.max(20, Math.round(tileSize * 0.35));
          roundedRect(context, x + tileSize - badgeSize - 3, y + tileSize - badgeSize - 3, badgeSize, badgeSize, 4);
          context.fillStyle = '#7a57d4';
          context.fill();
          context.fillStyle = '#fff';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.font = '800 ' + Math.max(12, Math.round(badgeSize * 0.55)) + 'px system-ui, sans-serif';
          context.fillText(String(progress.llb), x + tileSize - (badgeSize / 2) - 3, y + tileSize - (badgeSize / 2) - 3);
          context.textAlign = 'start';
          context.textBaseline = 'alphabetic';
        }
      });

      context.fillStyle = '#9faed0';
      context.font = '500 16px system-ui, sans-serif';
      context.fillText('Brightness = owned  •  Rainbow border = rainbowed  •  Purple badge = LLB level', padding, height - 20);
      return canvas;
    });
  }

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Unable to create image'));
        }
      }, 'image/png');
    });
  }

  function generateShareImage() {
    elements.downloadImage.disabled = true;
    elements.downloadImage.textContent = 'Building image…';
    setFeedback('Building your compact collection image…');
    compactProgress();

    renderCollectionCanvas()
      .then(canvasToBlob)
      .then(function (blob) {
        downloadBlob(blob, 'optc-legend-locker.png');
        setFeedback('Compact collection image saved.');
      })
      .catch(function () {
        setFeedback('The image could not be created. Try again in a moment.');
      })
      .then(function () {
        elements.downloadImage.disabled = false;
        elements.downloadImage.textContent = 'Save image';
      });
  }

  function parseImportedProgress(raw) {
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      if (window.LZString && window.LZString.decompressFromEncodedURIComponent) {
        parsed = JSON.parse(window.LZString.decompressFromEncodedURIComponent(raw));
      } else {
        throw error;
      }
    }

    var source = parsed && parsed.version === 2 && parsed.progress ? parsed.progress : parsed;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid backup');

    return Object.keys(source).reduce(function (all, id) {
      if (!/^\d+$/.test(id)) return all;

      var entry = source[id];
      if (entry === 'hidden') return all;
      if (entry === 'rainbow' || entry === 'srainbow') {
        all[id] = { owned: true, rainbow: true, llb: 0 };
      } else if (entry === 'null' || entry === null || entry === '') {
        all[id] = { owned: true, rainbow: false, llb: 0 };
      } else {
        all[id] = normaliseProgressEntry(entry);
      }
      return all;
    }, {});
  }

  function importBackup() {
    var raw = elements.importData.value.trim();
    if (!raw) {
      setFeedback('Paste a backup before importing.');
      return;
    }

    try {
      state.progress = parseImportedProgress(raw);
      saveProgress();
      renderGrid();
      elements.importData.value = '';
      setFeedback('Progress imported successfully.');
    } catch (error) {
      setFeedback('That backup could not be read. Please check the text and try again.');
    }
  }

  function bindEvents() {
    elements.grid.addEventListener('click', onGridClick);
    elements.grid.addEventListener('change', onGridChange);
    elements.search.addEventListener('input', function (event) {
      state.search = event.target.value;
      renderGrid();
    });
    elements.sort.addEventListener('change', function (event) {
      state.sort = event.target.value;
      renderGrid();
    });
    elements.legendPool.addEventListener('change', function (event) {
      state.legendPool = event.target.value;
      renderGrid();
    });
    elements.baseToggle.addEventListener('change', function (event) {
      state.showBaseForms = event.target.checked;
      renderGrid();
    });
    document.querySelector('.filter-group').addEventListener('click', chooseFilter);
    elements.resetButton.addEventListener('click', resetProgress);
    elements.backupButton.addEventListener('click', openBackup);
    elements.shareButton.addEventListener('click', openShare);
    elements.copyExport.addEventListener('click', copyBackup);
    elements.copyShareLink.addEventListener('click', copyShareLink);
    elements.nativeShareLink.addEventListener('click', nativeShareLink);
    elements.downloadImage.addEventListener('click', generateShareImage);
    elements.applyImport.addEventListener('click', importBackup);
    document.querySelector('.dialog-tabs').addEventListener('click', function (event) {
      var tab = event.target.closest('[data-transfer-view]');
      if (tab) setTransferView(tab.dataset.transferView);
    });
  }

  function cacheElements() {
    elements.grid = byId('legend-grid');
    elements.template = byId('legend-card-template');
    elements.search = byId('legend-search');
    elements.legendPool = byId('legend-pool');
    elements.sort = byId('sort-order');
    elements.baseToggle = byId('base-toggle');
    elements.visibleCount = byId('visible-count');
    elements.ownedCount = byId('owned-count');
    elements.rainbowCount = byId('rainbow-count');
    elements.llbCount = byId('llb-count');
    elements.ownedMeter = byId('owned-meter');
    elements.rainbowMeter = byId('rainbow-meter');
    elements.llbMeter = byId('llb-meter');
    elements.resetButton = byId('reset-button');
    elements.backupButton = byId('backup-button');
    elements.shareButton = byId('share-button');
    elements.backupDialog = byId('backup-dialog');
    elements.exportView = byId('export-view');
    elements.importView = byId('import-view');
    elements.shareView = byId('share-view');
    elements.exportData = byId('export-data');
    elements.importData = byId('import-data');
    elements.shareLink = byId('share-link');
    elements.copyExport = byId('copy-export');
    elements.copyShareLink = byId('copy-share-link');
    elements.nativeShareLink = byId('native-share-link');
    elements.downloadImage = byId('download-image');
    elements.applyImport = byId('apply-import');
    elements.feedback = byId('transfer-feedback');
  }

  function start() {
    cacheElements();
    loadProgress();
    loadLegends();
    updateLegendPoolOptions();
    bindEvents();
    renderGrid();
  }

  document.addEventListener('DOMContentLoaded', start);
}());
