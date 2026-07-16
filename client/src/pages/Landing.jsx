import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import Lenis from 'lenis';
import { HeroScene } from '../components/landing/HeroScene';
import { useMagnetic } from '../hooks/useMagnetic';
import { useArtworkStore } from '../hooks/useArtworkStore';

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
      duration: 1.1,
      stagger: 0.055,
      ease: 'power4.out',
      delay: 0.25,
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
        <span key={i} aria-hidden="true" className="char-reveal">
          {ch}
        </span>
      ))}
    </h1>
  );
}

function ModePanel({ index, title, tagline, copy, accent, onClick }) {
  const magneticRef = useMagnetic(0.12);
  return (
    <button
      ref={magneticRef}
      onClick={onClick}
      data-magnetic
      className="energy-border group relative w-full rounded-2xl border border-ink-line bg-ink-soft/40 backdrop-blur p-8 text-left transition-colors duration-500 hover:bg-ink-soft/70"
    >
      <div className="text-[11px] tracking-[0.4em] text-gray-500 font-body">{index}</div>
      <div className="mt-4 font-display text-2xl md:text-3xl font-extrabold text-white">
        {title}
      </div>
      <div
        className="mt-2 text-[11px] uppercase tracking-[0.3em]"
        style={{ color: `rgb(var(--accent-${accent}) / 0.8)` }}
      >
        {tagline}
      </div>
      <p className="mt-4 text-sm text-gray-400 leading-relaxed">{copy}</p>
      <div className="mt-6 flex items-center gap-3 text-xs tracking-[0.25em] uppercase text-gray-500 group-hover:text-white transition-colors duration-500">
        Enter <span className="inline-block transition-transform duration-500 group-hover:translate-x-2">→</span>
      </div>
    </button>
  );
}

// side: 'left' | 'right' — коя половина заема ТЕКСТОВОТО съдържание
// (партикъл-скулптурата винаги е в срещуположната половина, вижте
// sideSign() в ParticleSculpture.jsx — редът трябва да остане обратен на него).
function sideClass(side) {
  return side === 'left' ? 'mr-auto text-left' : 'ml-auto text-left';
}

