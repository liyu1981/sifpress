/**
 * Sifpress website behavior: theme cycling, ambient canvas scene, copy
 * buttons, scroll reveal and scroll-spy. No dependencies.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  /* ---------------------------------------------------------------- theme */

  function readTheme() {
    try {
      var value = localStorage.getItem('theme');
      if (value === 'light' || value === 'dark' || value === 'system') return value;
    } catch (e) {}
    return 'system';
  }

  function isDark(theme) {
    return theme === 'dark' || (theme === 'system' && systemDark.matches);
  }

  var themeToggle = document.getElementById('theme-toggle');
  var THEME_ORDER = ['light', 'dark', 'system'];
  var THEME_LABEL = { light: 'Theme: light', dark: 'Theme: dark', system: 'Theme: system' };

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.classList.toggle('dark', isDark(theme));
    if (themeToggle) {
      var label = THEME_LABEL[theme];
      themeToggle.setAttribute('aria-label', label + ' — click to cycle');
      themeToggle.setAttribute('title', label + ' — click to cycle');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {}
    ambient.refresh();
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = root.dataset.theme || readTheme();
      var next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
      applyTheme(next);
    });
  }

  systemDark.addEventListener('change', function () {
    if ((root.dataset.theme || readTheme()) === 'system') applyTheme('system');
  });

  /* ------------------------------------------------------------- ambient */

  var ambient = (function () {
    var canvas = document.getElementById('ambient');
    if (!canvas || !canvas.getContext) {
      return { refresh: function () {} };
    }

    var ctx = canvas.getContext('2d');
    var HUES = [200, 260, 320, 170, 30, 355];
    var LIGHT = { sat: 95, light: 74, alpha: 0.34, count: 12 };
    var DARK = { sat: 95, light: 56, alpha: 0.32, count: 12 };

    var blobs = [];
    var signature = '';
    var width = 0;
    var height = 0;
    var dpr = 1;
    var raf = 0;
    var start = 0;

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function wrap(value, min, max) {
      var range = max - min;
      return ((((value - min) % range) + range) % range) + min;
    }

    function paletteFor(dark, reduced) {
      var base = dark ? DARK : LIGHT;
      return reduced ? { sat: base.sat, light: base.light, alpha: base.alpha * 0.55, count: base.count } : base;
    }

    function makeBlobs(palette) {
      var list = [];
      for (var i = 0; i < palette.count; i++) {
        var hue = HUES[Math.floor(Math.random() * HUES.length)] + (Math.random() * 24 - 12);
        list.push({
          rx: Math.random(),
          ry: Math.random(),
          radius: 0.07 + Math.random() * 0.18,
          hue: ((hue % 360) + 360) % 360,
          sat: clamp(palette.sat + (Math.random() * 12 - 6), 0, 100),
          light: clamp(palette.light + (Math.random() * 10 - 5), 0, 100),
          alpha: Math.max(0.08, palette.alpha + (Math.random() * 0.12 - 0.06)),
          vx: (Math.random() * 2 - 1) * 16,
          vy: (Math.random() * 2 - 1) * 16,
          ampX: 20 + Math.random() * 50,
          ampY: 20 + Math.random() * 50,
          phase: Math.random() * Math.PI * 2,
          freq: 0.04 + Math.random() * 0.1,
        });
      }
      return list;
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(now());
    }

    function now() {
      return (performance.now() - (start || performance.now())) / 1000;
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      var base = Math.min(width, height);

      for (var i = 0; i < blobs.length; i++) {
        var blob = blobs[i];
        var x = wrap(
          blob.rx * width + blob.ampX * Math.sin(time * blob.freq + blob.phase) + blob.vx * time,
          -200,
          width + 200,
        );
        var y = wrap(
          blob.ry * height +
            blob.ampY * Math.cos(time * blob.freq * 0.8 + blob.phase * 1.3) +
            blob.vy * time,
          -200,
          height + 200,
        );
        var radius = blob.radius * base * (1 + 0.08 * Math.sin(time * 0.3 + blob.phase));
        var hue = (blob.hue + time * 1.2) % 360;
        var core = 'hsla(' + hue + ' ' + blob.sat + '% ' + blob.light + '% / ' + blob.alpha + ')';
        var edge = 'hsla(' + hue + ' ' + blob.sat + '% ' + blob.light + '% / 0)';

        var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, core);
        gradient.addColorStop(0.6, core);
        gradient.addColorStop(1, edge);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
    }

    function frame(timestamp) {
      draw((timestamp - start) / 1000);
      raf = requestAnimationFrame(frame);
    }

    function refresh() {
      var next =
        (root.classList.contains('dark') ? 'dark' : 'light') +
        ':' +
        (reducedTransparency.matches ? 'rt' : 'full');

      if (next !== signature) {
        signature = next;
        blobs = makeBlobs(paletteFor(root.classList.contains('dark'), reducedTransparency.matches));
        draw(now());
      }

      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }

      if (!reducedMotion.matches) {
        start = performance.now() - now() * 1000;
        raf = requestAnimationFrame(frame);
      }
    }

    window.addEventListener('resize', resize);
    reducedMotion.addEventListener('change', refresh);
    reducedTransparency.addEventListener('change', refresh);

    resize();
    refresh();

    return { refresh: refresh };
  })();

  /* ---------------------------------------------------------------- copy */

  document.querySelectorAll('.copy-btn').forEach(function (button) {
    button.addEventListener('click', function () {
      var target = document.getElementById(button.dataset.copy);
      if (!target) return;
      var text = target.innerText;
      var done = function () {
        button.classList.add('copied');
        setTimeout(function () {
          button.classList.remove('copied');
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand('copy');
          done();
        } catch (e) {}
        document.body.removeChild(area);
      }
    });
  });

  /* -------------------------------------------------------------- reveal */

  var revealables = document.querySelectorAll('.reveal');

  if (reducedMotion.matches || !('IntersectionObserver' in window)) {
    revealables.forEach(function (element) {
      element.classList.add('is-visible');
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    revealables.forEach(function (element) {
      revealObserver.observe(element);
    });
  }

  /* ----------------------------------------------------------- scrollspy */

  var spyLinks = Array.prototype.slice.call(document.querySelectorAll('[data-spy]'));
  var sections = spyLinks
    .map(function (link) {
      return document.getElementById(link.dataset.spy);
    })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var visible = new Set();
    var spyObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        });
        var active = '';
        sections.forEach(function (section) {
          if (visible.has(section.id)) active = section.id;
        });
        spyLinks.forEach(function (link) {
          link.classList.toggle('active', link.dataset.spy === active);
        });
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: 0 },
    );
    sections.forEach(function (section) {
      spyObserver.observe(section);
    });
  }

  /* ------------------------------------------------------------- header */

  var header = document.getElementById('site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
