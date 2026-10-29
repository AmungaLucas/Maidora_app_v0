// Kenyan languages — profile + KYC language pickers.
// All major Kenyan community languages plus the two official languages.
// "Other" is a trigger: the app shows a "specify" input and stores the typed
// value as its own language entry (never the literal string "Other").
export const KENYAN_LANGUAGES = [
  // Official languages
  'English',
  'Kiswahili',
  // Bantu communities
  'Kikuyu',
  'Luhya',
  'Kamba',
  'Kisii',
  'Meru',
  'Mijikenda',
  'Embu',
  'Mbeere',
  'Tharaka',
  'Kuria',
  'Suba',
  'Taita',
  'Taveta',
  'Pokomo',
  // Nilotic communities
  'Luo',
  'Kalenjin',
  'Nandi',
  'Kipsigis',
  'Tugen',
  'Keiyo',
  'Marakwet',
  'Pokot',
  'Samburu',
  'Turkana',
  'Maasai',
  'Teso',
  // Cushitic communities
  'Somali',
  'Borana',
  'Orma',
  'Rendille',
  'Gabra',
  'Burji',
  'Bajuni',
  // Coastal & Swahili peoples
  'Digo',
  'Giriama',
  'Chonyi',
  'Kauma',
  'Swahili',
  // Other communities present in Kenya
  'Nubian',
  'Shona',
];

// The trigger value that opens the "specify" input in pickers.
export const LANGUAGE_OTHER = 'Other';
