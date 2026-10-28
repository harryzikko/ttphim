const db = require('./dbService');
const { issueSession } = require('./authService');
const { SharedTvAuthService } = require('./sharedTvAuthService');
module.exports = new SharedTvAuthService(db.store, user => issueSession(user, { device: 'TV QR login' }));
