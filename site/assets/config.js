export const APP_CONFIG = Object.freeze({
  siteUrl: 'https://hub.thesecretary.xyz',
  mainSiteUrl: 'https://thesecretary.xyz/',
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyKdQbRGMlA3TkZ8IvMFB3g1awD9qEViARKW2VXXwwZWLFGawWmh-4jLiO1s4p6Fs7OBg/exec',
  authScriptUrl: 'https://script.google.com/macros/s/AKfycbxhNpTz-XNO8y2ucbGmlwNqWJla9JOM7hqR848S4Y2J9kOC2xzQDeE2nQ_ZTx0mSn-p/exec',

  supabaseUrl: 'https://ubxgpkjuzkwlewofxmfy.supabase.co',
  supabasePublishableKey: 'sb_publishable_Nv7jtLPDojg2bKUAuMXlBw_T3MuegRF',
  forumVapidPublicKey: 'BOs1-KQ4873BCISnphCwn1DQZuHeho2AXOhBZmpRo3RLBbKGXKqeeDjI9iPq4ip9I_T5xGAwPHzbwQYSKGvyIzQ',

  adminEmail: 'dikshitaggarwal007@gmail.com',
});

export const isSupabaseConfigured = () =>
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(APP_CONFIG.supabaseUrl)
  && APP_CONFIG.supabasePublishableKey.startsWith('sb_publishable_');

export const isAuthScriptConfigured = () =>
  /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(APP_CONFIG.authScriptUrl);
