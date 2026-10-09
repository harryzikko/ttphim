(async () => {
  const res = await fetch('http://localhost:3000/xem-phim/quy-quyet-ranh-gioi-vo-dinh/full');
  const html = await res.text();
  console.log('HTML length:', html.length);
  console.log('Has btn-watch-party:', html.includes('id="btn-watch-party"'));
  console.log('Has watch-party-modal:', html.includes('id="watch-party-modal"'));
  console.log('Has tab-btn-party:', html.includes('id="tab-btn-party"'));
  console.log('Has pane-watch-party:', html.includes('id="pane-watch-party"'));
  
  // Find where watch-party-modal is
  const idx = html.indexOf('watch-party-modal');
  console.log('Snippet around modal:', html.substring(idx - 100, idx + 150));
})();
