var async = require('async'),
    redis = require('redis');

var keyJoin = function() {
    var args = Array.prototype.slice.call(arguments, 0);

    return args.join(':');
};

/**
 * Redis adapter constructor.
 *
 * Options
 *     - pub (redis client) the pub redis client
 *     - sub (redis client) the sub redis client
 *     - cmd (redis client) the general redis client
 * @api public
 */
var RedisAdapter = module.exports = function(nsp, opt) {
    this.nsp = nsp;

    opt = opt || {};

    this.pub = opt.pub || redis.createClient();
    this.sub = opt.sub || redis.createClient();
    this.cmd = opt.cmd || redis.createClient();

    this.rooms = {};    // keep track of locally subscribed rooms;
};

/**
 * Adds a socket from a room.
 *
 * @param {String} socket id
 * @param {String} room name
 * @param {Function} callback
 * @api public
 */
RedisAdapter.prototype.add = function(id, room, fn) {
    var roomKey = keyJoin('rooms', room, 'sockets'),
        socketKey = keyJoin('sockets', id, 'rooms');

    if (!this.rooms[room]) {    // Is locally tracked?
        this.rooms[room] = true;
        this._joinChannel(keyJoin('rooms', room));
    }

    this.cmd.sadd(roomKey, id);
    this.cmd.sadd(socketKey, room);
    if (fn) process.nextTick(fn.bind(null, null));
};

/**
 * Removes a socket from a room.
 *
 * @param {String} socket id
 * @param {String} room name
 * @param {Function} callback
 * @api public
 */
RedisAdapter.prototype.del = function(id, room, fn) {
    var self = this,
        roomKey = keyJoin('rooms', room, 'sockets'),
        socketKey = keyJoin('sockets', id, 'rooms');

    this.cmd.srem(roomKey, id);
    this.cmd.srem(socketKey, room);

    // Clean up when room is empty
    this.cmd.smembers(roomKey, function(err, socketIds) {
        if (!socketIds.length) {    // No more socket ids?
            delete self.rooms[room];
            self.sub.unsubscribe(keyJoin('rooms', room));
            self.cmd.del(roomKey);
        }
    });

    if (fn) process.nextTick(fn.bind(null, null));
};

/**
 * Removes a socket from all rooms it's joined.
 *
 * @param {String} socket id
 * @api public
 */
RedisAdapter.prototype.delAll = function(id, fn) {
    var self = this;

    var deleteRoom = function(room, fn) {
        self.del(id, room, fn);
    };

    this.cmd.smembers(keyJoin('sockets', id, 'rooms'), function(err, roomIds) {
        async.map(roomIds, deleteRoom, fn);
    });
};

/**
 * Broadcasts a packet.
 *
 * Options:
 *  - `flags` {Object} flags for this packet
 *  - `except` {Array} sids that should be excluded
 *  - `rooms` {Array} list of rooms to broadcast to
 *
 * @param {Object} packet object
 * @api public
 */
RedisAdapter.prototype.broadcast = function(packet, opts) {
    var self = this,
        rooms = opts.rooms || [],
        except = opts.except || [],
        socketWildcardKey = keyJoin('sockets', '*', 'rooms');

    var broadcastToRoom = function(room) {
        var roomKey = keyJoin('rooms', room, 'sockets');

        self.cmd.smembers(roomKey, function(err, socketIds) {
            var channel = keyJoin('rooms', room);
            self.pub.publish(channel, {except: except, packet: packet});
        });
    };

    if (rooms.length) {    // To rooms
        rooms.forEach(broadcastToRoom);
    } else {    // To everyone
        // I'll be honest, this isn't correct unless the adapter knows about each connected socket. Not just the ones joining rooms.
        self.cmd.keys(socketWildcardKey, function(err, keys) {
            keys.forEach(function(key) {
                var groups = key.match(/^sockets:(.+):rooms$/);
                if (groups && groups[1]) {
                    self._sendToSocket(groups[1], packet, except);
                }
            });
        });
    }
};

RedisAdapter.prototype._joinChannel = function(channel) {
    var self = this;
    this.sub.subscribe(channel);

    this.sub.on('message', function(channel, data) {
        var except = data.except,
            packet = data.packet,
            roomKey = keyJoin(channel, 'sockets');

        console.log('Message from %s', channel);
        self.cmd.smembers(keyJoin, function(err, ids) {
            if (!ids) {
                return;
            }
            ids.forEach(function(id) {
                self._sendToSocket(id, packet, except);
            });
        });
    });
};

RedisAdapter.prototype._sendToSocket = function(id, packet, except) {
    if (~except.indexOf(id)) {
        return;
    }

    var socket = this.nsp.connected[id];
    if (socket) {
        socket.packet(packet);
    }
};