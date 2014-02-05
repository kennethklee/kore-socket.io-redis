var redis = require('redis-mock'),
    client = redis.createClient(),
    RedisAdapter = require('../lib');

require('should');

describe('Redis Adapter', function() {

    it('should add socket to room', function(done) {
        var expectedId = 'test1',
            expectedRoom = 'test1',
            adapter = new RedisAdapter({
                pub: client,
                sub: client,
                cmd: client
            });

        adapter.add(expectedId, expectedRoom, function() {
            client.keys('rooms:' + expectedRoom + ':sockets', function(err, keys) {
                keys.length.should.equal(1);

                client.keys('sockets:' + expectedId + ':rooms', function(err, keys) {
                    keys.length.should.equal(1);

                    done();
                });
            });
        });
    });
    it('should remove socket from room');
    it('should remove socket from all rooms');
    it('should send packet to all sockets in rooms');

});