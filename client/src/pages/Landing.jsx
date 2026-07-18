import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import Lenis from 'lenis';
import { HeroScene } from '../components/landing/HeroScene';
import { useMagnetic } from '../hooks/useMagnetic';
import { useAuth } from '../hooks/useAuth';

const INSTRUMENTS = [
  { n: '01', name: 'Emotion', desc: 'Your face sets the palette — joy turns to gold, focus to mint.' },
  { n: '02', name: 'Gesture', desc: 'An open palm scatters, a fist condenses. Your hand is the brush.' },
  { n: '03', name: 'Voice', desc: 'Bass swells the particles. Speak a color and the ink obeys.' },
  { n: '04', name: 'Brushes', desc: 'Pen, marker, neon, spray — fifteen instruments on one canvas.' },
];

const ABOUT_POINTS = [
  { label: 'No mouse required', desc: 'Your face, hands and voice are the instruments.' },
  { label: 'Solo or collective', desc: 'Paint alone, or fuse voices with up to seven others.' },
  { label: 'A poem at the end', desc: 'AI writes a short verse about the moment you made.' },
];

function HeadlineReveal({ text }) {
  const ref = useRef(null);
  useEffect(() => {
    const chars = ref.current?.querySelectorAll('.char-reveal');
    if (!chars?.length) return;
    const tl = gsap.to(chars, {
      y: 0,
      opacity: 1,
      filter: 'blur(0px)',
      duration: 1.2,
      stagger: 0.055,
      ease: 'power4.out',
      delay: 0.4,
    });
    return () => tl.kill();
  }, []);
  return (
    <h1
      ref={ref}
      aria-label={text}
      className="font-display font-extrabold text-white leading-none tracking-tight overflow-hidden"
      style={{ fontSize: 'clamp(4rem, 13vw, 13rem)' }}
    >
      {text.split('').map((ch, i) => (
        <span key={i} aria-hidden="true" className="char-reveal" style={{ filter: 'blur(10px)' }}>
          {ch}
        </span>
      ))}
    </h1>
  );
}

// Дума-по-дума mask reveal за заглавия (кинематографичен каскаден ефект)
function LineReveal({ text, className, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const words = ref.current?.querySelectorAll('.word-inner');
    if (!words?.length) return;
    gsap.set(words, { yPercent: 110, rotate: 4 });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          gsap.to(words, {
            yPercent: 0,
            rotate: 0,
            duration: 0.9,
            stagger: 0.045,
            ease: 'power4.out',
          });
          io.disconnect();
        });
      },
      { threshold: 0.4 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <h2 ref={ref} className={className} style={style} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} aria-hidden="true" className="inline-block overflow-hidden align-bottom">
          <span className="word-inner inline-block will-change-transform">{w}&nbsp;</span>
        </span>
      ))}
    </h2>
  );
}

function ModePanel({ index, title, tagline, copy, accent, onClick, wide }) {
  const magneticRef = useMagnetic(0.1);
  const tiltRef = useRef(null);

  // 3D tilt: върху вътрешния wrapper (магнитът мести външния бутон)
  const handleMove = (e) => {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(el, { rotateY: px * 7, rotateX: -py * 7, duration: 0.5, ease: 'power2.out' });
  };
  const handleLeave = () => {
    gsap.to(tiltRef.current, { rotateX: 0, rotateY: 0, duration: 0.9, ease: 'elastic.out(1, 0.5)' });
  };

  return (
    <button
      ref={magneticRef}
      onClick={onClick}
      data-magnetic
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`group relative w-full text-left ${wide ? 'md:col-span-2' : ''}`}
      style={{ perspective: '900px' }}
    >
      <div
        ref={tiltRef}
        className="shine-card energy-border relative h-full rounded-2xl border border-ink-line bg-ink-soft/50 backdrop-blur p-6 transition-colors duration-500 group-hover:bg-ink-soft/80 will-change-transform"
      >
        {/* Ghost цифра зад съдържанието */}
        <span className="absolute -top-2 right-3 font-display font-extrabold text-[5.5rem] leading-none text-white/[0.04] select-none pointer-events-none">
          {index}
        </span>
        <div className="text-[10px] tracking-[0.4em] text-gray-500 font-body">{index}</div>
        <div className="mt-3 font-display text-xl md:text-2xl font-extrabold text-white">
          {title}
        </div>
        <div
          className="mt-1.5 text-[10px] uppercase tracking-[0.3em]"
          style={{ color: `rgb(var(--accent-${accent}) / 0.8)` }}
        >
          {tagline}
        </div>
        <p className="mt-3 text-[13px] text-gray-400 leading-relaxed">{copy}</p>
        <div className="mt-4 flex items-center gap-3 text-[11px] tracking-[0.25em] uppercase text-gray-500 group-hover:text-white transition-colors duration-500">
          Enter <span className="inline-block transition-transform duration-500 group-hover:translate-x-2">→</span>
        </div>
      </div>
    </button>
  );
}

