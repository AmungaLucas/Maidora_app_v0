// Maidora Kenya — brand tokens & shared constants
export const colors = {
  /* Brand Colors */
  brand: '#214E3B', // deep forest green — primary surfaces, buttons, active states
  brandSoft: '#7BC08B', // fresh green — live indicators / success accents
  cream: '#F7F3E9', // warm cream — light backgrounds and badges
  gold: '#D6A64F', // honey gold — brand accent (heart, highlights, footer)
  goldDark: '#9A742D', // deep gold — eyebrows and inline links

  /* Functional tokens */
  ink: '#16261D',
  muted: '#6E7F74',
  card: '#FFFFFF',
  line: '#E4DFD3',
  danger: '#C4453C',
  dangerSoft: '#FBEDEC',
  white: '#FFFFFF',
  brandDark: '#183828',
  brandSoftBg: '#E7F2EA',

  /* Aliases (legacy names used across earlier screens) */
  forest: '#214E3B', // = brand
  forestDark: '#183828', // = brandDark
  green: '#7BC08B', // = brandSoft
  greenSoft: '#E7F2EA', // = brandSoftBg
};

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };

// Typeface map. No custom font files are bundled yet — values stay undefined
// so styles fall back to the system font; pair with fontWeight where needed.
// When we bundle a font (e.g. Plus Jakarta Sans), set the family names here.
export const fonts = {
  bold: undefined,
  semiBold: undefined,
  medium: undefined,
};

// Loader/radar tokens (BrandLoader, FullScreenLoader).
export const brandSoftLight = '#B9E1C3';
export const loaderTrack = 'rgba(33, 78, 59, 0.12)';

// Animated splash themes (SplashScreen "Ping Letters").
export const splashThemes = {
  light: {
    bg: colors.cream,
    ring: 'rgba(33, 78, 59, 0.10)',
    word: colors.brand,
    tag: colors.goldDark,
  },
  dark: {
    bg: colors.brandDark,
    ring: 'rgba(247, 243, 233, 0.14)',
    word: colors.cream,
    tag: colors.brandSoft,
  },
};

export const fontSizes = {
  h1: 28,
  h2: 22,
  body: 16,
  small: 13,
  tiny: 11,
};

export const API_BASE_URL = 'https://gateway.maidora.co.ke/api';

export const ROLES = {
  employer: 'Employer',
  househelp: 'Househelp',
};

export const LINKS = {
  terms: 'https://maidora.co.ke/terms',
  privacy: 'https://maidora.co.ke/privacy',
  supportEmail: 'support@maidora.co.ke',
};
