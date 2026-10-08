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
  fonts: [
    { id: 'soho', name: 'Soho', family: 'Neonderthaw' },
    { id: 'shoreditch', name: 'Shoreditch', family: 'Tilt Neon' },
    { id: 'brighton', name: 'Brighton', family: 'Pacifico' },
    { id: 'mayfair', name: 'Mayfair', family: 'Sacramento' },
    { id: 'camden', name: 'Camden', family: 'Monoton' },
    { id: 'margate', name: 'Margate', family: 'Yellowtail' },
    { id: 'notting', name: 'Notting Hill', family: 'Great Vibes' },
    { id: 'brixton', name: 'Brixton', family: 'Righteous' },
    { id: 'hackney', name: 'Hackney', family: 'Comfortaa', weight: 600 },
    { id: 'leith', name: 'Leith', family: 'Kaushan Script' }
  ],
  googleFontsHref: 'https://fonts.googleapis.com/css2?family=Neonderthaw&family=Tilt+Neon&family=Pacifico&family=Sacramento&family=Monoton&family=Yellowtail&family=Great+Vibes&family=Righteous&family=Comfortaa:wght@600&family=Kaushan+Script&display=swap',

  colours: [
    { id: 'warm', name: 'Warm white', hex: '#ffc77a', core: '#fff6e6' },
    { id: 'cool', name: 'Cool white', hex: '#cfeaff', core: '#ffffff' },
    { id: 'ice', name: 'Ice blue', hex: '#4fd2ff' },
    { id: 'blue', name: 'Electric blue', hex: '#2f6bff' },
    { id: 'violet', name: 'Violet', hex: '#9b4dff' },
    { id: 'pink', name: 'Hot pink', hex: '#ff3db4' },
    { id: 'candy', name: 'Candy pink', hex: '#ff8ccf' },
    { id: 'red', name: 'Red', hex: '#ff2b3d' },
    { id: 'orange', name: 'Orange', hex: '#ff7a1a' },
    { id: 'yellow', name: 'Golden yellow', hex: '#ffc23a' },
    { id: 'green', name: 'Green', hex: '#2dff7a' },
    { id: 'rgb', name: 'Colour changing', hex: '#ff2d55', rgb: true }
  ],

  // Simple line icons (24x24 viewBox) for designs that carry one. Stroke them, never fill.
  icons: {
    heart: 'M12 20.5s-7.2-4.4-9.2-8.8C1.4 8.4 3.4 4.8 6.8 4.8c2.1 0 3.5 1.2 5.2 3.3 1.7-2.1 3.1-3.3 5.2-3.3 3.4 0 5.4 3.6 4 6.9-2 4.4-9.2 8.8-9.2 8.8z',
    moon: 'M15.5 3.5a8.5 8.5 0 1 0 5 15.4A7 7 0 0 1 15.5 3.5z',
    bolt: 'M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z',
    cocktail: 'M4 4h16l-8 9-8-9zM12 13v7M8 20.5h8',
    star: 'M12 2.8l2.8 6 6.5.6-4.9 4.3 1.5 6.4L12 16.8l-5.9 3.3 1.5-6.4-4.9-4.3 6.5-.6z'
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
