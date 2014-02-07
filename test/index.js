var redis = require('node-redis-mock'),
    RedisAdapter = require('../lib');

require('should');

describe('Redis Adapter', function() {
    var adapter, client;

    before(function(done) {
        client = redis.createClient();
        adapter = new RedisAdapter(null, {
            pub: client,
            sub: client,
            cmd: client
        });
        done();
    });

    it('should add socket to room', function(done) {
        var expectedId = 'test1',
            expectedRoom = 'test1';

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

    it('should remove socket from room', function(done) {
        var expectedId = 'test1',
            expectedRoom = 'test1';

        adapter.del(expectedId, expectedRoom, function() {
            client.keys('rooms:' + expectedRoom + ':sockets', function(err, keys) {
                keys.length.should.equal(0);

                client.smembers('sockets:' + expectedId + ':rooms', function(err, rooms) {
                    rooms.length.should.equal(0);

                    done();
                });
            });
        });
    });

    it('should remove socket from all rooms', function(done) {
        var expectedId = 'test1';
        adapter.add(expectedId, 'room1');
        adapter.add(expectedId, 'room2');

        setTimeout(function() {
            adapter.delAll(expectedId, function() {
                done();
            });
        }, 100);
    });


    it.skip('should send packet to all sockets in rooms', function(done) {
        var packetCount = 0,
            socket1 = 'socket1',
            socket2 = 'socket2',
            room = 'room1',
            mockedSocket = {
                packet: function() {
                    packetCount++;

                    if (packetCount === 2) {
                        done();
                    }
                }
            };

        adapter.nsp = {
            connected: {
                socket1: mockedSocket,
                socket2: mockedSocket
            }
        };

        adapter.add(socket1, room);
        adapter.add(socket2, room);

        setTimeout(function() {
            adapter.broadcast('packet', {rooms: [room]});
        }, 100);
    });

});