module.exports = function matchesFormat(item, format) {
  if (!format || format === 'all') return true;
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  const quality = fold(item.quality), lang = fold(item.lang);
  if (format === '4k') return /4k|2160/.test(quality);
  if (format === 'fhd') return /fhd|1080/.test(quality);
  if (format === 'vietsub') return /vietsub|phu de/.test(lang);
  if (format === 'thuyetminh') return /thuyet minh|thuyet-minh/.test(lang);
  if (format === 'longtieng') return /long tieng|long-tieng/.test(lang);
  if (format === 'song-ngu') return item.has_song_ngu === true || /song ngu/.test(lang);
  return false;
};
