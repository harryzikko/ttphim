// TTPhim - Actor & Director Profile Controller
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split('/').filter(Boolean);

  let personName = '';
  let personType = 'actor';

  // Support /dien-vien/:name or /dao-dien/:name or ?name=...&type=...
  if (pathParts[0] === 'dao-dien' || urlParams.get('type') === 'director') {
    personType = 'director';
  }

  if (pathParts[1]) {
    personName = decodeURIComponent(pathParts[1].replace(/-/g, ' '));
  } else if (urlParams.get('name')) {
    personName = urlParams.get('name');
  }

  if (!personName) {
    personName = 'Chân Tử Đan'; // Fallback default example
  }

  // DOM Elements
  const avatarEl = document.getElementById('person-avatar');
  const nameEl = document.getElementById('person-name');
  const roleTagEl = document.getElementById('person-role-tag');
  const countryTagEl = document.getElementById('person-country-tag');
  const badgeEl = document.getElementById('person-badge');
  const bioEl = document.getElementById('person-bio');
  const countEl = document.getElementById('person-movie-count');
  const genreListEl = document.getElementById('person-genre-list');
  const gridEl = document.getElementById('person-movies-grid');
  const sortSelect = document.getElementById('film-sort-select');

  let allMovies = [];

  try {
    const res = await fetch(`/api/person/${encodeURIComponent(personName)}?type=${personType}`);
    const json = await res.json();

    if (!json.status || !json.data) {
      throw new Error(json.message || 'Không tìm thấy thông tin');
    }

    const { person, movies } = json.data;
    allMovies = movies || [];

    // Update document title
    document.title = `${person.name} (${person.role}) - TTPHIM Cinema`;

    // Render Person Meta
    if (nameEl) nameEl.textContent = person.name;
    if (avatarEl) {
      avatarEl.src = person.avatar;
      avatarEl.alt = person.name;
    }
    if (roleTagEl) roleTagEl.textContent = person.role;
    if (countryTagEl) countryTagEl.textContent = person.nationality || 'Quốc tế';
    if (badgeEl) {
      badgeEl.innerHTML = `
        <span class="material-symbols-outlined text-[14px]">${person.type === 'director' ? 'videocam' : 'star'}</span>
        ${person.type === 'director' ? 'Đạo diễn' : 'Diễn viên'}
      `;
    }
    if (bioEl) bioEl.textContent = person.bio;
    if (countEl) countEl.textContent = (movies || []).length;
    if (genreListEl && person.genres) {
      genreListEl.textContent = person.genres.length ? person.genres.join(', ') : 'Điện ảnh toàn cầu';
    }

    renderMovies(allMovies);

  } catch (err) {
    console.error('Lỗi tải thông tin diễn viên:', err);
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="col-span-full py-16 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
          <span class="material-symbols-outlined text-[40px] text-primary-container">error</span>
          <p class="text-base text-white font-semibold">Chưa tìm thấy dữ liệu cho nghệ sĩ "${personName}"</p>
          <a href="/kham-pha" class="mt-2 px-4 py-2 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-sm text-primary transition-colors">
            Khám phá phim khác &rarr;
          </a>
        </div>
      `;
    }
  }

  // Render Movie Cards
  function renderMovies(moviesList) {
    if (!gridEl) return;

    if (!moviesList || moviesList.length === 0) {
      gridEl.innerHTML = `
        <div class="col-span-full py-16 text-center text-on-surface-variant">
          <p class="text-sm">Hiện chưa có tác phẩm nào của nghệ sĩ này trong hệ thống.</p>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = moviesList.map(movie => {
      const thumb = movie.thumb_url || movie.poster_url || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80';
      const year = movie.year || '';
      const quality = movie.quality || 'FHD';
      const episode = movie.episode_current || '';

      return `
        <a href="/phim/${movie.slug}" class="group flex flex-col rounded-xl overflow-hidden bg-surface-container hover:bg-surface-container-high border border-white/5 hover:border-primary-container/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer">
          <div class="relative aspect-[2/3] w-full overflow-hidden bg-surface-container-highest">
            <img src="${thumb}" alt="${movie.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-108" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent pointer-events-none"></div>
            
            <!-- Quality & Year Badges -->
            <div class="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
              <span class="px-2 py-0.5 rounded bg-primary-container text-white text-[10px] font-bold uppercase shadow-md">${quality}</span>
              ${year ? `<span class="px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-white text-[10px] font-semibold">${year}</span>` : ''}
            </div>

            <!-- Play Button Overlay -->
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div class="w-12 h-12 rounded-full bg-primary-container text-white flex items-center justify-center shadow-2xl transform scale-75 group-hover:scale-100 transition-transform">
                <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
              </div>
            </div>

            <!-- Episode Current Badge -->
            ${episode ? `
              <div class="absolute bottom-2 inset-x-2 pointer-events-none text-center">
                <span class="text-[11px] font-semibold text-white/90 truncate block drop-shadow">${episode}</span>
              </div>
            ` : ''}
          </div>

          <!-- Title & Subtitle -->
          <div class="p-3 flex flex-col flex-1 justify-between gap-1">
            <h3 class="font-label-md text-xs sm:text-sm font-bold text-white group-hover:text-primary transition-colors line-clamp-1" title="${movie.name}">
              ${movie.name}
            </h3>
            <p class="text-[11px] text-on-surface-variant truncate" title="${movie.origin_name || ''}">
              ${movie.origin_name || movie.year || 'TTPHIM'}
            </p>
          </div>
        </a>
      `;
    }).join('');
  }

  // Handle Sort
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      const val = sortSelect.value;
      let sorted = [...allMovies];
      if (val === 'year') {
        sorted.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
      } else if (val === 'views') {
        sorted.sort((a, b) => (b.view || 0) - (a.view || 0));
      } else {
        // newest default
        sorted = [...allMovies];
      }
      renderMovies(sorted);
    });
  }
});
