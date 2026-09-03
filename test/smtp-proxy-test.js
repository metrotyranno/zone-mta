'use strict';

const EventEmitter = require('events');
const SMTPProxy = require('../lib/receiver/smtp-proxy');

// A socket handed to the proxy before it ever reaches an SMTP server. It is an EventEmitter
// because the proxy attaches an 'error' listener to it: a reset peer surfaces as an
// asynchronous 'error', not a synchronous throw, so the socket must never be held without one.
function fakeSocket() {
    let socket = new EventEmitter();
    socket.remoteAddress = '203.0.113.10';
    socket.written = false;
    socket.end = data => {
        socket.written = data;
    };
    socket.destroy = () => {
        socket.destroyed = true;
    };
    return socket;
}

// Regression: a peer that resets the connection while it is being refused emits an asynchronous
// 'error' on the socket. socketEnd() must attach an 'error' listener before it writes the reply,
// otherwise the emit has no listener and Node turns it into an unhandled 'error' that crashes
// the whole proxy process (the try/catch around socket.end() only covers synchronous throws).
module.exports['SMTP proxy survives a socket error while refusing a connection'] = test => {
    let proxy = new SMTPProxy('feeder', { name: 'feeder' });
    let socket = fakeSocket();

    proxy.socketEnd(socket, '421 No free process to handle connection');

    test.equal(socket.written, '421 No free process to handle connection\r\n');
    test.doesNotThrow(() => socket.emit('error', new Error('write ECONNRESET')));
    test.done();
};

// Regression: connection() must guard the socket the instant it is accepted, before any handoff
// or refusal, so a reset in the accept→handoff window cannot crash the proxy.
module.exports['SMTP proxy survives a socket error during handoff'] = test => {
    let proxy = new SMTPProxy('feeder', { name: 'feeder' });
    let socket = fakeSocket();

    proxy.connection(socket);

    test.doesNotThrow(() => socket.emit('error', new Error('write ECONNRESET')));
    test.done();
};