export function Landing({ navigate }) {
  const scrollRef = useRef(null); // Lenis scroll container
  // sectionProgressRef: непрекъснат "секция-индекс" 0..5 (Hero/About/Modes/
  // Instruments/Gallery/Footer) — четен per-frame от HeroScene, за да движи
  // партикалите надолу/встрани и да сменя формата им според активната секция.
  const scrollProgressRef = useRef(0);
  const sectionRefs = useRef([]);
  const setSectionRef = (i) => (el) => {
    sectionRefs.current[i] = el;
  };
  const revealRootRef = useRef(null);
  const { fetchGallery } = useArtworkStore();
  const [preview, setPreview] = useState([]);

  // Lenis smooth scroll — жив само докато Landing е mount-нат
  useEffect(() => {
    const wrapper = scrollRef.current;
    if (!wrapper) return;
    const lenis = new Lenis({
      wrapper,
      content: wrapper.firstElementChild,
      duration: 1.15,
      smoothWheel: true,
    });

    lenis.on('scroll', ({ scroll }) => {
      const sections = sectionRefs.current.filter(Boolean);
      if (!sections.length) return;
      let idx = sections.length - 1; // ако скролът е подминал всички секции
      for (let i = 0; i < sections.length; i++) {
        const top = sections[i].offsetTop;
        const height = sections[i].offsetHeight || 1;
        if (scroll < top + height) {
          idx = i + Math.min(1, Math.max(0, (scroll - top) / height));
          break;
        }
      }
      const maxIdx = sections.length - 1;
      scrollProgressRef.current = maxIdx > 0 ? (idx / maxIdx) * 5 : 0;
    });

    let rafId;
    const raf = (time) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  // Staggered section reveals при скрол (IntersectionObserver + GSAP)
  useEffect(() => {
    const sections = revealRootRef.current?.querySelectorAll('[data-reveal]');
    if (!sections?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.to(entry.target, {
              y: 0,
              opacity: 1,
              duration: 1,
              ease: 'power3.out',
            });
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );
    sections.forEach((s) => {
      gsap.set(s, { y: 48, opacity: 0 });
      io.observe(s);
    });
    return () => io.disconnect();
  }, [preview.length]);

  // Gallery preview — последните 4 творби
  useEffect(() => {
    let cancelled = false;
    fetchGallery()
      .then((arts) => {
        if (!cancelled) setPreview(arts.slice(0, 4));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchGallery]);

  const goto = useCallback((screen) => () => navigate(screen), [navigate]);

  return (
    <div className="relative h-full w-full bg-ink">
      {/* WebGL фон — ФИКСИРАН за целия сайт (не само hero-то). Партикалите
          пътуват надолу, редуват страна ляво/дясно и сменят форма/цвят
          според активната секция. */}
      <HeroScene scrollProgressRef={scrollProgressRef} className="fixed inset-0 z-0" />

      {/* Скрол контейнер */}
      <div ref={scrollRef} className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden">
        <div ref={revealRootRef}>
          {/* ── HERO (партикалите центрирани) ── */}
          <section ref={setSectionRef(0)} className="relative h-screen flex flex-col items-center justify-center px-6">
            <HeadlineReveal text="CHORUS" />
            <p className="mt-4 font-body text-sm md:text-base text-gray-400 tracking-[0.25em] uppercase text-center">
              Your voice becomes the brush
            </p>
            <div className="absolute bottom-10 flex flex-col items-center gap-2 text-gray-500">
              <span className="text-[10px] tracking-[0.4em] uppercase">Scroll</span>
              <span className="block h-8 w-px bg-gradient-to-b from-gray-500 to-transparent glow-pulse" />
            </div>
          </section>

          {/* ── ABOUT (нова) — партикали ляво, текст дясно ── */}
          <section
            ref={setSectionRef(1)}
            className="relative min-h-screen flex items-center px-6 md:px-16 py-24 bg-gradient-to-b from-transparent via-ink/50 to-ink/75"
          >
            <div className={`relative z-10 w-full max-w-lg ${sideClass('right')}`} data-reveal>
              <div className="text-[11px] tracking-[0.4em] uppercase text-gray-500 mb-6">
                What is Chorus
              </div>
              <h2 className="font-display text-3xl md:text-5xl font-extrabold text-white leading-tight">
                A canvas painted with the body you already have.
              </h2>
              <p className="mt-6 text-sm md:text-base text-gray-400 leading-relaxed">
                Chorus turns your voice, facial expression and hand gestures into a living
                particle painting — no mouse required. Smile and the palette warms. Speak a
                color and the ink obeys. Open your palm and the particles scatter like light.
              </p>
              <div className="mt-10 space-y-5">
                {ABOUT_POINTS.map((p) => (
                  <div key={p.label} className="border-l border-ink-line pl-4">
                    <div className="text-sm font-display font-bold text-gray-200">{p.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── MODES — партикали дясно, панели ляво ── */}
          <section
            ref={setSectionRef(2)}
            className="relative min-h-screen flex items-center px-6 md:px-16 py-24 bg-gradient-to-b from-transparent via-ink/50 to-ink/75"
          >
            <div className={`relative z-10 w-full max-w-md ${sideClass('left')}`} data-reveal>
              <div className="text-[11px] tracking-[0.4em] uppercase text-gray-500 mb-8">
                Choose your mode
              </div>
              <div className="flex flex-col gap-5">
                <ModePanel
                  index="01"
                  title="SOLO"
                  tagline="Create your artwork"
                  accent="violet"
                  copy="Paint alone with a full toolbar — brushes, shapes, fills — while your emotions, voice and gestures bend the particles around every stroke."
                  onClick={goto('solo')}
                />
                <ModePanel
                  index="02"
                  title="COLLECTIVE"
                  tagline="Join the chorus"
                  accent="cyan"
                  copy="Enter a shared session with up to seven others. Every voice is a swarm of light; the artwork belongs to everyone in the room."
                  onClick={goto('collective')}
                />
                <ModePanel
                  index="03"
                  title="MOOD CHECK"
                  tagline="See your mood as light"
                  accent="violet"
                  copy="Turn on your camera and watch particles become a face that mirrors your mood in real time — or flip to Mirror and see your own face rebuilt from sixteen thousand points of light."
                  onClick={goto('moodcheck')}
                />
                <ModePanel
                  index="04"
                  title="WEBFORGE"
                  tagline="Draw your website"
                  accent="cyan"
                  copy="Sketch a layout — frames, forms, buttons — and AI turns it into a working site: frontend, backend and hosting in one. Download it or run it in its own container."
                  onClick={goto('webforge')}
                />
                <ModePanel
                  index="05"
                  title="SCULPT"
                  tagline="Draw in three dimensions"
                  accent="violet"
                  copy="Draw tubes in mid-air, spin vase profiles into solid bodies, sculpt mountain ranges and paint forests onto them — then export your world as GLB, OBJ, STL or straight to AR."
                  onClick={goto('sculpt')}
                />
              </div>
            </div>
          </section>

          {/* ── INSTRUMENTS — партикали ляво, списък дясно ── */}
          <section ref={setSectionRef(3)} className="relative px-6 md:px-16 py-28 bg-ink/70">
            <div className={`relative z-10 w-full max-w-xl ${sideClass('right')}`} data-reveal>
              <div className="text-[11px] tracking-[0.4em] uppercase text-gray-500 mb-12">
                The instruments
              </div>
              <ul className="divide-y divide-ink-line border-y border-ink-line">
                {INSTRUMENTS.map((it) => (
                  <li
                    key={it.n}
                    className="group flex items-baseline gap-6 py-6 transition-colors duration-500 hover:bg-ink-soft/40 px-2"
                  >
                    <span className="text-[11px] text-gray-600 font-body w-8 shrink-0">{it.n}</span>
                    <span className="font-display text-xl md:text-2xl font-extrabold text-gray-300 group-hover:text-white transition-colors duration-500 w-32 shrink-0">
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

          {/* ── GALLERY PREVIEW — партикали дясно, грид ляво ── */}
          {preview.length > 0 && (
            <section ref={setSectionRef(4)} className="relative px-6 md:px-16 py-28 bg-ink/70">
              <div className={`relative z-10 w-full max-w-lg ${sideClass('left')}`} data-reveal>
                <div className="flex items-baseline justify-between mb-10">
                  <div className="text-[11px] tracking-[0.4em] uppercase text-gray-500">
                    Latest works
                  </div>
                  <button
                    onClick={goto('gallery')}
                    data-magnetic
                    className="text-xs tracking-[0.25em] uppercase text-gray-400 hover:text-white transition"
                  >
                    Archive →
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {preview.map((art) => (
                    <button
                      key={art.id}
                      onClick={goto('gallery')}
                      className="group aspect-square overflow-hidden rounded-lg border border-ink-line bg-ink-soft"
                    >
                      {art.imageData && (
                        <img
                          src={art.imageData}
                          alt={art.title}
                          className="w-full h-full object-cover grayscale-[0.6] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── FOOTER — партикали ляво, текст дясно ── */}
          <footer ref={setSectionRef(5)} className="relative px-6 md:px-16 py-16 bg-ink/85 border-t border-ink-line">
            <div className={`relative z-10 w-full max-w-lg ${sideClass('right')} flex flex-col md:flex-row items-start md:items-center justify-between gap-6`}>
              <div className="font-display font-extrabold text-xl text-white tracking-tight">
                CHORUS
              </div>
              <button
                onClick={goto('gallery')}
                data-magnetic
                className="text-xs tracking-[0.25em] uppercase text-gray-400 hover:text-white transition"
              >
                Archive →
              </button>
              <div className="text-[11px] text-gray-600 tracking-wide">
                Camera + microphone required for live painting
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
