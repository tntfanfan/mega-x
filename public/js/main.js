(() => {
'use strict';

// ========== LANGUAGE SWITCHER (marketing nav) ==========
// Detect current locale from URL prefix (/zh/, /ar/) — default is English.
// Switching changes the URL prefix and reloads; chosen locale is persisted
// to localStorage for future visits, and the dropdown label reflects state.
const SUPPORTED_LANGS = ['en', 'zh', 'ar'];
const ENABLED_LANGS = ['en', 'zh'];  // Arabic disabled until ar.json is filled

function currentLang() {
  const m = window.location.pathname.match(/^\/(zh|ar)(\/|$)/);
  return m ? m[1] : 'en';
}

function buildLangUrl(targetLang) {
  const path = window.location.pathname;
  // Strip any existing locale prefix
  const stripped = path.replace(/^\/(zh|ar)(?=\/|$)/, '') || '/';
  if (targetLang === 'en') return stripped + window.location.search + window.location.hash;
  return '/' + targetLang + (stripped === '/' ? '/' : stripped) + window.location.search + window.location.hash;
}

(function initLangSwitcher() {
  const toggle = document.querySelector('[data-mx-lang-toggle]');
  const menu = document.querySelector('[data-mx-lang-menu]');
  const currentLabel = document.querySelector('[data-mx-lang-current]');
  if (!toggle || !menu) return;

  // Set current label
  if (currentLabel) currentLabel.textContent = currentLang().toUpperCase();

  // Persist current choice
  try { localStorage.setItem('mx.locale', currentLang()); } catch (_) {}

  // Toggle dropdown
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    menu.hidden = !menu.hidden;
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !toggle.contains(e.target) && !menu.contains(e.target)) {
      menu.hidden = true;
    }
  });

  // Handle locale clicks
  menu.querySelectorAll('[data-mx-lang]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const lang = link.getAttribute('data-mx-lang');
      if (!ENABLED_LANGS.includes(lang)) return;     // disabled (e.g. ar)
      if (lang === currentLang()) { menu.hidden = true; return; }
      try { localStorage.setItem('mx.locale', lang); } catch (_) {}
      window.location.href = buildLangUrl(lang);
    });
  });
})();

// ========== LOADER ==========
window.addEventListener('load', () => {
  const loader = document.querySelector('.loader-overlay');
  if (loader) {
    setTimeout(() => loader.classList.add('hidden'), 400);
    setTimeout(() => loader.remove(), 1000);
  }
});

// ========== NAV SCROLL ==========
const nav = document.querySelector('.nav');
const navInner = nav ? nav.querySelector('.nav-inner') : null;
let navIsScrolled = false;
let navTransitioning = false;

window.addEventListener('scroll', () => {
  if (!nav) return;
  const shouldScroll = window.scrollY > 60;

  if (shouldScroll && !navIsScrolled) {
    // Scrolling down → show pill
    navIsScrolled = true;
    navTransitioning = false;
    nav.classList.remove('pill-fade-out', 'bar-fade-in');
    nav.classList.add('scrolled');

  } else if (!shouldScroll && navIsScrolled && !navTransitioning) {
    // Scrolling back up → fade out pill, then reveal bar
    navIsScrolled = false;
    navTransitioning = true;

    // Step 1: fade pill to opacity 0
    nav.classList.add('pill-fade-out');

    // Step 2: after fade done, strip pill styles (invisible, no flash)
    setTimeout(() => {
      nav.classList.remove('scrolled');
      // Step 3: next frame, fade bar back in
      requestAnimationFrame(() => {
        nav.classList.remove('pill-fade-out');
        nav.classList.add('bar-fade-in');
        // Clean up after bar fade-in completes
        setTimeout(() => {
          nav.classList.remove('bar-fade-in');
          navTransitioning = false;
        }, 600);
      });
    }, 500);
  }
}, { passive: true });

// ========== MOBILE TOGGLE ==========
const toggle = document.querySelector('.nav-toggle');
const mobileMenu = document.querySelector('.mobile-menu');
if (toggle && mobileMenu) {
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
    mobileMenu.classList.toggle('active');
    document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
  });
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
}

// ========== SCROLL REVEAL ==========
const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

revealElements.forEach(el => revealObserver.observe(el));

// ========== SMOOTH SCROLL FOR ANCHORS ==========
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ========== HERO VIDEO DEFERRED LOAD ==========
// Poster shows instantly; video loads after page is interactive
document.querySelectorAll('video[autoplay]').forEach(video => {
  const loadAndPlay = () => {
    const sources = video.querySelectorAll('source[data-src]');
    if (sources.length) {
      sources.forEach(s => { s.src = s.dataset.src; s.removeAttribute('data-src'); });
      video.load();
    }
    const tryPlay = () => {
      if (video.paused) video.play().catch(() => {});
    };
    video.addEventListener('canplay', tryPlay, { once: true });
    setTimeout(tryPlay, 2000);
    // Mobile fallback: play on first interaction
    const playOnInteract = () => {
      tryPlay();
      document.removeEventListener('touchstart', playOnInteract);
      document.removeEventListener('click', playOnInteract);
    };
    document.addEventListener('touchstart', playOnInteract, { once: true, passive: true });
    document.addEventListener('click', playOnInteract, { once: true });
  };
  // Defer: wait until page is idle or after 1s
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadAndPlay, { timeout: 1500 });
  } else {
    setTimeout(loadAndPlay, 1000);
  }
});

// ========== LAZY VIDEO (IntersectionObserver) ==========
document.querySelectorAll('video.lazy-video').forEach(video => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        observer.unobserve(video);
        const sources = video.querySelectorAll('source[data-src]');
        sources.forEach(s => { s.src = s.dataset.src; s.removeAttribute('data-src'); });
        video.load();
        // Wait for video to be ready before playing
        const tryPlay = () => {
          video.play().catch(() => {
            // If play fails, retry on user interaction (mobile restriction)
            const retryOnTouch = () => {
              video.play().catch(() => {});
              document.removeEventListener('touchstart', retryOnTouch);
            };
            document.addEventListener('touchstart', retryOnTouch, { once: true, passive: true });
          });
        };
        video.addEventListener('canplay', tryPlay, { once: true });
        // Fallback: if canplay already fired or never fires
        setTimeout(() => {
          if (video.paused) tryPlay();
        }, 2000);
      }
    });
  }, { rootMargin: '300px' });
  observer.observe(video);
});

// ========== SCROLL TO TOP ==========
const scrollTopBtn = document.querySelector('.scroll-top');
if (scrollTopBtn) {
  window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 600);
  }, { passive: true });
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

})();
