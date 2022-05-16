const app = require('../handler');
const request = require('supertest');

const api = request(app)
test('responds with the statistics of the evaluated ', async () => {
    before(function (done) {
        app = createApp();
        app.listen(function (err) {
            if (err) {
                return done(err);
            }
            done();
        });
    });
    api
        .get('/stats')
        .expect(200)
        .expect({
            "count_mutant_dna": 40,
            "count_human_dna": 100,
            "ratio": 0.4
        });
})
test('responds result', async () => {
    api
        .post('/mutant')
        .expect(200)
        .expect('200-OK');
})