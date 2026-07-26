// Съдържание за InstructionsBook (наръчника) по режими. Всеки масив започва с
// { kind:'cover', title, subtitle, body[] }, следван от секции { n, title, icon,
// items:[[key, value]] }.

export const SOLO_PAGES = [
  {
    kind: 'cover', title: 'CHORUS', subtitle: 'Solo Field Guide',
    body: [
      'Paint with your mouse, your hand, your voice, and your emotions.',
      'Turn the pages with the arrows → or the buttons below.',
    ],
  },
  {
    n: '01', title: 'Basics', icon: '🎨',
    items: [
      ['👁 Camera + microphone', 'Turns on face, hand and sound input. Without it you can still draw with the mouse.'],
      ['🖐 Hand tracking', 'Toggle whether your hand is followed.'],
      ['↶ ↷ Undo / Redo', 'Or Ctrl+Z / Ctrl+Y.'],
      ['Clear · Save · Export', 'Clear the canvas, save to your gallery (optionally with a poem), or download PNG / JPG / WEBP.'],
      ['Zoom · Rotate · Size', 'Ctrl+scroll or 🔍 to zoom, ⟲⟳ to rotate, ⬚ to pick a centred artboard size.'],
    ],
  },
  {
    n: '02', title: 'Brushes & tools', icon: '🧰',
    items: [
      ['🎆 Chorus', 'A particle brush driven by your emotion and gestures. Leaves no stains.'],
      ['🖐️ Hand Draw', 'Paint with your hand, in 7 pen styles.'],
      ['✏️ Brush', 'A smooth freehand line with the mouse.'],
      ['／ Lines', 'Straight, wavy, dashed, arrow, zigzag — pick from the flyout.'],
      ['◇ Shapes', 'Circle, rectangle, triangle, star, hexagon, pentagon, diamond, heart, arrow.'],
      ['🪣 Fill · ✍️ Text · 💧 Eyedropper · ⌫ Eraser', 'Flood fill to the outline, place/dictate text, pick a colour, erase.'],
    ],
  },
  {
    n: '03', title: 'Hands & gestures', icon: '✋',
    items: [
      ['1 · Turn on 👁', 'Hand Draw and Voice paint need the camera / microphone.'],
      ['2 · Close your hand = draw', 'A closed hand lowers the pen.'],
      ['3 · Open palm (✋) = pause', 'Or say “stop”. Close it again to resume.'],
      ['⚡ Smooth', 'Smoothing toggle — removes hand tremble for a steadier line.'],
      ['🪞 Mirror', 'Mirrors every stroke across the vertical centre; glows while on.'],
    ],
  },
  {
    n: '04', title: 'Voice paint 🗣️', icon: '🗣️',
    items: [
      ['Steer with hand or cursor', 'Move your hand (or the mouse) to aim; speak or hum to release paint.'],
      ['Louder = thicker', 'Volume drives stroke weight and opacity; pitch shifts the colour.'],
      ['🎨 Paint / ✦ Burst', 'Paint flows a line; Burst explodes particles on a loud sound.'],
      ['🎨 Emotion colour (live)', 'Turn it on and the colour keeps following your mood.'],
    ],
  },
  {
    n: '05', title: 'Select, paste & images', icon: '⛶',
    items: [
      ['⛶ Select', 'Drag a box to lift a region — then move it or resize with the handles.'],
      ['Cut / Copy / Delete', 'Ctrl+X cut · Ctrl+C copy · Del delete · Enter places it, Esc cancels.'],
      ['🖼 Image', 'Import a picture from a file, or paste one with Ctrl+V.'],
      ['Resize on canvas', 'Drag the corner handles, then ✓ Place to stamp it down.'],
    ],
  },
  {
    n: '06', title: 'Voice commands 🎙', icon: '🎙',
    items: [
      ['Colours', '“red”, “gold”, “teal”, “magenta”, “silver”…'],
      ['Tools & shapes', '“brush”, “circle”, “heart”, “dashed”, “arrow”, “eraser”, “fill”.'],
      ['Pens', '“pencil”, “marker”, “calligraphy”, “spray”, “neon”.'],
      ['Text & emotion', '“text hello” places “hello” · “emotion colour” toggles the live mood colour.'],
      ['More', '“bigger / smaller”, “stop / draw”, “clear”, “save”.'],
    ],
  },
];

export const MIRROR_PAGES = [
  {
    kind: 'cover', title: 'MIRROR', subtitle: 'Field Guide',
    body: [
      'Your face becomes a living particle avatar — or the camera itself, transformed.',
      'Pick an avatar, add effects, record a clip, or take a photo with your voice.',
    ],
  },
  {
    n: '01', title: 'Avatars & mood', icon: '🪞',
    items: [
      ['Avatar picker', 'Real face, characters, or your own custom / drawn avatar.'],
      ['🎭 Emotion colour', 'Tints the avatar by your live emotion.'],
      ['Mood journal', 'Bottom-left tracks your emotions over the session.'],
      ['⛶ Present', 'Fullscreen the avatar to share into Zoom / Meet.'],
    ],
  },
  {
    n: '02', title: 'Camera FX', icon: '🌡',
    items: [
      ['Effects', 'Thermal, point cloud, voxel, hologram, wireframe, neon, spectral, night-vis, x-ray, sepia, negative, posterize, duotone, contour, mosaic, halftone, glitch.'],
      ['⬚ Lens', 'Frame a rectangle with your fingers — the effect only shows inside it.'],
      ['⛶ Fullscreen', 'The whole screen becomes the effect.'],
      ['Off', 'Returns to the particle avatar.'],
    ],
  },
  {
    n: '03', title: 'Voice commands 🗣', icon: '🗣',
    items: [
      ['📸 “take a photo”', 'Saves a snapshot to your Gallery — download it from there.'],
      ['Effect by name', '“thermal”, “point cloud”, “hologram”, “glitch”…'],
      ['“lens” / “fullscreen”', 'Switch how the effect is shown.'],
      ['“off”', 'Turn effects off. “record” / “stop” control clips.'],
    ],
  },
  {
    n: '04', title: 'Effects & capture', icon: '🎬',
    items: [
      ['♪ Talk effects', 'Notes / hearts / stars / sparks burst when you speak.'],
      ['✍ Finger draw', 'Draw in the air with your fingertip.'],
      ['● Rec', 'Record a webm clip (with mic) and save it to your archive.'],
      ['📷 Photo', 'Save a still to the gallery.'],
    ],
  },
];

