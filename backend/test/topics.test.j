const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../app'); // Make sure to require your app

chai.use(chaiHttp);
chai.should();

describe("Topics", () => {
    describe("GET /api/v1/topics", () => {
        it("should get all topics", (done) => {
            chai.request(app)
                .get('/api/v1/topics')
                .end((err, res) => {
                    res.should.have.status(200);
                    res.body.should.be.a('array');
                    done();
                });
        });

        it("should get topics filtered by plant", (done) => {
            chai.request(app)
                .get('/api/v1/topics?plant=Basel')
                .end((err, res) => {
                    res.should.have.status(200);
                    res.body.should.be.a('array');
                    done();
                });
        });

        it("should get topics filtered by area", (done) => {
            chai.request(app)
                .get('/api/v1/topics?area=Packaging')
                .end((err, res) => {
                    res.should.have.status(200);
                    res.body.should.be.a('array');
                    done();
                });
        });
    });
});
