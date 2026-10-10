/**
 * TTPhim Android TV - Universal D-Pad Remote Navigation Engine
 * Provides 10-foot leanback spatial navigation, focus management,
 * auto-scrolling, and remote key handling.
 */

(function () {
  'use strict';

  // Key codes for TV remotes and keyboard emulators
  const KEYS = {
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    ENTER: 13,
    BACK_ESC: 27,
    BACK_BS: 8,
    ANDROID_BACK: 4,
    PLAY_PAUSE: 179,
    MEDIA_PLAY: 250,
    MEDIA_PAUSE: 19
  };

  let currentFocusedElement = null;

  function getAllFocusables() {
    const selector = '.tv-focusable, a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex="0"]';
    return Array.from(document.querySelectorAll(selector)).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
    });
  }

  function setFocus(el) {
    if (!el) return;
    if (currentFocusedElement && currentFocusedElement !== el) {
      currentFocusedElement.classList.remove('tv-focused');
      currentFocusedElement.blur();
    }
    currentFocusedElement = el;
    el.classList.add('tv-focused');
    el.focus();

    // Smooth scroll into visible view with padding
    try {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    } catch (_) {}
  }

  function getCenter(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function findNearestElement(current, direction) {
    const focusables = getAllFocusables();
    if (!focusables.length) return null;
    if (!current) return focusables[0];

    const currentRect = current.getBoundingClientRect();
    const currentCenter = getCenter(currentRect);

    let bestMatch = null;
    let minDistance = Infinity;

    for (const target of focusables) {
      if (target === current) continue;

      const targetRect = target.getBoundingClientRect();
      const targetCenter = getCenter(targetRect);

      const dx = targetCenter.x - currentCenter.x;
      const dy = targetCenter.y - currentCenter.y;

      let isInDirection = false;
      let primaryDiff = 0;
      let secondaryDiff = 0;

      if (direction === 'LEFT' && dx < -5) {
        isInDirection = true;
        primaryDiff = Math.abs(dx);
        secondaryDiff = Math.abs(dy);
      } else if (direction === 'RIGHT' && dx > 5) {
        isInDirection = true;
        primaryDiff = Math.abs(dx);
        secondaryDiff = Math.abs(dy);
      } else if (direction === 'UP' && dy < -5) {
        isInDirection = true;
        primaryDiff = Math.abs(dy);
        secondaryDiff = Math.abs(dx);
      } else if (direction === 'DOWN' && dy > 5) {
        isInDirection = true;
        primaryDiff = Math.abs(dy);
        secondaryDiff = Math.abs(dx);
      }

      if (isInDirection) {
        // Weighted distance penalizes perpendicular deviation to keep on track
        const weightDistance = primaryDiff + (secondaryDiff * 1.8);
        if (weightDistance < minDistance) {
          minDistance = weightDistance;
          bestMatch = target;
        }
      }
    }

    return bestMatch;
  }

  function handleKeyDown(e) {
    const code = e.keyCode || e.which;

    switch (code) {
      case KEYS.LEFT: {
        const next = findNearestElement(currentFocusedElement, 'LEFT');
        if (next) {
          e.preventDefault();
          setFocus(next);
        }
        break;
      }
      case KEYS.RIGHT: {
        const next = findNearestElement(currentFocusedElement, 'RIGHT');
        if (next) {
          e.preventDefault();
          setFocus(next);
        }
        break;
      }
      case KEYS.UP: {
        const next = findNearestElement(currentFocusedElement, 'UP');
        if (next) {
          e.preventDefault();
          setFocus(next);
        }
        break;
      }
      case KEYS.DOWN: {
        const next = findNearestElement(currentFocusedElement, 'DOWN');
        if (next) {
          e.preventDefault();
          setFocus(next);
        }
        break;
      }
      case KEYS.ENTER: {
        if (currentFocusedElement) {
          e.preventDefault();
          currentFocusedElement.click();
        }
        break;
      }
      case KEYS.BACK_ESC:
      case KEYS.BACK_BS:
      case KEYS.ANDROID_BACK: {
        // Handle Back Navigation
        if (window.location.pathname !== '/tv' && window.location.pathname !== '/tv/') {
          e.preventDefault();
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.href = '/tv';
          }
        }
        break;
      }
    }
  }

  // Update clock in header if element exists
  function updateClock() {
    const clockEl = document.getElementById('tv-clock');
    if (clockEl) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      clockEl.textContent = `${hours}:${minutes}`;
    }
  }

  // Check user VIP / Login status from localStorage or session
  function checkTvAuth() {
    try {
      const userStr = localStorage.getItem('tv_user');
      const userEl = document.getElementById('tv-user-name');
      const avatarEl = document.getElementById('tv-user-avatar');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (userEl) userEl.textContent = user.name || 'Thành Viên VIP';
        if (avatarEl && user.avatar) avatarEl.src = user.avatar;
      }
    } catch (_) {}
  }

  // Initialize
  function init() {
    document.addEventListener('keydown', handleKeyDown);

    // Initial focus on default focus element or first focusable
    const defaultFocus = document.querySelector('[data-initial-focus]') || getAllFocusables()[0];
    if (defaultFocus) {
      setTimeout(() => setFocus(defaultFocus), 150);
    }

    // Hover also updates focus for hybrid pointer/remote devices
    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('.tv-focusable, a[href], button');
      if (target && target !== currentFocusedElement) {
        setFocus(target);
      }
    });

    updateClock();
    setInterval(updateClock, 10000);
    checkTvAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose global TV navigation API
  window.TVNav = {
    setFocus,
    getAllFocusables,
    refreshFocus: () => {
      const focusables = getAllFocusables();
      if (!currentFocusedElement && focusables.length) {
        setFocus(focusables[0]);
      }
    }
  };
})();