export const COLLECTIVE_PAGES = [
  {
    kind: 'cover', title: 'COLLECTIVE', subtitle: 'Field Guide',
    body: [
      'Up to 8 people share one canvas — with live cameras of every artist.',
      'Draw together, chat, react, or play the Game Arena.',
    ],
  },
  {
    n: '01', title: 'Drawing together', icon: '🎨',
    items: [
      ['🖌 Tools', 'Brush, line, rectangle, circle, eraser — with free colour, size and opacity.'],
      ['✋ Hand · 🗣 Voice · 🎭 Emotion', 'Draw with your hand, paint with your voice, or let the colour follow your mood.'],
      ['🗑 Clear (host)', 'The host can clear the shared canvas.'],
      ['💬 Chat · reactions', 'Talk and drop ❤ 🔥 👏 reactions.'],
    ],
  },
  {
    n: '02', title: 'Draw Battle', icon: '⚔',
    items: [
      ['Hidden rounds', 'Everyone draws a theme on their own hidden canvas.'],
      ['Reveal at the end', 'Drawings appear only when time is up.'],
      ['Vote', 'Pick the best; the winner earns a battle win.'],
    ],
  },
  {
    n: '03', title: 'Game Arena', icon: '🏟',
    items: [
      ['Host picks the game', 'Choose Mixed, Pictionary, Impostor, Draw, Memory or Blind when creating the room.'],
      ['✏️ Pictionary', 'One person draws a secret word live; the rest guess in chat.'],
      ['🎭 Impostor', 'Everyone gets the word except a secret fake — then vote who it is.'],
      ['Points & podium', 'Win rounds, climb the leaderboard, points save to your profile.'],
    ],
  },
];

export const SCULPT_PAGES = [
  {
    kind: 'cover', title: 'SCULPT', subtitle: 'Field Guide',
    body: [
      'A 3D studio — build with primitives, a 3D pen, lathe, extrude and terrain.',
      'Light it, render it with bloom, or perform it live to sound and emotion.',
    ],
  },
  {
    n: '01', title: 'Build', icon: '🧊',
    items: [
      ['✚ Add', 'Drop primitives (cube, sphere, torus, knot…).'],
      ['✒ 3D Pen', 'Draw tubes in space — on surfaces, in the air, or with your hand.'],
      ['🏺 Lathe · ⬒ Extrude', 'Revolve or pull a drawn profile into a solid.'],
      ['⛰ Terrain · 🌲 Scatter', 'Sculpt hills and paint trees, rocks and grass.'],
    ],
  },
  {
    n: '02', title: 'Move & view', icon: '🎯',
    items: [
      ['Arrows = move', 'The X/Y/Z gizmo moves the selected object.'],
      ['Move / Rotate / Scale', 'Plus Local/World space and snapping.'],
      ['Views', 'Front / Right / Top / Perspective, Frame-all, Orthographic.'],
      ['Orbit / zoom / pan', 'Drag to orbit, scroll to zoom to the cursor, right-drag to pan.'],
    ],
  },
  {
    n: '03', title: 'Render & Live', icon: '✦',
    items: [
      ['Solid / Rendered / Wire', 'Rendered adds bloom so emissive materials glow.'],
      ['◉ Live', 'The sculpture pulses to sound and its palette follows your emotion.'],
      ['● Record', 'Capture the performance and save it to the gallery.'],
      ['⬇ Export', 'GLTF / OBJ / STL / PLY / USDZ / PNG.'],
    ],
  },
];

export const WEBFORGE_PAGES = [
  {
    kind: 'cover', title: 'WEBFORGE', subtitle: 'Field Guide',
    body: [
      'Draw a website — sketch boxes on a canvas and turn them into a real page.',
      'Instant wireframe preview, then generate with AI.',
    ],
  },
  {
    n: '01', title: 'Draw the layout', icon: '✏️',
    items: [
      ['Frames', 'Draw boxes for headers, sections, forms and more.'],
      ['Right panel', 'Tabs for content, style, backend and preview.'],
      ['Instant wireframe', 'A deterministic preview updates as you draw.'],
      ['Autosave', 'Your project is kept in local storage.'],
    ],
  },
  {
    n: '02', title: 'Generate & export', icon: '⚙',
    items: [
      ['AI generate', 'Turn the sketch into a real HTML/CSS page.'],
      ['Preview', 'See the live result in a sandboxed frame.'],
      ['Export', 'Download the generated site.'],
    ],
  },
];
