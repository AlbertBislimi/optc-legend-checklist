(function () {
  'use strict';

  var STORAGE_KEY = 'optc-legend-progress-v2';
  var GEM_PLAN_STORAGE_KEY = 'optc-gem-savings-plan-v1';
  var LEGACY_STORAGE_KEYS = ['evohidden'];
  var GEM_TARGETS = {
    'new-year': { month: 0, day: 1 },
    anniversary: { month: 4, day: 12 }
  };
  var GEM_EVENT_TYPES = {
    guaranteed: { label: 'Guaranteed', countable: true },
    claim: { label: 'Claim', countable: true },
    earnable: { label: 'Earn', countable: true },
    chance: { label: 'Chance', countable: false }
  };
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
    sharedPreview: false,
    gemPlan: null,
    gemEvents: [],
    gemEventsMeta: null,
    gemEventsLoading: true,
    gemEventsError: false,
    drawerOpen: false,
    view: 'gallery',
    galleryEditId: null,
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
    state.sharedPreview = Boolean(sharedProgress);
    state.progress = sharedProgress || readSavedProgress() || migrateLegacyProgress();
  }

  function syncSharedPreviewFromUrl() {
    var sharedProgress = readSharedProgress();
    if (sharedProgress) {
      state.sharedPreview = true;
      state.progress = sharedProgress;
    } else if (state.sharedPreview) {
      state.sharedPreview = false;
      state.progress = readSavedProgress() || migrateLegacyProgress();
    } else {
      return;
    }
    renderGrid();
  }

  function saveProgress() {
    if (state.sharedPreview) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch (error) {
      setFeedback('Your browser could not save this change.');
    }
  }

  function toDateInputValue(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function atLocalMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function parseDateInput(value) {
    var parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2] ? date : null;
  }

  function addDays(date, amount) {
    var copy = atLocalMidnight(date);
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  function gemNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
  }

  function defaultGemEventState() {
    return { planned: false, claimed: false };
  }

  function normaliseGemEventState(entry) {
    var next = defaultGemEventState();
    if (!entry || typeof entry !== 'object') return next;
    next.claimed = Boolean(entry.claimed);
    next.planned = Boolean(entry.planned) && !next.claimed;
    return next;
  }

  function normaliseGemEventStates(entries) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return {};
    return Object.keys(entries).reduce(function (all, id) {
      if (!/^[a-z0-9_-]+$/i.test(id)) return all;
      all[id] = normaliseGemEventState(entries[id]);
      return all;
    }, {});
  }

  function defaultGemPlan() {
    var today = atLocalMidnight(new Date());
    return {
      currentGems: 0,
      dailyGems: 3,
      startDate: toDateInputValue(today),
      customName: 'Custom banner',
      customDate: toDateInputValue(addDays(today, 90)),
      eventStates: {}
    };
  }

  function normaliseGemPlan(entry) {
    var plan = defaultGemPlan();
    if (!entry || typeof entry !== 'object') return plan;
    plan.currentGems = gemNumber(entry.currentGems, plan.currentGems);
    plan.dailyGems = gemNumber(entry.dailyGems, plan.dailyGems);
    if (parseDateInput(entry.startDate)) plan.startDate = entry.startDate;
    if (parseDateInput(entry.customDate)) plan.customDate = entry.customDate;
    if (typeof entry.customName === 'string' && entry.customName.trim()) plan.customName = entry.customName.trim().slice(0, 40);
    plan.eventStates = normaliseGemEventStates(entry.eventStates);
    return plan;
  }

  function readGemPlan() {
    try {
      var raw = localStorage.getItem(GEM_PLAN_STORAGE_KEY);
      return raw ? normaliseGemPlan(JSON.parse(raw)) : null;
    } catch (error) {
      return null;
    }
  }

  function saveGemPlan() {
    try {
      localStorage.setItem(GEM_PLAN_STORAGE_KEY, JSON.stringify(state.gemPlan));
    } catch (error) {
    }
  }

  function loadGemPlan() {
    state.gemPlan = readGemPlan() || defaultGemPlan();
    elements.gemCurrent.value = String(state.gemPlan.currentGems);
    elements.gemDaily.value = String(state.gemPlan.dailyGems);
    elements.gemStartDate.value = state.gemPlan.startDate;
    elements.gemCustomName.value = state.gemPlan.customName;
    elements.gemCustomDate.value = state.gemPlan.customDate;
    updateGemPlan();
  }

  function daysBetween(start, end) {
    var startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    var endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((endUtc - startUtc) / 86400000);
  }

  function nextAnnualTarget(month, day, referenceDate) {
    var target = new Date(referenceDate.getFullYear(), month, day);
    if (target.getTime() < referenceDate.getTime()) target = new Date(referenceDate.getFullYear() + 1, month, day);
    return target;
  }

  function formatGemDate(date) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function eventTimestamp(value, isEnd) {
    if (typeof value !== 'string' || !value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      var date = parseDateInput(value);
      if (!date) return null;
      return isEnd
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1
        : date.getTime();
    }
    var timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function safeEventUrl(value) {
    try {
      var url = new URL(value, window.location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function normaliseGemEvent(entry) {
    if (!entry || typeof entry !== 'object') return null;
    var id = String(entry.id || '').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    var title = typeof entry.title === 'string' ? entry.title.trim().slice(0, 110) : '';
    if (!id || !title) return null;
    var kind = Object.prototype.hasOwnProperty.call(GEM_EVENT_TYPES, entry.kind) ? entry.kind : 'earnable';
    var sourceUrl = safeEventUrl(entry.sourceUrl);
    var startTime = eventTimestamp(entry.startsAt, false);
    var endTime = eventTimestamp(entry.endsAt, true);

    return {
      id: id,
      title: title,
      kind: kind,
      gems: gemNumber(entry.gems, 0),
      startsAt: startTime,
      endsAt: endTime,
      startsLabel: typeof entry.startsLabel === 'string' ? entry.startsLabel.trim().slice(0, 50) : '',
      endsLabel: typeof entry.endsLabel === 'string' ? entry.endsLabel.trim().slice(0, 50) : '',
      requirements: typeof entry.requirements === 'string' ? entry.requirements.trim().slice(0, 260) : '',
      sourceUrl: sourceUrl,
      sourceLabel: typeof entry.sourceLabel === 'string' ? entry.sourceLabel.trim().slice(0, 60) : 'Official source'
    };
  }

  function normaliseGemEventsPayload(payload) {
    var source = payload && typeof payload === 'object' ? payload : {};
    var seen = {};
    var events = Array.isArray(source.events) ? source.events.reduce(function (all, entry) {
      var event = normaliseGemEvent(entry);
      if (!event || seen[event.id]) return all;
      seen[event.id] = true;
      all.push(event);
      return all;
    }, []) : [];

    return {
      events: events,
      reviewedAt: eventTimestamp(source.reviewedAt, false),
      officialFeedUrl: safeEventUrl(source.officialFeedUrl)
    };
  }

  function getGemEventState(id) {
    var eventStates = state.gemPlan && state.gemPlan.eventStates ? state.gemPlan.eventStates : {};
    return normaliseGemEventState(eventStates[id]);
  }

  function getGemEventType(event) {
    return GEM_EVENT_TYPES[event.kind] || GEM_EVENT_TYPES.earnable;
  }

  function isGemEventExpired(event, now) {
    return Boolean(event.endsAt && event.endsAt < (now || Date.now()));
  }

  function isGemEventSelectable(event) {
    return getGemEventType(event).countable && !isGemEventExpired(event);
  }

  function eventIsAvailableByTarget(event, targetDate) {
    if (!targetDate || !isGemEventSelectable(event)) return false;
    var targetEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1).getTime() - 1;
    return !event.startsAt || event.startsAt <= targetEnd;
  }

  function selectedGemEventGems(targetDate) {
    return state.gemEvents.reduce(function (total, event) {
      var eventState = getGemEventState(event.id);
      return eventState.planned && !eventState.claimed && eventIsAvailableByTarget(event, targetDate)
        ? total + event.gems
        : total;
    }, 0);
  }

  function updateGemTarget(key, targetDate, startDate) {
    var card = document.querySelector('[data-gem-target="' + key + '"]');
    var total = card.querySelector('[data-gem-target-total]');
    var date = card.querySelector('[data-gem-target-date]');
    var days = card.querySelector('[data-gem-target-days]');
    var plan = state.gemPlan;

    if (!targetDate) {
      card.classList.add('is-unavailable');
      total.textContent = '—';
      if (date) date.textContent = 'Choose an upcoming date';
      days.textContent = 'No projection yet';
      return;
    }

    var savingDays = Math.max(0, daysBetween(startDate, targetDate));
    var eventGems = selectedGemEventGems(targetDate);
    var projected = plan.currentGems + plan.dailyGems * savingDays + eventGems;
    card.classList.remove('is-unavailable');
    total.textContent = projected.toLocaleString();
    if (date) date.textContent = formatGemDate(targetDate);
    days.textContent = savingDays + (savingDays === 1 ? ' day of saving' : ' days of saving') + (eventGems ? ' · +' + eventGems + ' event gems' : '');
  }

  function updateGemPlan() {
    var plan = state.gemPlan;
    var startDate = parseDateInput(plan.startDate) || atLocalMidnight(new Date());
    var today = atLocalMidnight(new Date());
    var targetReference = startDate.getTime() > today.getTime() ? startDate : today;
    var customDate = parseDateInput(plan.customDate);
    var customTarget = customDate && customDate.getTime() >= targetReference.getTime() ? customDate : null;

    updateGemTarget('new-year', nextAnnualTarget(GEM_TARGETS['new-year'].month, GEM_TARGETS['new-year'].day, targetReference), startDate);
    updateGemTarget('anniversary', nextAnnualTarget(GEM_TARGETS.anniversary.month, GEM_TARGETS.anniversary.day, targetReference), startDate);
    updateGemTarget('custom', customTarget, startDate);
    var selectedNow = selectedGemEventGems(addDays(today, 3650));
    var eventText = selectedNow ? ' +' + selectedNow.toLocaleString() + ' selected event gems included.' : ' No event rewards selected.';
    elements.gemPlanSummary.textContent = 'Starting with ' + plan.currentGems.toLocaleString() + ' gems and saving ' + plan.dailyGems.toLocaleString() + ' per day from ' + formatGemDate(startDate) + '.' + eventText;
  }

  function syncGemPlan() {
    state.gemPlan.currentGems = gemNumber(elements.gemCurrent.value, 0);
    state.gemPlan.dailyGems = gemNumber(elements.gemDaily.value, 0);
    if (parseDateInput(elements.gemStartDate.value)) state.gemPlan.startDate = elements.gemStartDate.value;
    if (parseDateInput(elements.gemCustomDate.value)) state.gemPlan.customDate = elements.gemCustomDate.value;
    state.gemPlan.customName = elements.gemCustomName.value.trim().slice(0, 40) || 'Custom banner';
    saveGemPlan();
    updateGemPlan();
  }

  function eventTimingText(event) {
    var now = Date.now();
    if (isGemEventExpired(event, now)) return 'Ended ' + (event.endsLabel || formatGemDate(new Date(event.endsAt)));
    if (event.startsAt && event.startsAt > now) return 'Starts ' + (event.startsLabel || formatGemDate(new Date(event.startsAt)));
    if (event.endsAt) return (event.kind === 'claim' ? 'Claim by ' : 'Ends ') + (event.endsLabel || formatGemDate(new Date(event.endsAt)));
    return 'No deadline listed';
  }

  function renderGemEvent(event) {
    var eventState = getGemEventState(event.id);
    var type = getGemEventType(event);
    var expired = isGemEventExpired(event);
    var selectable = isGemEventSelectable(event);
    var article = document.createElement('article');
    article.className = 'gem-event gem-event-' + event.kind + (expired ? ' is-expired' : '') + (eventState.planned ? ' is-planned' : '') + (eventState.claimed ? ' is-claimed' : '');

    var main = document.createElement('div');
    main.className = 'gem-event-main';
    var typeLabel = document.createElement('span');
    typeLabel.className = 'gem-event-kind';
    typeLabel.textContent = type.label;
    var title = document.createElement('h4');
    title.textContent = event.title;
    var timing = document.createElement('p');
    timing.className = 'gem-event-timing';
    timing.textContent = eventTimingText(event);
    main.append(typeLabel, title, timing);

    var reward = document.createElement('div');
    reward.className = 'gem-event-reward';
    var gems = document.createElement('strong');
    gems.textContent = '+' + event.gems.toLocaleString();
    var gemLabel = document.createElement('span');
    gemLabel.textContent = 'gems';
    reward.append(gems, gemLabel);
    if (event.sourceUrl) {
      var source = document.createElement('a');
      source.href = event.sourceUrl;
      source.target = '_blank';
      source.rel = 'noreferrer';
      source.title = event.sourceLabel;
      source.textContent = 'Source ↗';
      reward.append(source);
    }

    article.append(main, reward);
    if (event.requirements) {
      var requirements = document.createElement('p');
      requirements.className = 'gem-event-requirements';
      requirements.textContent = event.requirements;
      article.append(requirements);
    }

    if (event.kind === 'chance') {
      var chanceNote = document.createElement('p');
      chanceNote.className = 'gem-event-status';
      chanceNote.textContent = 'Not counted in projections';
      article.append(chanceNote);
      return article;
    }

    var actions = document.createElement('div');
    actions.className = 'gem-event-actions';
    if (selectable && !eventState.claimed) {
      var planLabel = document.createElement('label');
      planLabel.className = 'gem-event-plan-toggle';
      var planInput = document.createElement('input');
      planInput.type = 'checkbox';
      planInput.checked = eventState.planned;
      planInput.dataset.gemEventPlan = event.id;
      var planText = document.createElement('span');
      planText.textContent = 'Add to plan';
      planLabel.append(planInput, planText);
      actions.append(planLabel);
    }

    var claimButton = document.createElement('button');
    claimButton.type = 'button';
    claimButton.className = 'gem-event-claim-button';
    claimButton.dataset.gemEventClaim = event.id;
    claimButton.disabled = !selectable && !eventState.claimed;
    claimButton.textContent = eventState.claimed ? 'Undo claimed' : (expired ? 'Expired' : 'Mark claimed');
    actions.append(claimButton);
    article.append(actions);

    if (eventState.claimed) {
      var claimedNote = document.createElement('p');
      claimedNote.className = 'gem-event-status';
      claimedNote.textContent = 'Claimed — add it to Gems now when you are ready.';
      article.append(claimedNote);
    }
    return article;
  }

  function renderGemEvents() {
    if (!elements.gemEventList) return;
    elements.gemEventList.replaceChildren();

    if (state.gemEventsLoading) {
      elements.gemEventsSummary.textContent = 'Loading reviewed rewards…';
      return;
    }
    if (state.gemEventsError) {
      elements.gemEventsSummary.textContent = 'Official rewards could not load. Your savings projection still works.';
      return;
    }
    if (!state.gemEvents.length) {
      elements.gemEventsSummary.textContent = 'No reviewed event rewards are listed right now.';
      return;
    }

    var visibleEvents = state.gemEvents.filter(function (event) {
      return !isGemEventExpired(event) || getGemEventState(event.id).claimed;
    });
    var selectable = visibleEvents.filter(function (event) {
      return isGemEventSelectable(event) && !getGemEventState(event.id).claimed;
    });
    var chanceCount = visibleEvents.filter(function (event) { return event.kind === 'chance'; }).length;
    var potential = selectable.reduce(function (total, event) { return total + event.gems; }, 0);
    var planned = selectable.reduce(function (total, event) {
      return getGemEventState(event.id).planned ? total + event.gems : total;
    }, 0);
    elements.gemEventsSummary.textContent = selectable.length
      ? selectable.length + ' reward' + (selectable.length === 1 ? '' : 's') + ' available · +' + potential.toLocaleString() + ' gems possible · +' + planned.toLocaleString() + ' in your plan' + (chanceCount ? ' · ' + chanceCount + ' chance prize excluded' : '')
      : (chanceCount ? chanceCount + ' chance prize' + (chanceCount === 1 ? '' : 's') + ' listed · never counted' : 'No claimable or earnable rewards are active right now.');
    if (state.gemEventsMeta && state.gemEventsMeta.officialFeedUrl) elements.gemEventsFeedLink.href = state.gemEventsMeta.officialFeedUrl;

    var fragment = document.createDocumentFragment();
    visibleEvents.forEach(function (event) { fragment.append(renderGemEvent(event)); });
    elements.gemEventList.append(fragment);
  }

  function setGemEventPlan(id, planned) {
    if (!state.gemPlan.eventStates) state.gemPlan.eventStates = {};
    var next = getGemEventState(id);
    next.planned = Boolean(planned) && !next.claimed;
    state.gemPlan.eventStates[id] = next;
    saveGemPlan();
    renderGemEvents();
    updateGemPlan();
  }

  function toggleGemEventClaimed(id) {
    if (!state.gemPlan.eventStates) state.gemPlan.eventStates = {};
    var next = getGemEventState(id);
    next.claimed = !next.claimed;
    if (next.claimed) next.planned = false;
    state.gemPlan.eventStates[id] = next;
    saveGemPlan();
    renderGemEvents();
    updateGemPlan();
  }

  function onGemEventChange(event) {
    var input = event.target.closest('[data-gem-event-plan]');
    if (!input) return;
    setGemEventPlan(input.dataset.gemEventPlan, input.checked);
  }

  function onGemEventClick(event) {
    var button = event.target.closest('[data-gem-event-claim]');
    if (!button || button.disabled) return;
    toggleGemEventClaimed(button.dataset.gemEventClaim);
  }

  function loadGemEvents() {
    state.gemEventsLoading = true;
    state.gemEventsError = false;
    renderGemEvents();

    return fetch('data/gem-events.json', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Unable to load event rewards.');
        return response.json();
      })
      .then(function (payload) {
        var data = normaliseGemEventsPayload(payload);
        state.gemEvents = data.events;
        state.gemEventsMeta = data;
      })
      .catch(function () {
        state.gemEvents = [];
        state.gemEventsMeta = null;
        state.gemEventsError = true;
      })
      .then(function () {
        state.gemEventsLoading = false;
        renderGemEvents();
        updateGemPlan();
      });
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
      var thumbnail = window.getLegendIconUrl ? window.getLegendIconUrl(id) : 'images/icons/' + id + '.png';
      return {
        id: Number(id),
        name: legendName(id),
        type: legendType(id),
        pools: getLegendPools(id),
        isBaseForm: Boolean(baseIds[String(id)]),
        image: window.getLegendFullArtUrl ? window.getLegendFullArtUrl(id) : thumbnail,
        thumbnail: thumbnail
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
    card.classList.toggle('is-max-llb', progress.llb === 5);
    card.classList.toggle('is-shared-preview', state.sharedPreview);
    portrait.setAttribute('aria-pressed', String(progress.owned));
    portrait.setAttribute('aria-label', (progress.owned ? 'Remove ' : 'Add ') + legend.name + (progress.owned ? ' from owned legends' : ' to owned legends'));
    image.src = legend.thumbnail || legend.image;
    image.alt = legend.name;
    image.onerror = function () {
      this.onerror = null;
      this.src = 'images/icons/' + legend.id + '.png';
    };
    ownedBadge.textContent = progress.owned ? 'Owned' : 'Not owned';
    llbBadge.hidden = progress.llb === 0;
    llbBadge.textContent = String(progress.llb);
    llbBadge.setAttribute('aria-label', 'Level Limit Break ' + progress.llb + ' of 5');
    llbBadge.title = 'Level Limit Break ' + progress.llb + ' of 5';
    type.textContent = legend.type;
    id.textContent = '#' + legend.id;
    name.textContent = legend.name;
    rainbow.setAttribute('aria-pressed', String(progress.rainbow));
    rainbow.setAttribute('aria-label', (progress.rainbow ? 'Remove rainbow status from ' : 'Mark ') + legend.name + (progress.rainbow ? '' : ' as rainbowed'));
    llb.value = String(progress.llb);
    portrait.disabled = state.sharedPreview;
    rainbow.disabled = state.sharedPreview;
    llb.disabled = state.sharedPreview;
  }

  function buildCard(legend) {
    var card = elements.template.content.firstElementChild.cloneNode(true);
    updateCard(card, legend);
    return card;
  }

  function buildGalleryTile(legend) {
    var tile = elements.galleryTemplate.content.firstElementChild.cloneNode(true);
    var progress = getProgress(legend.id);
    var image = tile.querySelector('.gallery-art');
    var llbBadge = tile.querySelector('.gallery-llb-badge');
    var status = progress.owned ? 'Owned' : 'Not owned';

    if (progress.rainbow) status += ' · Rainbow';
    if (progress.llb > 0) status += ' · LLB ' + progress.llb + '/5';

    tile.dataset.id = legend.id;
    tile.tabIndex = state.sharedPreview ? -1 : 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', legend.name + '. ' + status + (state.sharedPreview ? '' : '. Click to toggle ownership. Long-press or right-click for quick edit.'));
    tile.classList.toggle('is-owned', progress.owned);
    tile.classList.toggle('is-rainbow', progress.rainbow);
    tile.classList.toggle('has-llb', progress.llb > 0);
    tile.title = '#' + legend.id + ' · ' + legend.name + ' · ' + status;
    image.src = legend.thumbnail || legend.image;
    image.alt = legend.name;
    image.onerror = function () {
      this.onerror = null;
      this.src = 'images/icons/' + legend.id + '.png';
    };
    llbBadge.hidden = progress.llb === 0;
    llbBadge.textContent = String(progress.llb);
    llbBadge.setAttribute('aria-label', 'Level Limit Break ' + progress.llb + ' of 5');
    return tile;
  }

  function renderGrid() {
    updateSharedPreview();
    updateViewMode();
    var visible = listVisibleLegends();
    var fragment = document.createDocumentFragment();
    elements.grid.innerHTML = '';

    if (!visible.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<strong>No legends found.</strong>Try a different search or filter.';
      elements.grid.appendChild(empty);
    } else {
      visible.forEach(function (legend) {
        fragment.appendChild(state.view === 'gallery' ? buildGalleryTile(legend) : buildCard(legend));
      });
      elements.grid.appendChild(fragment);
    }

    elements.visibleCount.textContent = visible.length + ' of ' + state.legends.length + ' legends shown';
    updateCounters();
  }

  function updateViewMode() {
    var gallery = state.view === 'gallery';
    elements.grid.classList.toggle('is-gallery', gallery);
    elements.viewInstruction.innerHTML = gallery
      ? '<strong>Visual gallery:</strong> tap a legend to toggle Owned. Long-press on mobile or right-click on desktop to edit Rainbow and LLB.'
      : '<strong>Quick edit:</strong> click a portrait to toggle ownership, then use the controls below it for Rainbow and LLB.';
    document.querySelectorAll('[data-view]').forEach(function (button) {
      var active = button.dataset.view === state.view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updateSharedPreview() {
    elements.sharedCollectionNotice.hidden = !state.sharedPreview;
    elements.saveNote.classList.toggle('is-shared-preview', state.sharedPreview);
    elements.saveNoteText.textContent = state.sharedPreview ? 'Shared preview · not saved' : 'Saved automatically';
    elements.resetButton.disabled = state.sharedPreview;
    elements.resetButton.title = state.sharedPreview ? 'Save a copy before resetting this collection.' : '';
    if (state.sharedPreview && elements.galleryEditorDialog.open) elements.galleryEditorDialog.close();
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

  function findLegend(id) {
    return state.legends.find(function (legend) { return String(legend.id) === String(id); });
  }

  function toggleLegendOwned(id) {
    var progress = getProgress(id);
    progress.owned = !progress.owned;
    if (!progress.owned) {
      progress.rainbow = false;
      progress.llb = 0;
    }
    persistAndRender();
  }

  function toggleLegendRainbow(id) {
    var progress = getProgress(id);
    progress.rainbow = !progress.rainbow;
    if (progress.rainbow) progress.owned = true;
    persistAndRender();
  }

  function setLegendLlb(id, value) {
    var progress = getProgress(id);
    progress.llb = clampLlb(value);
    if (progress.llb > 0) progress.owned = true;
    persistAndRender();
  }

  function updateGalleryEditor() {
    var legend = findLegend(state.galleryEditId);
    if (!legend) return;
    var progress = getProgress(legend.id);

    elements.galleryEditorArt.src = legend.thumbnail || legend.image;
    elements.galleryEditorArt.alt = legend.name;
    elements.galleryEditorArt.onerror = function () {
      this.onerror = null;
      this.src = 'images/icons/' + legend.id + '.png';
    };
    elements.galleryEditorName.textContent = legend.name;
    elements.galleryEditorId.textContent = '#' + legend.id + ' · ' + legend.type;
    elements.galleryEditorOwned.textContent = progress.owned ? 'Owned' : 'Not owned';
    elements.galleryEditorOwned.classList.toggle('is-active', progress.owned);
    elements.galleryEditorOwned.setAttribute('aria-pressed', String(progress.owned));
    elements.galleryEditorRainbow.classList.toggle('is-active', progress.rainbow);
    elements.galleryEditorRainbow.setAttribute('aria-pressed', String(progress.rainbow));
    Array.prototype.forEach.call(elements.galleryEditorLlbButtons, function (button) {
      var active = Number(button.dataset.galleryLlb) === progress.llb;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function openGalleryEditor(id) {
    if (state.sharedPreview || !findLegend(id)) return;
    state.galleryEditId = String(id);
    updateGalleryEditor();
    if (!elements.galleryEditorDialog.open) elements.galleryEditorDialog.showModal();
  }

  function onGridClick(event) {
    if (state.sharedPreview) return;
    var tile = event.target.closest('.gallery-tile');
    if (tile) {
      if (tile.dataset.holdOpened === 'true') {
        delete tile.dataset.holdOpened;
        return;
      }
      toggleLegendOwned(tile.dataset.id);
      return;
    }
    var action = event.target.closest('[data-action]');
    if (!action || action.tagName === 'SELECT') return;
    var card = action.closest('.legend-card');
    if (!card) return;
    var id = card.dataset.id;
    if (action.dataset.action === 'owned') {
      toggleLegendOwned(id);
      return;
    }

    if (action.dataset.action === 'rainbow') {
      toggleLegendRainbow(id);
      return;
    }
  }

  function onGridChange(event) {
    if (state.sharedPreview) return;
    var select = event.target.closest('select[data-action="llb"]');
    if (!select) return;
    var card = select.closest('.legend-card');
    if (!card) return;
    setLegendLlb(card.dataset.id, select.value);
  }

  function onGalleryPointerDown(event) {
    var tile = event.target.closest('.gallery-tile');
    if (!tile || state.sharedPreview || event.pointerType !== 'touch') return;
    window.clearTimeout(elements.galleryHoldTimer);
    elements.galleryHoldTimer = window.setTimeout(function () {
      elements.galleryHoldTimer = null;
      tile.dataset.holdOpened = 'true';
      openGalleryEditor(tile.dataset.id);
      window.setTimeout(function () { delete tile.dataset.holdOpened; }, 700);
    }, 480);
  }

  function clearGalleryHold() {
    if (!elements.galleryHoldTimer) return;
    window.clearTimeout(elements.galleryHoldTimer);
    elements.galleryHoldTimer = null;
  }

  function onGalleryContextMenu(event) {
    var tile = event.target.closest('.gallery-tile');
    if (!tile) return;
    event.preventDefault();
    openGalleryEditor(tile.dataset.id);
  }

  function onGalleryKeydown(event) {
    if (state.sharedPreview) return;
    var tile = event.target.closest('.gallery-tile');
    if (!tile) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleLegendOwned(tile.dataset.id);
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      openGalleryEditor(tile.dataset.id);
    }
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

  function chooseView(event) {
    var button = event.target.closest('[data-view]');
    if (!button || button.dataset.view === state.view) return;
    state.view = button.dataset.view;
    renderGrid();
  }

  function setDrawerOpen(open) {
    var shouldOpen = Boolean(open);
    var wasOpen = state.drawerOpen;
    state.drawerOpen = shouldOpen;
    elements.utilityDrawer.classList.toggle('is-open', shouldOpen);
    elements.drawerScrim.classList.toggle('is-visible', shouldOpen);
    elements.utilityDrawer.setAttribute('aria-hidden', String(!shouldOpen));
    elements.drawerToggle.setAttribute('aria-expanded', String(shouldOpen));
    document.body.classList.toggle('has-open-drawer', shouldOpen);

    if (shouldOpen) {
      elements.utilityDrawer.removeAttribute('inert');
      window.setTimeout(function () { elements.drawerClose.focus(); }, 0);
    } else {
      elements.utilityDrawer.setAttribute('inert', '');
      if (wasOpen) elements.drawerToggle.focus();
    }
  }

  function resetProgress() {
    if (state.sharedPreview) return;
    if (!window.confirm('Reset all ownership, Rainbow, and LLB progress saved in this browser?')) return;
    state.progress = {};
    saveProgress();
    renderGrid();
    setDrawerOpen(false);
  }

  function serialiseProgress() {
    compactProgress();
    return JSON.stringify({ version: 2, progress: state.progress });
  }

  function setFeedback(message) {
    if (elements.feedback) elements.feedback.textContent = message;
  }

  function openBackup() {
    setDrawerOpen(false);
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

  function clearSharedHash() {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function saveSharedCopy() {
    if (!state.sharedPreview) return;
    state.sharedPreview = false;
    clearSharedHash();
    compactProgress();
    saveProgress();
    renderGrid();
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
      image.src = legend.thumbnail || legend.image;
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

  function drawExportLlbBadge(context, x, y, tileSize, level) {
    var radius = Math.max(11, Math.round(tileSize * 0.19));
    var centerX = x + tileSize - radius - 4;
    var centerY = y + radius + 4;
    var colors = ['#ff649f', '#ffa662', '#fff06c', '#69efcc', '#6ca7ff', '#d183ff'];
    var slice = (Math.PI * 2) / colors.length;

    context.save();
    colors.forEach(function (color, index) {
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.arc(centerX, centerY, radius, (index * slice) - (Math.PI / 2), ((index + 1) * slice) - (Math.PI / 2) + 0.03);
      context.closePath();
      context.fillStyle = color;
      context.fill();
    });

    context.beginPath();
    context.arc(centerX, centerY, radius - 3, 0, Math.PI * 2);
    var inner = context.createRadialGradient(centerX - (radius * 0.25), centerY - (radius * 0.3), 1, centerX, centerY, radius);
    inner.addColorStop(0, '#5d377a');
    inner.addColorStop(1, '#160e2b');
    context.fillStyle = inner;
    context.fill();
    context.strokeStyle = 'rgba(255, 255, 255, 0.46)';
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '900 ' + Math.max(12, Math.round(radius * 1.15)) + 'px system-ui, sans-serif';
    context.fillText(String(level), centerX, centerY + 0.5);
    context.restore();
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
          drawExportLlbBadge(context, x, y, tileSize, progress.llb);
        }
      });

      context.fillStyle = '#9faed0';
      context.font = '500 16px system-ui, sans-serif';
      context.fillText('Brightness = owned  •  Rainbow border = rainbowed  •  Rainbow badge = LLB level', padding, height - 20);
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
      state.sharedPreview = false;
      clearSharedHash();
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
    elements.grid.addEventListener('pointerdown', onGalleryPointerDown);
    elements.grid.addEventListener('pointerup', clearGalleryHold);
    elements.grid.addEventListener('pointercancel', clearGalleryHold);
    elements.grid.addEventListener('pointerleave', clearGalleryHold);
    elements.grid.addEventListener('pointermove', clearGalleryHold);
    elements.grid.addEventListener('contextmenu', onGalleryContextMenu);
    elements.grid.addEventListener('keydown', onGalleryKeydown);
    elements.gemPlannerControls.addEventListener('input', syncGemPlan);
    elements.gemPlannerControls.addEventListener('change', syncGemPlan);
    elements.gemCustomName.addEventListener('input', syncGemPlan);
    elements.gemCustomDate.addEventListener('change', syncGemPlan);
    elements.gemEventList.addEventListener('change', onGemEventChange);
    elements.gemEventList.addEventListener('click', onGemEventClick);
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
    document.querySelector('.view-switch').addEventListener('click', chooseView);
    elements.drawerToggle.addEventListener('click', function () { setDrawerOpen(!state.drawerOpen); });
    elements.drawerClose.addEventListener('click', function () { setDrawerOpen(false); });
    elements.drawerScrim.addEventListener('click', function () { setDrawerOpen(false); });
    elements.resetButton.addEventListener('click', resetProgress);
    elements.backupButton.addEventListener('click', openBackup);
    elements.shareButton.addEventListener('click', openShare);
    elements.copyExport.addEventListener('click', copyBackup);
    elements.copyShareLink.addEventListener('click', copyShareLink);
    elements.nativeShareLink.addEventListener('click', nativeShareLink);
    elements.downloadImage.addEventListener('click', generateShareImage);
    elements.applyImport.addEventListener('click', importBackup);
    elements.saveSharedCopy.addEventListener('click', saveSharedCopy);
    elements.galleryEditorDialog.addEventListener('close', function () { state.galleryEditId = null; });
    elements.galleryEditorOwned.addEventListener('click', function () {
      if (!state.galleryEditId) return;
      toggleLegendOwned(state.galleryEditId);
      updateGalleryEditor();
    });
    elements.galleryEditorRainbow.addEventListener('click', function () {
      if (!state.galleryEditId) return;
      toggleLegendRainbow(state.galleryEditId);
      updateGalleryEditor();
    });
    elements.galleryEditorLlbOptions.addEventListener('click', function (event) {
      var button = event.target.closest('[data-gallery-llb]');
      if (!button || !state.galleryEditId) return;
      setLegendLlb(state.galleryEditId, button.dataset.galleryLlb);
      updateGalleryEditor();
    });
    window.addEventListener('hashchange', syncSharedPreviewFromUrl);
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.drawerOpen) setDrawerOpen(false);
    });
    document.querySelector('.dialog-tabs').addEventListener('click', function (event) {
      var tab = event.target.closest('[data-transfer-view]');
      if (tab) setTransferView(tab.dataset.transferView);
    });
  }

  function cacheElements() {
    elements.utilityDrawer = byId('utility-drawer');
    elements.drawerToggle = byId('drawer-toggle');
    elements.drawerClose = byId('drawer-close');
    elements.drawerScrim = byId('drawer-scrim');
    elements.gemPlannerControls = byId('gem-planner-controls');
    elements.gemCurrent = byId('gem-current');
    elements.gemDaily = byId('gem-daily');
    elements.gemStartDate = byId('gem-start-date');
    elements.gemCustomName = byId('gem-custom-name');
    elements.gemCustomDate = byId('gem-custom-date');
    elements.gemPlanSummary = byId('gem-plan-summary');
    elements.gemEventList = byId('gem-event-list');
    elements.gemEventsSummary = byId('gem-events-summary');
    elements.gemEventsFeedLink = byId('gem-events-feed-link');
    elements.grid = byId('legend-grid');
    elements.template = byId('legend-card-template');
    elements.galleryTemplate = byId('gallery-tile-template');
    elements.viewInstruction = byId('view-instruction');
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
    elements.sharedCollectionNotice = byId('shared-collection-notice');
    elements.saveSharedCopy = byId('save-shared-copy');
    elements.saveNote = byId('save-note');
    elements.saveNoteText = byId('save-note-text');
    elements.backupButton = byId('backup-button');
    elements.shareButton = byId('share-button');
    elements.backupDialog = byId('backup-dialog');
    elements.galleryEditorDialog = byId('gallery-editor-dialog');
    elements.galleryEditorArt = byId('gallery-editor-art');
    elements.galleryEditorName = byId('gallery-editor-name');
    elements.galleryEditorId = byId('gallery-editor-id');
    elements.galleryEditorOwned = byId('gallery-editor-owned');
    elements.galleryEditorRainbow = byId('gallery-editor-rainbow');
    elements.galleryEditorLlbOptions = document.querySelector('.gallery-editor-llb-options');
    elements.galleryEditorLlbButtons = document.querySelectorAll('[data-gallery-llb]');
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
    setDrawerOpen(false);
    loadProgress();
    loadGemPlan();
    loadLegends();
    updateLegendPoolOptions();
    bindEvents();
    renderGrid();
    loadGemEvents();
  }

  document.addEventListener('DOMContentLoaded', start);
}());
