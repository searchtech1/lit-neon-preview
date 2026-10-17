/* vendored by tools/build.mjs — do not edit; the source of truth is in the repo root */
const window = globalThis; const self = globalThis;
/* Lit Neon shared catalogue: one source of truth for every site design.
   Prices are PLACEHOLDERS (GBP, inc. VAT) until supplier costs are in. */
window.LIT = {
  brand: {
    name: 'Lit Neon',
    market: 'UK',
    currency: 'GBP',
    promises: [
      'Free UK delivery',
      'Design proof before we make it',
      'Pay in 3 with Klarna',
      'Dimmer and remote included'
    ],
    note: 'Prices, making times and inclusions are placeholders until supplier costs are confirmed.'
  },

  // Lettering: display name (UK places) -> real font family (Google Fonts, OFL)
  // v2 adds (brief §6.1, owner D8): enabled (8 of 10 loaded and offered), style (chip group), minLetterCm (smallest
  // letter height the tube can follow in this face; sizes below it are unavailable), wordSpacingEm / ampersandGapEm
  // (per-face gaps the renderer and the measurer both apply, B44). minLetterCm values are workshop estimates [CONFIRM].
  fonts: [
    // owner's list 2026-10-17, in his order (Custom Neon-style set, real font names). Missing until files arrive:
    // Kabel (8), Linoleo Script (9), Wardrum Bold Outline (11). licence: 'demo' = the owner's file is the free
    // personal-use download; buy the commercial/webfont licence before the store goes live (tools/build-shopify.mjs warns).
    // minLetterCm are workshop estimates [CONFIRM].
    { id: 'rocket', name: 'Rocket Clouds', family: 'Rocket Clouds', style: 'script', enabled: true, minLetterCm: 9, wordSpacingEm: 0.18, ampersandGapEm: 0.14, licence: 'demo' },
    { id: 'gruenewald', name: 'Gruenewald VA', family: 'Gruenewald VA', style: 'script', enabled: true, minLetterCm: 9, wordSpacingEm: 0.16, ampersandGapEm: 0.14 },
    { id: 'brittany', name: 'Brittany Signature', family: 'Brittany Signature', style: 'script', enabled: true, minLetterCm: 10, wordSpacingEm: 0.18, ampersandGapEm: 0.16, licence: 'demo' },
    { id: 'hesterica', name: 'Hesterica', family: 'Hesterica', style: 'script', enabled: true, minLetterCm: 9, wordSpacingEm: 0.16, ampersandGapEm: 0.14, licence: 'demo' },
    { id: 'bayshore', name: 'Bayshore', family: 'Bayshore', style: 'script', enabled: true, minLetterCm: 9, wordSpacingEm: 0.16, ampersandGapEm: 0.14, licence: 'demo' },
    { id: 'nickainley', name: 'Nickainley', family: 'Nickainley', style: 'script', enabled: true, minLetterCm: 8, wordSpacingEm: 0.14, ampersandGapEm: 0.14 },
    { id: 'neoneon', name: 'Neoneon', family: 'Neoneon', style: 'retro', enabled: true, minLetterCm: 7, wordSpacingEm: 0.12, ampersandGapEm: 0.12 },
    { id: 'poiret', name: 'Poiret One', family: 'Poiret One', style: 'modern', enabled: true, minLetterCm: 7, wordSpacingEm: 0.10, ampersandGapEm: 0.12 },
    { id: 'soho', name: 'Soho', family: 'Neonderthaw', style: 'script', enabled: true, minLetterCm: 8, wordSpacingEm: 0.18, ampersandGapEm: 0.14 },
    { id: 'shoreditch', name: 'Shoreditch', family: 'Tilt Neon', style: 'modern', enabled: true, minLetterCm: 7, wordSpacingEm: 0.10, ampersandGapEm: 0.12 },
    { id: 'brighton', name: 'Brighton', family: 'Pacifico', style: 'script', enabled: true, minLetterCm: 7, wordSpacingEm: 0.12, ampersandGapEm: 0.14 },
    { id: 'mayfair', name: 'Mayfair', family: 'Sacramento', style: 'script', enabled: false, minLetterCm: 10, wordSpacingEm: 0.22, ampersandGapEm: 0.16 },
    { id: 'camden', name: 'Camden', family: 'Monoton', style: 'retro', enabled: true, minLetterCm: 14, wordSpacingEm: 0.14, ampersandGapEm: 0.14 },
    { id: 'margate', name: 'Margate', family: 'Yellowtail', style: 'script', enabled: true, minLetterCm: 8, wordSpacingEm: 0.16, ampersandGapEm: 0.14 },
    { id: 'notting', name: 'Notting Hill', family: 'Great Vibes', style: 'script', enabled: true, minLetterCm: 10, wordSpacingEm: 0.20, ampersandGapEm: 0.16 },
    { id: 'brixton', name: 'Brixton', family: 'Righteous', style: 'retro', enabled: true, minLetterCm: 7, wordSpacingEm: 0.10, ampersandGapEm: 0.12 },
    { id: 'hackney', name: 'Hackney', family: 'Comfortaa', weight: 600, style: 'modern', enabled: true, minLetterCm: 7, wordSpacingEm: 0.10, ampersandGapEm: 0.12 },
    { id: 'leith', name: 'Leith', family: 'Kaushan Script', style: 'script', enabled: false, minLetterCm: 10, wordSpacingEm: 0.16, ampersandGapEm: 0.14 }
  ],
  googleFontsHref: 'https://fonts.googleapis.com/css2?family=Poiret+One&family=Neonderthaw&family=Tilt+Neon&family=Pacifico&family=Sacramento&family=Monoton&family=Yellowtail&family=Great+Vibes&family=Righteous&family=Comfortaa:wght@600&family=Kaushan+Script&display=swap',

  colours: [
    { id: 'warm', name: 'Warm white', hex: '#ffc77a', core: '#fff6e6', jacketColour: '#f1e2c6' },
    { id: 'cool', name: 'Cool white', hex: '#cfeaff', core: '#ffffff', jacketColour: '#e4edf2' },
    { id: 'ice', name: 'Ice blue', hex: '#4fd2ff', jacketColour: '#bfe6f4' },
    { id: 'blue', name: 'Electric blue', hex: '#2f6bff', jacketColour: '#aab9ea' },
    { id: 'violet', name: 'Violet', hex: '#9b4dff', jacketColour: '#cbb3ea' },
    { id: 'pink', name: 'Hot pink', hex: '#ff3db4', jacketColour: '#f0b4d6' },
    { id: 'candy', name: 'Candy pink', hex: '#ff8ccf', jacketColour: '#f4cfe4' },
    { id: 'red', name: 'Red', hex: '#ff2b3d', jacketColour: '#eaa2a7' },
    { id: 'orange', name: 'Orange', hex: '#ff7a1a', jacketColour: '#f0c3a3' },
    { id: 'yellow', name: 'Golden yellow', hex: '#ffc23a', jacketColour: '#f1dba6' },
    { id: 'green', name: 'Green', hex: '#2dff7a', jacketColour: '#b7e8c6' },
    { id: 'rgb', name: 'Colour changing', hex: '#ff2d55', rgb: true, jacketColour: '#e7e0d6' }
  ],

  // Simple line icons (24x24 viewBox) for designs that carry one. Stroke them, never fill.
  icons: {
    heart: 'M12 20.5s-7.2-4.4-9.2-8.8C1.4 8.4 3.4 4.8 6.8 4.8c2.1 0 3.5 1.2 5.2 3.3 1.7-2.1 3.1-3.3 5.2-3.3 3.4 0 5.4 3.6 4 6.9-2 4.4-9.2 8.8-9.2 8.8z',
    twohearts: 'M8.5 17.5s-5.6-3.4-7.1-6.8C.3 8.1 1.9 5.4 4.5 5.4c1.6 0 2.7 1 4 2.6 1.3-1.6 2.4-2.6 4-2.6 2.6 0 4.2 2.7 3.1 5.3-1.5 3.4-7.1 6.8-7.1 6.8zM16.5 21.5s-4.4-2.7-5.6-5.4c-.9-2.1.4-4.2 2.4-4.2 1.2 0 2.1.8 3.2 2 1.1-1.2 2-2 3.2-2 2 0 3.3 2.1 2.4 4.2-1.2 2.7-5.6 5.4-5.6 5.4z',
    ring: 'M12 21a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM9.2 8.4 12 3l2.8 5.4M9.2 8.4h5.6',
    champagne: 'M9 3h6l-.8 8.6a2.2 2.2 0 0 1-4.4 0L9 3zM12 14v6M9 20h6M8.6 7h6.8',
    moon: 'M15.5 3.5a8.5 8.5 0 1 0 5 15.4A7 7 0 0 1 15.5 3.5z',
    bolt: 'M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z',
    cocktail: 'M4 4h16l-8 9-8-9zM12 13v7M8 20.5h8',
    star: 'M12 2.8l2.8 6 6.5.6-4.9 4.3 1.5 6.4L12 16.8l-5.9 3.3 1.5-6.4-4.9-4.3 6.5-.6z',
    arrow: 'M4 12h15M13 6l6 6-6 6'
  },

  categories: [
    { id: 'weddings', name: 'Weddings and events' },
    { id: 'home', name: 'Home and bedroom' },
    { id: 'bars', name: 'Bars and cafés' },
    { id: 'business', name: 'Business' },
    { id: 'kids', name: 'Kids and baby' },
    { id: 'gaming', name: 'Gaming' }
  ],

  // Ready-made designs. widthCm = medium size. Each card's "photo" is a live neon render of these fields.
  designs: [
    { id: 'better-together', name: 'Better together', lines: ['Better together'], font: 'soho', colour: 'warm', category: 'weddings', from: 149, widthCm: 90 },
    { id: 'mr-and-mrs', name: 'Mr and Mrs', lines: ['Mr & Mrs'], font: 'notting', colour: 'warm', category: 'weddings', from: 139, widthCm: 70 },
    { id: 'happily-ever-after', name: 'Happily ever after', lines: ['Happily', 'ever after'], font: 'mayfair', colour: 'candy', category: 'weddings', from: 169, widthCm: 75 },
    { id: 'lets-stay-in', name: "Let's stay in", lines: ["Let's stay in"], font: 'soho', colour: 'pink', category: 'home', from: 125, widthCm: 67 },
    { id: 'sweet-dreams', name: 'Sweet dreams', lines: ['Sweet dreams'], icon: 'moon', font: 'brighton', colour: 'ice', category: 'home', from: 135, widthCm: 72 },
    { id: 'home-sweet-home', name: 'Home sweet home', lines: ['Home', 'sweet home'], font: 'notting', colour: 'warm', category: 'home', from: 149, widthCm: 70 },
    { id: 'fancy-a-pint', name: 'Fancy a pint?', lines: ['Fancy a', 'pint?'], font: 'camden', colour: 'warm', category: 'bars', from: 159, widthCm: 80 },
    { id: 'cheers', name: 'Cheers', lines: ['Cheers'], icon: 'cocktail', font: 'leith', colour: 'violet', category: 'bars', from: 129, widthCm: 60 },
    { id: 'cuppa-first', name: 'Cuppa first', lines: ['Cuppa first'], font: 'margate', colour: 'orange', category: 'bars', from: 119, widthCm: 65 },
    { id: 'open-late', name: 'Open late', lines: ['Open late'], font: 'shoreditch', colour: 'red', category: 'business', from: 145, widthCm: 85 },
    { id: 'oh-baby', name: 'Oh baby', lines: ['Oh baby'], font: 'brighton', colour: 'candy', category: 'kids', from: 119, widthCm: 60 },
    { id: 'game-on', name: 'Game on', lines: ['Game on'], icon: 'bolt', font: 'brixton', colour: 'blue', category: 'gaming', from: 129, widthCm: 70 },
    { id: 'heart', name: 'Heart', lines: [], icon: 'heart', font: 'soho', colour: 'pink', category: 'home', from: 89, widthCm: 40 },
    { id: 'lit', name: 'Lit', lines: ['Lit'], font: 'camden', colour: 'pink', category: 'home', from: 99, widthCm: 45 }
  ],

  sizes: [
    { id: 's', name: 'Small', letterCm: 7 },
    { id: 'm', name: 'Medium', letterCm: 10 },
    { id: 'l', name: 'Large', letterCm: 14 },
    { id: 'xl', name: 'Extra large', letterCm: 18 },
    { id: 'xxl', name: 'Statement', letterCm: 24 }
  ],

  // UK bank holidays used for delivery-date estimates
  bankHolidays: ['2026-12-25', '2026-12-28', '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28']
};

export default globalThis.LIT;
