// Стартови скици — попълват страницата с рамки/текст/бутони, за да не се
// започва от бял лист. Всяка връща обекти през фабриките от tools.js;
// координатите са в проценти от платното → работят при всякакъв размер.
import { makeFrame, makeText, makeButton, makeNav, makeImagePlaceholder } from './tools';

// helper: процент → пиксели
const P = (pct, total) => Math.round((pct / 100) * total);

export const TEMPLATES = [
  {
    id: 'landing',
    name: 'Landing page',
    hint: 'Nav · hero · 3 features · CTA · footer',
    build: (w, h) => {
      const out = [];
      out.push(makeNav(P(4, w), P(2, h)));
      const hero = makeFrame(P(4, w), P(11, h), P(92, w), P(26, h), 'hero');
      out.push(hero);
      out.push(makeText(P(9, w), P(17, h), 'Build something people love', 'h1'));
      out.push(makeText(P(9, w), P(24, h), 'A short sentence explaining the product.', 'body'));
      out.push(makeButton(P(9, w), P(29, h), 'Get started', 'primary'));
      for (let i = 0; i < 3; i++) {
        out.push(makeFrame(P(4 + i * 31, w), P(41, h), P(28, w), P(20, h), 'card'));
        out.push(makeText(P(7 + i * 31, w), P(44, h), `Feature ${i + 1}`, 'h3'));
        out.push(makeText(P(7 + i * 31, w), P(49, h), 'One line about it.', 'caption'));
      }
      out.push(makeFrame(P(4, w), P(64, h), P(92, w), P(16, h), 'section'));
      out.push(makeText(P(30, w), P(69, h), 'Ready to start?', 'h2'));
      out.push(makeButton(P(42, w), P(74, h), 'Sign up free', 'primary'));
      out.push(makeFrame(P(4, w), P(84, h), P(92, w), P(12, h), 'footer'));
      return out;
    },
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    hint: 'Intro · project grid · contact',
    build: (w, h) => {
      const out = [];
      out.push(makeNav(P(4, w), P(2, h), ['Me', 'Work', 'About', 'Contact']));
      out.push(makeText(P(6, w), P(13, h), 'Hi, I design things.', 'h1'));
      out.push(makeText(P(6, w), P(20, h), 'Selected work below.', 'body'));
      for (let i = 0; i < 4; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        out.push(makeImagePlaceholder(P(5 + col * 47, w), P(28 + row * 26, h), P(43, w), P(22, h)));
      }
      out.push(makeFrame(P(4, w), P(82, h), P(92, w), P(14, h), 'footer'));
      out.push(makeText(P(8, w), P(87, h), 'hello@example.com', 'body'));
      return out;
    },
  },
  {
    id: 'saas',
    name: 'SaaS + login',
    hint: 'Hero · pricing cards · login form (backend)',
    build: (w, h) => {
      const out = [];
      out.push(makeNav(P(4, w), P(2, h), ['Logo', 'Pricing', 'Docs', 'Login']));
      out.push(makeFrame(P(4, w), P(11, h), P(92, w), P(22, h), 'hero'));
      out.push(makeText(P(9, w), P(17, h), 'Ship faster', 'h1'));
      out.push(makeButton(P(9, w), P(25, h), 'Start free trial', 'primary'));
      ['Starter', 'Pro', 'Team'].forEach((tier, i) => {
        out.push(makeFrame(P(4 + i * 31, w), P(37, h), P(28, w), P(24, h), 'card'));
        out.push(makeText(P(7 + i * 31, w), P(40, h), tier, 'h3'));
        out.push(makeButton(P(7 + i * 31, w), P(54, h), 'Choose', 'secondary'));
      });
      const form = makeFrame(P(28, w), P(66, h), P(44, w), P(26, h), 'form');
      form.set({ annotation: 'Login form — email + password, JWT auth' });
      out.push(form);
      out.push(makeText(P(31, w), P(69, h), 'Email', 'label'));
      out.push(makeText(P(31, w), P(77, h), 'Password', 'label'));
      out.push(makeButton(P(31, w), P(85, h), 'Log in', 'primary'));
      return out;
    },
  },
  {
    id: 'blog',
    name: 'Blog',
    hint: 'Header · post list · sidebar',
    build: (w, h) => {
      const out = [];
      out.push(makeNav(P(4, w), P(2, h), ['Blog', 'Latest', 'Tags', 'About']));
      out.push(makeText(P(6, w), P(12, h), 'Writing', 'h1'));
      for (let i = 0; i < 3; i++) {
        out.push(makeFrame(P(4, w), P(20 + i * 20, h), P(62, w), P(17, h), 'card'));
        out.push(makeText(P(7, w), P(23 + i * 20, h), `Post title ${i + 1}`, 'h3'));
        out.push(makeText(P(7, w), P(29 + i * 20, h), 'Short excerpt of the article…', 'caption'));
      }
      out.push(makeFrame(P(70, w), P(20, h), P(26, w), P(52, h), 'sidebar'));
      out.push(makeText(P(73, w), P(23, h), 'About me', 'h3'));
      out.push(makeFrame(P(4, w), P(84, h), P(92, w), P(12, h), 'footer'));
      return out;
    },
  },
];
