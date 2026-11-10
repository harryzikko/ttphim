(function (global) {
  'use strict';

  var currentFocus = null;
  var customHandlers = [];

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled) return false;
    var style = global.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getFocusableNodes(scopeRoot) {
    var root = scopeRoot || document;
    var list = root.querySelectorAll('[data-focusable="true"]');
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (isVisible(list[i])) out.push(list[i]);
    }
    return out;
  }

  function getActiveScope() {
    var modal = document.getElementById('tv-modal-layer');
    if (modal && !modal.classList.contains('hidden')) return modal;
    var player = document.getElementById('tv-player-layer');
    if (player && !player.classList.contains('hidden')) return player;
    var detail = document.getElementById('tv-detail-layer');
    if (detail && !detail.classList.contains('hidden')) return detail;
    return document.getElementById('tv-app');
  }

  function setFocus(el, skipScroll) {
    if (!el || !isVisible(el)) return false;
    if (currentFocus && currentFocus !== el) {
      currentFocus.classList.remove('tv-focused');
    }
    currentFocus = el;
    el.classList.add('tv-focused');
    try { el.focus({ preventScroll: true }); } catch (_) {}

    var sidebar = document.getElementById('tv-sidebar');
    if (sidebar) {
      if (el.getAttribute('data-group') === 'sidebar') sidebar.classList.add('expanded');
      else sidebar.classList.remove('expanded');
    }

    if (!skipScroll) {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } catch (_) {
        el.scrollIntoView(false);
      }
    }
    return true;
  }

  function centerOf(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function moveDirection(dir) {
    var scope = getActiveScope();
    var nodes = getFocusableNodes(scope);
    if (!nodes.length) return;
    if (!currentFocus || !isVisible(currentFocus) || nodes.indexOf(currentFocus) === -1) {
      setFocus(nodes[0]);
      return;
    }

    var srcRect = currentFocus.getBoundingClientRect();
    var src = centerOf(srcRect);
    var best = null;
    var bestScore = Infinity;

    for (var i = 0; i < nodes.length; i++) {
      var cand = nodes[i];
      if (cand === currentFocus) continue;
      var rect = cand.getBoundingClientRect();
      var pt = centerOf(rect);
      var dx = pt.x - src.x;
      var dy = pt.y - src.y;

      if (dir === 'left' && dx >= -6) continue;
      if (dir === 'right' && dx <= 6) continue;
      if (dir === 'up' && dy >= -6) continue;
      if (dir === 'down' && dy <= 6) continue;

      var primary = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy);
      var cross = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);

      // Strongly prefer aligned elements in the same rail/column
      var penalty = cross * 2.6;
      if ((dir === 'left' || dir === 'right') && Math.abs(dy) < Math.max(srcRect.height, rect.height) * 0.6) {
        penalty = cross * 0.5;
      }
      if ((dir === 'up' || dir === 'down') && Math.abs(dx) < Math.max(srcRect.width, rect.width) * 0.65) {
        penalty = cross * 0.65;
      }

      var score = primary + penalty;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (best) {
      setFocus(best);
    }
  }

  function pushHandler(fn) {
    customHandlers.push(fn);
  }

  function popHandler(fn) {
    var idx = customHandlers.lastIndexOf(fn);
    if (idx !== -1) customHandlers.splice(idx, 1);
  }

  function handleKeyDown(e) {
    var code = e.keyCode || e.which;
    for (var i = customHandlers.length - 1; i >= 0; i--) {
      if (customHandlers[i](code, e) === true) {
        e.preventDefault();
        return;
      }
    }

    if (code === 37) { e.preventDefault(); moveDirection('left'); }
    else if (code === 38) { e.preventDefault(); moveDirection('up'); }
    else if (code === 39) { e.preventDefault(); moveDirection('right'); }
    else if (code === 40) { e.preventDefault(); moveDirection('down'); }
    else if (code === 13) {
      if (currentFocus && isVisible(currentFocus)) {
        e.preventDefault();
        currentFocus.click();
      }
    }
  }

  document.addEventListener('mouseover', function (e) {
    var target = e.target;
    while (target && target !== document) {
      if (target.getAttribute && target.getAttribute('data-focusable') === 'true' && isVisible(target)) {
        setFocus(target, true);
        break;
      }
      target = target.parentNode;
    }
  });

  global.addEventListener('keydown', handleKeyDown);

  global.TvSpatial = {
    getCurrent: function () { return currentFocus; },
    setFocus: setFocus,
    focusFirst: function (container) {
      var nodes = getFocusableNodes(container || getActiveScope());
      if (nodes.length) return setFocus(nodes[0], true);
      return false;
    },
    focusSelector: function (sel, container) {
      var root = container || getActiveScope();
      var el = root ? root.querySelector(sel) : null;
      if (el) return setFocus(el, false);
      return false;
    },
    pushHandler: pushHandler,
    popHandler: popHandler
  };
})(window);
