var redis = require('redis');

var keyJoin = function() {
    var args = Array.prototype.slice.call(arguments, 0);
    
    return args.join(':');
}

/**
 * Redis adapter constructor.
 *
 * Options
 *     - pub (redis client) the pub redis client
 *     - sub (redis client) the sub redis client
 *     - cmd (redis client) the general redis client
 * @api public
 */
var RedisAdapter = module.exports = function(opt) {
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
        this.sub.subscribe(redisJoin('rooms', room));
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
    this.cmd.sget(roomKey, function(err, socketIds) {
        if (!socketIds.length) {    // No more socket ids?
            delete self.rooms[room];
            this.sub.unsubscribe(redisJoin('rooms', room));
            self.cmd.del(key);
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
    this.cmd.sget(keyJoin('sockets', id, 'rooms'), function(err, roomIds) {
        roomIds.forEach(function(room) {
            self.del(id, room);
        });
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
        roomKey = keyJoin('rooms', id, 'sockets'),
        socketWildcardKey = keyJoin('sockets', '*', 'rooms');
    
    var sendToSocket = function(id) {
        if (~except.indexOf(id)) {
            return;
        }
        
        var socket = self.nsp.connected[id];
        if (socket) {
            socket.packet(packet);
        }
    };
    
    var broadcastToRoom = function(room) {
        self.cmd.sget(roomKey, function(err, socketIds) {
            socketIds.forEach(sendToSocket);
        });
    };
    
    if (rooms.length) {    // To rooms
        rooms.forEach(broadcastToRoom);
    } else {    // To everyone
        // I'll be honest, this isn't going to work with Redis unless the adapter knows about each connected socket. Not just the ones joining rooms.
        self.cmd.keys(socketWildcardKey, function(err, keys) {
            keys.forEach(function(key) {
                var groups = key.match(/^sockets:(.+):rooms$/);
                if (groups && groups[1]) {
                    var socketId = groups[1];
                    sendToSocket(socketId);
                };
            });
        });
    }
};