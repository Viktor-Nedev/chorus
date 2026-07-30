// Съответствие „глиф в кода → изрязана иконка от sprite листа".
// Ключът е самото емоджи/символ, който вече стои в кода, така че компонентите
// не се променят структурно — само рендерът минава през <Icon glyph={…} />.
// Липсващ ключ = показва се оригиналното емоджи (нищо не се чупи).

export const ICON_MAP = {
  // ── Core / глобални ──
  '📖': 'core-00.png',   // handbook
  '👁': 'core-01.png',   // camera toggle
  '🎙': 'core-02.png',   // voice commands
  '🗣': 'core-03.png',   // voice paint
  '🎭': 'core-04.png',   // emotion / mood / impostor
  '⚡': 'core-05.png',   // smooth / generate
  '⚠': 'core-06.png',   // warning
  '🔔': 'core-07.png',   // notifications
  '🔍': 'core-08.png',   // search / zoom / analyze
  '🗑': 'core-09.png',   // clear
  '💾': 'core-10.png',   // save
  '⬇': 'core-11.png',   // download / export
  '📥': 'core-12.png',   // download zip
  '🌍': 'core-13.png',   // publish
  '🖥': 'core-14.png',   // desktop
  '💻': 'core-15.png',   // tablet
  '📱': 'core-16.png',   // mobile
  '🖱': 'core-17.png',   // mouse
  '⚙': 'core-18.png',   // settings
  '🔇': 'core-19.png',   // mute
  '📷': 'core-20.png',   // camera
  '📸': 'core-21.png',   // photo taken
  '🎬': 'core-22.png',   // capture
  '🖧': 'core-23.png',   // social

  // ── Solo — инструменти ──
  '🎆': 'solo-00.png',   // chorus particle brush
  '🖐': 'solo-01.png',   // hand draw
  '✏': 'solo-02.png',   // pencil / brush / pictionary
  '／': 'solo-03.png',   // lines category
  '◇': 'solo-04.png',   // shapes category
  '✦': 'solo-05.png',   // burst / rendered / point cloud
  '🪣': 'solo-06.png',   // fill
  '✍': 'solo-07.png',   // text
  '⛶': 'solo-08.png',   // select / fullscreen
  '💧': 'solo-09.png',   // eyedropper
  '⌫': 'solo-10.png',   // eraser
  '🌊': 'solo-11.png',   // wavy line
  '➔': 'solo-12.png',   // arrow line
  '↯': 'solo-13.png',   // zigzag line
  '╱': 'solo-14.png',   // straight line
  '○': 'solo-15.png',   // circle
  '□': 'solo-16.png',   // rectangle
  '▭': 'solo-17.png',   // frame / rounded rect
  '△': 'solo-18.png',   // triangle
  '★': 'solo-19.png',   // star
  '⬡': 'solo-20.png',   // hexagon
  '⬠': 'solo-21.png',   // pentagon
  '♥': 'solo-23.png',   // heart (filled)
  '◆': 'solo-24.png',   // diamond solid
  '◯': 'solo-25.png',   // large circle outline
  '▱': 'solo-26.png',   // plane / trapezoid
  '✕': 'solo-27.png',   // close
  '✚': 'solo-28.png',   // add
  '＋': 'solo-29.png',   // plus
  '✨': 'solo-31.png',   // neon / sparkle
  '↶': 'solo-35.png',   // undo
  '↷': 'solo-36.png',   // redo

  // ── Mirror — Camera FX / аватари / запис ──
  '🧊': 'mirror-01.png', // cube (3D)
  '▦': 'mirror-07.png',  // wireframe grid
  '⣿': 'mirror-08.png',  // halftone dots
  '📺': 'mirror-10.png', // glitch
  '◐': 'mirror-11.png',  // solid shading / half
  '🌗': 'mirror-12.png', // duotone
  '🗺': 'mirror-14.png', // contour
  '▩': 'mirror-15.png',  // mosaic / pixelate
  '◎': 'mirror-16.png',  // torus / ring
  '🌈': 'mirror-17.png', // spectral rainbow
  '⬚': 'mirror-18.png',  // lens frame / artboard
  '🌡': 'mirror-21.png', // thermal heatmap
  '●': 'mirror-23.png',  // record
  '⏸': 'mirror-24.png',  // pause
  '■': 'mirror-25.png',  // stop
  '🖼': 'mirror-27.png', // image / posterize / gallery

  // ── Collective ──
  '💬': 'collective-00.png', // chat
  '❤': 'collective-01.png',  // heart reaction
  '👏': 'collective-02.png',  // clap / thumbs up
  '⚔': 'collective-03.png',  // battle swords
  '🖌': 'collective-04.png',  // brushes

  // ── Arena ──
  '🥈': 'arena-00.png',  // silver
  '👑': 'arena-01.png',  // crown / max level
  '🏆': 'arena-02.png',  // trophy
  '🥇': 'arena-03.png',  // gold
  '🎯': 'arena-06.png',  // target / move & view

  // ── WebForge ──
  '📄': 'webforge-01.png', // page
  '▶': 'webforge-06.png',  // play / video
  '⏺': 'webforge-07.png',  // button
  '📝': 'webforge-08.png',  // form
  '📊': 'webforge-14.png',  // analytics / leaderboard
  '✓': 'webforge-16.png',   // check
  '↻': 'webforge-18.png',   // refresh / re-read
  '↗': 'webforge-19.png',   // share / open out

  // ── Sculpt ──
  '−': 'sculpt-01.png',   // collapse / remove
  '〰': 'sculpt-02.png',   // tube / smooth
  '✋': 'sculpt-04.png',   // open palm / grab
  '✒': 'sculpt-06.png',   // 3D pen
  '▧': 'sculpt-12.png',   // primitive cube / hatched
  '↔': 'sculpt-16.png',   // move gizmo
  '⟳': 'sculpt-17.png',   // rotate
  '⤢': 'sculpt-18.png',   // scale gizmo
  '⌂': 'sculpt-19.png',   // frame all / home
  '💡': 'sculpt-24.png',  // suggestion / light
  '⛰': 'sculpt-25.png',   // terrain / environment
  '⊹': 'sculpt-27.png',   // snap / grid
  '🪞': 'sculpt-28.png',  // mirror / symmetry

  // ── Social ──
  '♡': 'social-01.png',   // like (outline)
  '⭐': 'social-06.png',  // star
  '🔥': 'social-07.png',  // fire / trending

  // ── Profile ──
  '👤': 'profile-00.png', // user
  '🌱': 'profile-01.png', // level novice
  '🪙': 'profile-02.png', // points / XP
  '✎': 'profile-06.png',  // edit

  // ── Emotions & жестове ──
  '😊': 'emotion-00.png',
  '😢': 'emotion-01.png',
  '😠': 'emotion-02.png',
  '😮': 'emotion-03.png',
  '😐': 'emotion-04.png',
  '😂': 'emotion-05.png',
  '👉': 'emotion-06.png',
  '✌': 'emotion-09.png',
  '👋': 'emotion-11.png',
  '🤚': 'emotion-14.png',

  // WebForge ползва буквата „T" за текстовия инструмент — сочи към същата
  // иконка като Solo Text, за да не остава гола буква сред иконките.
  'T': 'solo-07.png',

  // ── UI глифове ──
  '←': 'ui-02.png',
  '→': 'ui-03.png',
  '▲': 'ui-08.png',
  '▼': 'ui-09.png',
  '‹': 'ui-10.png',
  '›': 'ui-11.png',
  '◀': 'ui-10.png',
  '▸': 'ui-11.png',
  '▾': 'ui-09.png',
  '☰': 'ui-16.png',
  // ── Втори лист: останалите 67 (файловете носят името на slug-а) ──
  // solo
  '┄': 'solo-line-dashed.png',                                        // Dashed line
  '➤': 'solo-shape-arrow.png',                                        // Arrow shape
  '🖊': 'solo-pen-pen.png',                                        // Pen style — thin crisp ink
  '🖍': 'solo-pen-marker.png',                                        // Marker pen style
  '🖋': 'solo-pen-calligraphy.png',                                        // Calligraphy pen style
  '💨': 'solo-pen-spray.png',                                        // Spray pen style
  '⟲': 'solo-rotate-left.png',                                        // Rotate the artboard counter-clockwise
  '〜': 'solo-raw-input.png',                                        // Raw (un-smoothed) hand input
  '🧰': 'solo-toolbox.png',                                        // Brushes & tools handbook section
  '🎨': 'solo-palette.png',                                        // Basics section; Draw game; 2D Painting category; col
  // mirror
  '⬛': 'fx-voxel.png',                                        // Camera FX — Voxel
  '🛰': 'fx-hologram.png',                                        // Camera FX — Hologram
  '💠': 'fx-neon.png',                                        // Camera FX — Neon
  '🥽': 'fx-nightvision.png',                                        // Camera FX — Night vision
  '☢': 'fx-xray.png',                                        // Camera FX — X-ray
  '🎞': 'fx-sepia.png',                                        // Camera FX — Sepia
  '🔻': 'fx-negative.png',                                        // Camera FX — Negative / invert
  '♪': 'mirror-talk-notes.png',                                        // Talk effect — musical notes
  '🐱': 'avatar-cat.png',                                        // Particle avatar — Cat
  '👽': 'avatar-alien.png',                                        // Particle avatar — Alien
  '💀': 'avatar-skull.png',                                        // Particle avatar — Skull
  '🤖': 'avatar-robot.png',                                        // Particle avatar — Robot; AI judge
  '😈': 'avatar-devil.png',                                        // Particle avatar — Devil
  '👻': 'avatar-ghost.png',                                        // Particle avatar — Ghost
  '👅': 'avatar-tongue.png',                                        // Avatar accessory — tongue out
  // collective
  '🎲': 'collective-random.png',                                        // Random theme; Mixed game mode
  // arena
  '🏟': 'arena-stadium.png',                                        // Game Arena lobby / section
  '🧠': 'arena-memory.png',                                        // Memory game — memorise then draw
  '🙈': 'arena-blind.png',                                        // Blind game — invisible ink; hide password
  '🕵': 'arena-detective.png',                                        // Impostor caught
  '🥉': 'arena-medal-bronze.png',                                        // 3rd place
  // sculpt
  '🏺': 'sculpt-lathe.png',                                        // Lathe — revolve a profile
  '⬒': 'sculpt-extrude.png',                                        // Extrude — pull a shape into a solid
  '🌲': 'sculpt-scatter-trees.png',                                        // Scatter — trees
  '🪨': 'sculpt-scatter-rocks.png',                                        // Scatter — rocks
  '🌿': 'sculpt-scatter-grass.png',                                        // Scatter — grass
  '🧹': 'sculpt-scatter-erase.png',                                        // Scatter eraser
  '◉': 'sculpt-live.png',                                        // Live performance mode (off)
  '🔴': 'sculpt-live-on.png',                                        // Live performance mode (on) / recording
  '⬮': 'sculpt-primitive-cylinder.png',                                        // Primitive — Cylinder
  '✾': 'sculpt-primitive-knot.png',                                        // Primitive — Torus knot
  '▪': 'sculpt-item-generic.png',                                        // Scene item — generic kind
  '◳': 'sculpt-view-persp.png',                                        // Perspective view
  '◱': 'sculpt-ortho.png',                                        // Orthographic / perspective toggle
  '⧉': 'sculpt-duplicate.png',                                        // Duplicate object; Guides toggle
  // webforge
  '◈': 'wf-component.png',                                        // Component library placeholder
  '🏔': 'wf-hero.png',                                        // Hero block type
  '▢': 'wf-card.png',                                        // Card block type
  '▁': 'wf-footer.png',                                        // Footer block type
  '▮': 'wf-sidebar.png',                                        // Sidebar block type
  '🔄': 'wf-refresh-preview.png',                                        // Refresh the preview iframe
  '🚀': 'wf-deploy.png',                                        // Deploy section header
  '🐳': 'wf-docker.png',                                        // Run locally in Docker
  '⏹': 'wf-stop-container.png',                                        // Stop the running container
  '🤫': 'wf-silent.png',                                        // Voice paint idle — waiting for sound
  // social
  '🆕': 'social-new.png',                                        // Feed sort — newest first
  '♻': 'social-remix.png',                                        // Remix / build on someone’s artwork
  '🏁': 'social-challenges.png',                                        // Challenges tab; Contender achievement
  // profile
  '💜': 'profile-crowd-favorite.png',                                        // Achievement — Crowd Favorite
  '💎': 'profile-high-scorer.png',                                        // Achievement — High Scorer
  '🏃': 'profile-marathon.png',                                        // Achievement — Arena Marathon
  '🗳': 'profile-votes.png',                                        // Votes received stat
  // emotion
  '🧘': 'emotion-focused.png',                                        // Emotion — focused / calm
  '✊': 'gesture-fist.png',                                        // Closed fist — condense / draw
  // ui
  '↕': 'ui-sort.png',                                        // Sort order toggle
  '⠿': 'ui-drag-handle.png',                                        // Drag handle of the floating live panel
  '▍': 'ui-caret.png',                                        // Typing caret in the poem overlay
};

// Колко от глифовете имат картинка (за отчет/дебъг)
export const MAPPED_COUNT = Object.keys(ICON_MAP).length;
