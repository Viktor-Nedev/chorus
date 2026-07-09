const express = require('express');
const rateLimit = require('express-rate-limit');
const { generatePoem } = require('../services/geminiService');

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true });

router.post('/', limiter, async (req, res) => {
  try {
    const poem = await generatePoem(req.body || {});
    res.json({ poem });
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ error: 'Could not generate poem' });
  }
});

module.exports = router;
