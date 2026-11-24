export function setTheme(preferences = {}) {
  const root = document.documentElement;
  const accent = /^#[\da-f]{6}$/i.test(preferences.accent || '') && preferences.accent.toLowerCase() !== '#00bfff' ? preferences.accent : '#ed3657';
  const channels = accent.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
  const luminance = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  root.dataset.theme = ['light', 'amoled', 'forest', 'ocean', 'sunset', 'lavender'].includes(preferences.theme) ? preferences.theme : 'dark';
  root.dataset.motion = preferences.motion === false ? 'off' : 'on';
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--on-accent', luminance > .179 ? '#000' : '#fff');
  root.style.setProperty('--focus', root.dataset.theme === 'light'
    ? (luminance > .26 ? '#2158ac' : accent)
    : (luminance < .14 ? '#00bfff' : accent));
}
