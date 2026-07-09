export const EMOTION_CONFIGS = {
  happy: {
    color: { r: 255, g: 215, b: 0, a: 255 }, // злато
    colorAlt: { r: 255, g: 107, b: 107, a: 255 }, // корал
    shape: 'circle',
    baseSize: 16,
    movementStyle: 'wave',
    gravityToward: [],
    gravityAway: ['angry'],
    emoji: '😊',
    label: 'Happy',
  },
  sad: {
    color: { r: 74, g: 144, b: 217, a: 255 }, // синьо
    colorAlt: { r: 123, g: 104, b: 238, a: 255 }, // лилаво
    shape: 'circle',
    baseSize: 6,
    movementStyle: 'fall',
    gravityToward: ['sad'],
    gravityAway: [],
    emoji: '😢',
    label: 'Sad',
  },
  angry: {
    color: { r: 255, g: 45, b: 45, a: 255 }, // червено
    colorAlt: { r: 255, g: 102, b: 0, a: 255 }, // оранжево
    shape: 'spike',
    baseSize: 12,
    movementStyle: 'chaotic',
    gravityToward: [],
    gravityAway: ['happy'],
    emoji: '😠',
    label: 'Angry',
  },
  surprised: {
    color: { r: 0, g: 255, b: 255, a: 255 }, // cyan
    colorAlt: { r: 255, g: 255, b: 255, a: 255 }, // бяло
    shape: 'burst',
    baseSize: 14,
    movementStyle: 'explode',
    gravityToward: [],
    gravityAway: [],
    emoji: '😮',
    label: 'Surprised',
  },
  neutral: {
    color: null, // използва baseColor на потребителя
    colorAlt: null,
    shape: 'circle',
    baseSize: 10,
    movementStyle: 'wander',
    gravityToward: [],
    gravityAway: [],
    emoji: '😐',
    label: 'Neutral',
  },
  focused: {
    color: { r: 100, g: 255, b: 180, a: 255 }, // мента
    colorAlt: { r: 50, g: 200, b: 150, a: 255 },
    shape: 'triangle',
    baseSize: 9,
    movementStyle: 'orbit',
    gravityToward: [],
    gravityAway: [],
    emoji: '🧘',
    label: 'Focused',
  },
};

export const EMOTION_HEX = {
  happy: '#FFD700',
  sad: '#4A90D9',
  angry: '#FF2D2D',
  surprised: '#00FFFF',
  neutral: '#9696B4',
  focused: '#64FFB4',
};

export const GESTURE_LABELS = {
  OPEN_PALM: { emoji: '🖐', label: 'Open Palm — scatter' },
  FIST: { emoji: '✊', label: 'Fist — condense' },
  PEACE: { emoji: '✌️', label: 'Peace — split' },
  POINT: { emoji: '👉', label: 'Point — line' },
  NEUTRAL: { emoji: '🤚', label: 'Hand detected' },
  NO_HAND: { emoji: '·', label: 'No hand' },
};
