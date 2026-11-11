const express = require('express');
const shortflixService = require('../services/shortflixService');

function createShortflixRouter({ service = shortflixService } = {}) {
  const router = express.Router();

  router.get('/shortflix/catalog', async (req, res) => {
    try {
      const data = await service.getCatalog({
        page: req.query.page,
        genre: req.query.genre,
        keyword: req.query.keyword,
        limit: req.query.limit
      });
      res.set('Cache-Control', 'public, max-age=120');
      res.json({ status: true, data });
    } catch (err) {
      res.status(err.status || 502).json({
        status: false,
        message: err.message || 'Không thể tải danh mục Short Phim'
      });
    }
  });

  router.get('/shortflix/detail/:slug', async (req, res) => {
    try {
      const data = await service.getDetail(req.params.slug);
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ status: true, data });
    } catch (err) {
      res.status(err.status || 502).json({
        status: false,
        message: err.message || 'Không thể tải chi tiết phim ngắn'
      });
    }
  });

  router.get('/shortflix/stream/:slug/:episode', async (req, res) => {
    try {
      const data = await service.getStreams(req.params.slug, req.params.episode);
      res.set('Cache-Control', 'public, max-age=120');
      res.json({ status: true, data });
    } catch (err) {
      res.status(err.status || 502).json({
        status: false,
        message: err.message || 'Không thể lấy link phát phim ngắn'
      });
    }
  });

  router.get('/shortflix/subtitle', async (req, res) => {
    try {
      const vtt = await service.fetchSubtitle(req.query.url);
      res
        .set('Content-Type', 'text/vtt; charset=utf-8')
        .set('Cache-Control', 'public, max-age=3600')
        .send(vtt);
    } catch (err) {
      res.status(err.status || 502).type('text/plain').send(err.message || 'Subtitle unavailable');
    }
  });

  return router;
}

module.exports = createShortflixRouter();
module.exports.createShortflixRouter = createShortflixRouter;
