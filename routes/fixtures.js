const express = require('express');
const router = express.Router();
const fixtureController = require('../controllers/fixtureController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Create fixture (manual)
router.post('/create', fixtureController.createFixture);

// Auto-generate fixtures
router.post('/generate', fixtureController.generateFixtures);

// Get league fixtures
router.get('/league/:leagueId', fixtureController.getLeagueFixtures);

// Get fixture by ID
router.get('/:fixtureId', fixtureController.getFixtureById);

// Update fixture
router.put('/:fixtureId', fixtureController.updateFixture);

// Delete fixture
router.delete('/:fixtureId', fixtureController.deleteFixture);

module.exports = router;