// side: 'left' | 'right' — коя половина заема ТЕКСТОВОТО съдържание
// (партикъл-скулптурата е в срещуположната половина — вижте sideSign()
// в ParticleSculpture.jsx; редът тук трябва да остане обратен на него).
function sideClass(side) {
  return side === 'left' ? 'mr-auto text-left' : 'ml-auto text-left';
}

export function Landing({ navigate }) {
  const { user } = useAuth();
  const scrollRef = useRef(null); // Lenis scroll container
  // Непрекъснат "секция-индекс" 0..4 (Hero/About/Modes/Instruments/Footer),
  // четен per-frame от HeroScene. Интерполира се ЦЕНТЪР-към-ЦЕНТЪР на
  // секциите: точно в центъра на секция i прогресът е точно i — формациите
  // винаги съвпадат с това, което потребителят гледа.
  const scrollProgressRef = useRef(0);
  const sectionRefs = useRef([]);
  const setSectionRef = (i) => (el) => {
    sectionRefs.current[i] = el;
  };
  const revealRootRef = useRef(null);
  const lenisRef = useRef(null);
  const parallaxRef = useRef([]); // [{ el, factor, baseCenter }]
  const heroTitleRef = useRef(null);
  const heroSubRef = useRef(null);

  // ── Прогрес: интерполация между центровете на секциите ──
  const updateProgress = useCallback((scroll) => {
    const wrapper = scrollRef.current;
    const sections = sectionRefs.current.filter(Boolean);
    if (!wrapper || !sections.length) return;
    const vc = scroll + wrapper.clientHeight / 2;
    const centers = sections.map((s) => s.offsetTop + s.offsetHeight / 2);
    let progress;
    if (vc <= centers[0]) progress = 0;
    else if (vc >= centers[centers.length - 1]) progress = centers.length - 1;
    else {
      let i = 0;
      while (i < centers.length - 2 && vc > centers[i + 1]) i++;
      progress = i + (vc - centers[i]) / (centers[i + 1] - centers[i]);
    }
    scrollProgressRef.current = progress;

    // Parallax на декоративните ghost елементи
    for (const p of parallaxRef.current) {
      const delta = p.baseCenter - vc;
      p.el.style.transform = `translateY(${delta * p.factor}px)`;
    }
  }, []);

  // ── Lenis smooth scroll ──
  useEffect(() => {
    const wrapper = scrollRef.current;
    if (!wrapper) return;
    const lenis = new Lenis({
      wrapper,
      content: wrapper.firstElementChild,
      duration: 1.15,
      smoothWheel: true,
    });
    lenisRef.current = lenis;
    lenis.on('scroll', ({ scroll }) => updateProgress(scroll));

    // Измери базовите позиции на parallax елементите (без transform)
    const measure = () => {
      parallaxRef.current = [...wrapper.querySelectorAll('[data-parallax]')].map((el) => {
        el.style.transform = '';
        const r = el.getBoundingClientRect();
        const w = wrapper.getBoundingClientRect();
        return {
          el,
          factor: parseFloat(el.dataset.parallax) || 0.12,
          baseCenter: r.top - w.top + wrapper.scrollTop + r.height / 2,
        };
      });
      updateProgress(wrapper.scrollTop);
    };
    // След първия layout (шрифтове/грид)
    const t = setTimeout(measure, 300);
    window.addEventListener('resize', measure);

    let rafId;
    const raf = (time) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [updateProgress]);

  // ── Кинематографично отваряне: letterbox лентите се прибират (CSS
  // анимация + премахване през state — издръжливо на StrictMode/re-render) ──
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), 1800);
    return () => clearTimeout(t);
  }, []);

  // ── Hero mouse parallax (дълбочина на заглавието) ──
  useEffect(() => {
    const title = heroTitleRef.current;
    const sub = heroSubRef.current;
    if (!title || !sub) return;
    const tx = gsap.quickTo(title, 'x', { duration: 0.9, ease: 'power3.out' });
    const ty = gsap.quickTo(title, 'y', { duration: 0.9, ease: 'power3.out' });
    const sx = gsap.quickTo(sub, 'x', { duration: 1.2, ease: 'power3.out' });
    const sy = gsap.quickTo(sub, 'y', { duration: 1.2, ease: 'power3.out' });
    const onMove = (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      tx(nx * -18);
      ty(ny * -10);
      sx(nx * -30);
      sy(ny * -16);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // ── Staggered reveals: [data-reveal] (блок) и [data-reveal-stagger] (деца) ──
  useEffect(() => {
    const root = revealRootRef.current;
    if (!root) return;
    const singles = root.querySelectorAll('[data-reveal]');
    const staggers = root.querySelectorAll('[data-reveal-stagger]');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          if (el.hasAttribute('data-reveal-stagger')) {
            gsap.to(el.children, {
              y: 0,
              opacity: 1,
              rotate: 0,
              duration: 0.9,
              stagger: 0.08,
              ease: 'power3.out',
            });
          } else {
            gsap.to(el, { y: 0, opacity: 1, duration: 1, ease: 'power3.out' });
          }
          io.unobserve(el);
        });
      },
      { threshold: 0.15 }
    );
    singles.forEach((s) => {
      gsap.set(s, { y: 48, opacity: 0 });
      io.observe(s);
    });
    staggers.forEach((s) => {
      gsap.set(s.children, { y: 56, opacity: 0, rotate: 1.5 });
      io.observe(s);
    });
    return () => io.disconnect();
  }, []);

  const goto = useCallback((screen) => () => navigate(screen), [navigate]);

  return (
    <div className="relative h-full w-full bg-ink">
      {/* WebGL фон — ФИКСИРАН за целия сайт */}
      <HeroScene scrollProgressRef={scrollProgressRef} className="fixed inset-0 z-0" />

      {/* Кинематографична винетка */}
      <div className="cinema-vignette fixed inset-0 z-10 pointer-events-none" />

      {/* Letterbox ленти (кино интро) */}
      {!introDone && (
        <>
          <div className="letterbox-bar fixed top-0 inset-x-0 h-[12vh] bg-black z-40 pointer-events-none origin-top" />
          <div className="letterbox-bar fixed bottom-0 inset-x-0 h-[12vh] bg-black z-40 pointer-events-none origin-bottom" />
        </>
      )}

      {/* ── Nav chips (горе дясно) ── */}
      <nav className="fixed top-4 right-4 z-30 flex items-center gap-2">
        <button
          onClick={goto('compete')}
          data-magnetic
          className="rounded-full border border-ink-line bg-ink-soft/70 backdrop-blur px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-gray-300 hover:text-white hover:border-gray-500 transition"
        >
          Compete
        </button>
        <button
          onClick={goto('gallery')}
          data-magnetic
          className="rounded-full border border-ink-line bg-ink-soft/70 backdrop-blur px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-gray-300 hover:text-white hover:border-gray-500 transition"
        >
          Archive
        </button>
        {user ? (
          <button
            onClick={goto('profile')}
            data-magnetic
            title="Your profile"
            className="flex items-center gap-2 rounded-full border border-accent-violet/50 bg-accent-violet/10 backdrop-blur pl-1.5 pr-4 py-1 text-[11px] text-white hover:bg-accent-violet/20 transition"
          >
            <span className="w-6 h-6 rounded-full bg-accent-violet/80 text-ink font-bold flex items-center justify-center text-[10px]">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            {user.username}
          </button>
        ) : (
          <button
            onClick={goto('auth')}
            data-magnetic
            className="rounded-full bg-accent-violet/85 px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] font-bold text-ink hover:bg-accent-violet transition"
          >
            Sign in
          </button>
        )}
      </nav>

      {/* Скрол контейнер */}
      <div ref={scrollRef} className="absolute inset-0 z-20 overflow-y-auto overflow-x-hidden">
        <div ref={revealRootRef}>
          {/* ── 0 HERO ── */}
          <section ref={setSectionRef(0)} className="relative h-screen flex flex-col items-center justify-center px-6">
            <div ref={heroTitleRef} className="will-change-transform">
              <HeadlineReveal text="CHORUS" />
            </div>
            <p
              ref={heroSubRef}
              className="mt-4 font-body text-sm md:text-base text-gray-400 tracking-[0.25em] uppercase text-center will-change-transform"
            >
              Your voice becomes the brush
            </p>
            <div className="absolute bottom-10 flex flex-col items-center gap-2 text-gray-500">
              <span className="text-[10px] tracking-[0.4em] uppercase">Scroll</span>
              <span className="block h-8 w-px bg-gradient-to-b from-gray-500 to-transparent glow-pulse" />
            </div>
          </section>

          {/* ── 1 ABOUT — партикали ляво, текст дясно ── */}
          <section
            ref={setSectionRef(1)}
            className="relative flex items-center px-6 md:px-16 py-24 bg-gradient-to-b from-transparent via-ink/50 to-ink/75 overflow-hidden"
          >
            {/* Ghost надпис зад съдържанието */}
            <span
              data-parallax="0.16"
              className="text-ghost-outline absolute -left-8 top-1/2 -translate-y-1/2 font-display font-extrabold leading-none whitespace-nowrap will-change-transform"
              style={{ fontSize: '16vw' }}
            >
              CHORUS
            </span>
            <div className={`relative z-10 w-full max-w-lg ${sideClass('right')}`}>
              <div className="text-[11px] tracking-[0.4em] uppercase text-gray-500 mb-6" data-reveal>
                What is Chorus
              </div>
              <LineReveal
                text="A canvas painted with the body you already have."
                className="font-display text-3xl md:text-5xl font-extrabold text-white leading-tight"
              />
              <div data-reveal>
                <p className="mt-6 text-sm md:text-base text-gray-400 leading-relaxed">
                  Chorus turns your voice, facial expression and hand gestures into a living
                  particle painting — no mouse required. Smile and the palette warms. Speak a
                  color and the ink obeys. Open your palm and the particles scatter like light.
                </p>
              </div>
              <div className="mt-10 space-y-5" data-reveal-stagger>
                {ABOUT_POINTS.map((p) => (
                  <div key={p.label} className="border-l border-ink-line pl-4">
                    <div className="text-sm font-display font-bold text-gray-200">{p.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── 2 MODES — партикали дясно, компактен grid ляво ── */}
          <section
            ref={setSectionRef(2)}
            className="relative flex items-center px-6 md:px-16 py-16 bg-gradient-to-b from-transparent via-ink/50 to-ink/75 overflow-hidden"
          >
            <span
              data-parallax="0.1"
              className="text-ghost-outline absolute right-0 top-6 font-display font-extrabold leading-none will-change-transform"
              style={{ fontSize: '11vw' }}
            >
              PLAY
            </span>
            <div className={`relative z-10 w-full max-w-2xl ${sideClass('left')}`}>
              <div className="text-[11px] tracking-[0.4em] uppercase text-gray-500 mb-8" data-reveal>
                Choose your mode
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-reveal-stagger>
                <ModePanel
                  wide
                  index="01"
                  title="SOLO"
                  tagline="Create your artwork"
                  accent="violet"
                  copy="Paint alone with a full toolbar while your emotions, voice and gestures bend the particles around every stroke."
                  onClick={goto('solo')}
                />
                <ModePanel
                  index="02"
                  title="COLLECTIVE"
                  tagline="Join the chorus"
                  accent="cyan"
                  copy="A shared canvas with live cameras — or the Game Arena with timed drawing battles, points and an AI judge."
                  onClick={goto('collective')}
                />
                <ModePanel
                  index="03"
                  title="MOOD CHECK"
                  tagline="See your mood as light"
                  accent="violet"
                  copy="Watch particles become a face that mirrors your mood — or your own face rebuilt from thousands of points of light."
                  onClick={goto('moodcheck')}
                />
                <ModePanel
                  index="04"
                  title="WEBFORGE"
                  tagline="Draw your website"
                  accent="cyan"
                  copy="Sketch a layout and AI turns it into a working site: frontend, backend and hosting in one."
                  onClick={goto('webforge')}
                />
                <ModePanel
                  index="05"
                  title="SCULPT"
                  tagline="Draw in three dimensions"
                  accent="violet"
                  copy="Draw in mid-air, sculpt mountains, paint forests — then export to GLB, STL or straight to AR."
                  onClick={goto('sculpt')}
                />
              </div>
            </div>
          </section>

          {/* ── 3 INSTRUMENTS — партикали ляво, списък дясно ── */}
          <section ref={setSectionRef(3)} className="relative px-6 md:px-16 py-20 bg-ink/70 overflow-hidden">
            <span
              data-parallax="0.14"
              className="text-ghost-outline absolute -left-4 bottom-0 font-display font-extrabold leading-none will-change-transform"
              style={{ fontSize: '12vw' }}
            >
              SOUND
            </span>
            <div className={`relative z-10 w-full max-w-xl ${sideClass('right')}`}>
              <div className="text-[11px] tracking-[0.4em] uppercase text-gray-500 mb-12" data-reveal>
                The instruments
              </div>
              <ul className="border-y border-ink-line divide-y divide-ink-line" data-reveal-stagger>
                {INSTRUMENTS.map((it) => (
                  <li
                    key={it.n}
                    className="group relative flex items-baseline gap-6 py-6 px-2 transition-colors duration-500 hover:bg-ink-soft/40 overflow-hidden"
                  >
                    {/* Ghost цифра, която изплува при hover */}
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 font-display font-extrabold text-6xl text-white/0 group-hover:text-white/[0.06] scale-75 group-hover:scale-100 transition-all duration-500 select-none pointer-events-none">
                      {it.n}
                    </span>
                    <span className="text-[11px] text-gray-600 font-body w-8 shrink-0">{it.n}</span>
                    <span className="instrument-name font-display text-xl md:text-2xl font-extrabold w-32 shrink-0 text-gray-300">
                      {it.name}
                    </span>
                    <span className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors duration-500">
                      {it.desc}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── 4 FOOTER ── */}
          <footer ref={setSectionRef(4)} className="relative px-6 md:px-16 pt-16 pb-8 bg-ink/90 border-t border-ink-line overflow-hidden">
            {/* Watermark */}
            <span
              data-parallax="0.08"
              className="text-ghost-outline absolute left-1/2 -translate-x-1/2 -bottom-6 font-display font-extrabold leading-none whitespace-nowrap will-change-transform"
              style={{ fontSize: '19vw' }}
            >
              CHORUS
            </span>
            <div className="relative z-10 max-w-5xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10" data-reveal-stagger>
                {/* Колона 1 — бранд */}
                <div>
                  <div className="font-display font-extrabold text-2xl text-white tracking-tight">
                    CHORUS
                  </div>
                  <p className="mt-3 text-xs text-gray-500 leading-relaxed max-w-[26ch]">
                    Collaborative generative art — painted with your voice, face and hands.
                  </p>
                  <p className="mt-4 text-[11px] text-gray-600">
                    Camera + microphone required for live painting.
                  </p>
                </div>

                {/* Колона 2 — режими */}
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mb-4">Explore</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {[
                      ['Solo', 'solo'], ['Collective', 'collective'], ['Mood Check', 'moodcheck'],
                      ['WebForge', 'webforge'], ['Sculpt', 'sculpt'], ['Compete', 'compete'],
                      ['Archive', 'gallery'], ['Profile', 'profile'],
                    ].map(([label, screen]) => (
                      <button
                        key={screen}
                        onClick={goto(screen)}
                        className="text-left text-xs text-gray-400 hover:text-white transition"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Колона 3 — хакатон + автор */}
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-gray-500 mb-4">About this project</div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Built for the <span className="text-accent-violet font-bold">Hack the Arts</span> hackathon.
                  </p>
                  <p className="mt-3 text-xs text-gray-400">
                    Created by <span className="text-white font-bold">Viktor Nedev</span>
                  </p>
                  <a
                    href="mailto:viktornedev08@gmail.com"
                    className="mt-1 inline-block text-xs text-accent-cyan hover:underline"
                  >
                    viktornedev08@gmail.com
                  </a>
                </div>
              </div>

              <div className="mt-12 pt-5 border-t border-ink-line flex flex-col sm:flex-row items-center justify-between gap-2">
                <span className="text-[11px] text-gray-600">© 2026 CHORUS. All rights reserved.</span>
                <span className="text-[11px] text-gray-700">Made with voice, gestures & a lot of particles ✦</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
