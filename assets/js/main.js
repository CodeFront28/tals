document.addEventListener("DOMContentLoaded", async () => {
  const startVideo = document.querySelector(".hero__start");
  const loopVideo = document.querySelector(".hero__end");

  // --- H1 элементы (две строки) ---
  const h1Stroke = document.querySelector(".home__text h1 .stroke");
  const h1Color = document.querySelector(".home__text h1 .color");

  // --- Камни ---
  const stones = document.querySelector(".stones");
  const stoneItems = stones ? Array.from(stones.children) : [];

  // ============================================================
  // Scramble: "программирование" текста (timed под длительность)
  // ============================================================
  const scrambleCharset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_=+";
  function splitToCharSpans(el) {
    const text = el.textContent || "";
    el.textContent = "";
    const frag = document.createDocumentFragment();

    for (const ch of text) {
      const span = document.createElement("span");
      span.className = "scramble__char";
      span.dataset.final = ch;

      if (ch === " ") {
        span.innerHTML = "&nbsp;";
        span.dataset.locked = "1";
      } else {
        span.textContent =
          scrambleCharset[Math.floor(Math.random() * scrambleCharset.length)];
        span.dataset.locked = "0";
      }

      frag.appendChild(span);
    }

    el.appendChild(frag);
    return Array.from(el.querySelectorAll(".scramble__char"));
  }

  /**
   * Scramble, где фиксация букв распределена во времени так,
   * чтобы весь эффект завершился примерно за totalMs.
   */
  function runScrambleTimed(el, totalMs, opts = {}) {
    const {
      startDelayMs = 0, // задержка старта
      stepMs = 26, // частота смены символов (больше = спокойнее)
      frontLoad = 0.18, // 0..0.35: выше = быстрее старт, плавнее финал
    } = opts;

    const allSpans = splitToCharSpans(el);
    const chars = allSpans.filter((s) => s.dataset.final !== " "); // не трогаем пробелы
    const n = chars.length;

    const lockTimes = chars.map((_, i) => {
      const t = i / Math.max(1, n - 1); // 0..1
      const eased = (1 - frontLoad) * (t * t) + frontLoad * t;
      return startDelayMs + eased * totalMs;
    });

    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;

      chars.forEach((span, i) => {
        if (span.dataset.locked === "1") return;

        if (elapsed >= lockTimes[i]) {
          span.textContent = span.dataset.final;
          span.dataset.locked = "1";
        } else {
          // меняем символы "шагами" stepMs
          if (
            Math.floor(elapsed / stepMs) !== Math.floor((elapsed - 16) / stepMs)
          ) {
            span.textContent =
              scrambleCharset[
                Math.floor(Math.random() * scrambleCharset.length)
              ];
          }
        }
      });

      const done = chars.every((s) => s.dataset.locked === "1");
      if (!done) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  // ============================================================
  // Камни: выезд + glow delay
  // (CSS должен содержать .stone--in и .stones.no-glow)
  // ============================================================
  function animateStonesEntrance() {
    if (!stones || stoneItems.length === 0) return;

    // 1) пока выезжают — glow выключен
    stones.classList.add("no-glow");

    // на всякий случай: сбросим состояние
    stoneItems.forEach((it) => it.classList.remove("stone--in"));

    const stagger = 120; // задержка между камнями (крути)
    const travelMs = 700; // ДОЛЖНО совпадать с transition в CSS

    // 2) выезд по очереди
    stoneItems.forEach((item, idx) => {
      setTimeout(() => item.classList.add("stone--in"), idx * stagger);
    });

    // 3) когда последний приехал + 1 сек → включаем glow
    const totalEntranceMs = (stoneItems.length - 1) * stagger + travelMs;
    setTimeout(() => {
      stones.classList.remove("no-glow");
    }, totalEntranceMs + 1000);
  }

  // ============================================================
  // ВИДЕО: твой исходный функционал (прогрев + плавная замена)
  // ============================================================
  if (!startVideo || !loopVideo) {
    // Даже если видео нет — можно запустить scramble "по умолчанию"
    // (чтоб не ломалось). Длительность поставим 1200мс.
    const fallbackMs = 1200;
    if (h1Stroke)
      runScrambleTimed(h1Stroke, fallbackMs * 0.92, {
        stepMs: 28,
        frontLoad: 0.22,
      });
    if (h1Color)
      runScrambleTimed(h1Color, fallbackMs * 0.86, {
        startDelayMs: 140,
        stepMs: 28,
        frontLoad: 0.2,
      });
    return;
  }

  // --- Настройки ---
  const FADE_MS = 1; // должно совпадать с CSS transition длительностью (у тебя так было)

  // --- Утилиты ---
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const once = (el, event) =>
    new Promise((resolve) =>
      el.addEventListener(event, resolve, { once: true }),
    );

  const ensureReadyToPaint = async (video) => {
    if (video.readyState >= 3) return;

    await Promise.race([once(video, "canplay"), once(video, "loadeddata")]);

    if (video.readyState < 2) {
      await once(video, "loadeddata");
    }
  };

  const safePlay = async (video) => {
    try {
      const p = video.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
      return false;
    }
  };

  // --- Подготовка loop-видео заранее ---
  loopVideo.preload = "auto";
  loopVideo.muted = true;
  loopVideo.playsInline = true;
  loopVideo.loop = true;

  // Начальное состояние: loop невидимый (CSS тоже должен это задавать)
  loopVideo.style.opacity = "0";
  loopVideo.style.willChange = "opacity";

  // Принудительно запускаем загрузку
  loopVideo.load();

  // Ждём, пока браузер сможет рисовать кадр
  await ensureReadyToPaint(loopVideo);

  // "Прогрев" декодера: кратко play->pause.
  const warmed = await safePlay(loopVideo);
  if (warmed) {
    loopVideo.pause();
    try {
      loopVideo.currentTime = 0;
    } catch {}
  }

  // ============================================================
  // Scramble синхронно с первым видео:
  // стартуем когда startVideo реально начал играть (playing)
  // и берем duration из metadata
  // ============================================================
  let scrambleStarted = false;

  const startScrambleSynced = () => {
    if (scrambleStarted) return;
    scrambleStarted = true;

    // duration может быть NaN, если метаданные не загрузились
    const duration = startVideo.duration;
    const totalMs =
      duration && isFinite(duration)
        ? Math.max(900, Math.floor(duration * 1000))
        : 1400; // fallback

    // Чуть меньше 100% чтобы гарантированно успеть до "ended" визуально
    if (h1Stroke)
      runScrambleTimed(h1Stroke, totalMs * 0.92, {
        stepMs: 30,
        frontLoad: 0.24,
      });
    if (h1Color)
      runScrambleTimed(h1Color, totalMs * 0.86, {
        startDelayMs: 140,
        stepMs: 30,
        frontLoad: 0.22,
      });
  };

  // Стартуем scramble как можно точнее: на событии playing
  startVideo.addEventListener("playing", startScrambleSynced, { once: true });

  // На всякий случай: если playing уже был (редко), стартуем при loadedmetadata
  startVideo.addEventListener(
    "loadedmetadata",
    () => {
      // если видео уже играет, but playing не поймали — стартанем здесь
      if (!scrambleStarted && !startVideo.paused) startScrambleSynced();
    },
    { once: true },
  );

  // ============================================================
  // Переключение по завершению первого + запуск камней
  // ============================================================
  startVideo.addEventListener("ended", async () => {
    // На момент ended убеждаемся, что loop реально готов
    await ensureReadyToPaint(loopVideo);

    // Запускаем loop
    await safePlay(loopVideo);

    // Даём браузеру 1 кадр на отрисовку, потом фейдим (уменьшает шанс рывка)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        loopVideo.style.opacity = "1";
      });
    });

    // Запускаем камни (в момент смены видео)
    animateStonesEntrance();

    // После завершения фейда убираем start
    await wait(FADE_MS + 50);

    startVideo.style.display = "none";
    // startVideo.remove(); // если хочешь жестко удалять
  });

  // --- На всякий случай: если start не автозапустился, пробуем стартануть ---
  if (startVideo.paused) {
    startVideo.muted = true;
    startVideo.playsInline = true;
    await safePlay(startVideo);
  }
});
