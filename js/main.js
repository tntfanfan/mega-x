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
let navIsScrolled = false;
window.addEventListener('scroll', () => {
  if (!nav) return;
  const shouldScroll = window.scrollY > 60;
  if (shouldScroll && !navIsScrolled) {
    // Scrolling down → add pill
    nav.classList.remove('pill-fade-out');
    nav.classList.add('scrolled');
    navIsScrolled = true;
  } else if (!shouldScroll && navIsScrolled) {
    // Scrolling back up → fade out pill, then remove
    nav.classList.add('pill-fade-out');
    setTimeout(() => {
      nav.classList.remove('scrolled', 'pill-fade-out');
    }, 600);
    navIsScrolled = false;
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
