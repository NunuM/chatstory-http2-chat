'use strict';

/*** node import ***/
const http2 = require('http2');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const util = require('util');
const {HTTP2_HEADER_PATH} = http2.constants;

/*** packages import ***/
const cookie = require('cookie');
const {v4: uuidv4} = require('uuid');
const FormData = require('form-data');

/*** project import ***/
const helper = require('./src/helper');

/*** global variables ***/
const backoff = util.promisify(setTimeout);
const HTTP2_PORT = process.env.PORT || 4000;
const HTTP_PORT = process.env.HTTP_PORT || 4001;
const RECAPTCHA_KEY = process.env.RECAPTCHA_KEY || '';

const PUBLIC_PATH = path.join(__dirname, './public');
const publicFiles = helper.getFiles(PUBLIC_PATH);


/**
 * @class
 */
class Chat {

    /**
     *@constructor
     */
    constructor() {
        /**
         * Clients mapping from their uuid and correspondent connection
         *
         * @type {Map<string, {connection:Http2ServerRequest, peer:?string}>}
         */
        this.clients = new Map();

        /**
         * Set of uuids representing the users
         * waiting for a match
         *
         * @type {Set<string>}
         */
        this.waitingQueue = new Set();
        this.isQueueBeingProcessed = false;
    }

    /**
     * Store socket
     *
     * @param connection
     * @return {string}
     */
    registerClient(connection) {
        const userId = uuidv4();

        console.info("Registering new user", userId);

        this.clients.set(userId, {connection: connection, peer: null});

        Chat.sendClientUserId(userId, connection);

        return userId;
    }

    /**
     * Deletes client
     *
     * @param {string} userId
     */
    unregisterClient(userId) {

        this.processUserChatClose(userId);
        this.clients.delete(userId);

        console.info("Unregister user", userId);
    }

    /**
     * Remove user from queue
     *
     * @param {string} userId
     */
    deleteUserFromQueue(userId) {
        this.waitingQueue.delete(userId);
    }

    /**
     * Adds users to matching queue
     *
     * @param {string} userId
     */
    addUserToQueue(userId) {
        this.waitingQueue.add(userId);

        console.log("Clients waiting ", this.waitingQueue.size);

        if (this.waitingQueue.size >= 2) {
            this.processMatchQueue()
                .catch((error) => console.error("Error processing queue", error));
        }
    }


    /**
     * Push message
     *
     * @param {string} fromUserId
     * @param {string} message
     * @param {boolean} [isUserTyping=false]
     */
    sendMessage(fromUserId, message, isUserTyping = false) {

        const from = this.clients.get(fromUserId);

        if (from.peer == null
            || !this.clients.has(from.peer)
            || this.clients.get(from.peer).peer !== fromUserId) {

            const from = this.clients.get(fromUserId);

            from.peer = null;

            this.deleteUserFromQueue(fromUserId);

            Chat.sendClosedChatMessage(from.connection);

            return;
        }

        if (isUserTyping === true) {
            this.clients.get(from.peer).connection.write(`event: hint\ndata: {"sender":"${fromUserId}"}\n\n`, 'utf8');
        } else {
            console.log("Sending message from", fromUserId, from.peer);
            this.clients.get(from.peer).connection.write(`event: info\ndata: {"sender":"${fromUserId}","msg": "${message}"}\n\n`, 'utf8');
        }
    }

    /**
     * Push user leave message
     *
     * @param {Http2ServerRequest} connection
     */
    static sendClosedChatMessage(connection) {
        connection.write(`event: oper\ndata:{"oper":"plve"}\n\n`, 'utf8');
    }

    /**
     * Process user action of leaving chat room
     *
     * @param {string} fromUserId
     */
    processUserChatClose(fromUserId) {

        console.log(`User ${fromUserId} has leave the chat`);

        const from = this.clients.get(fromUserId);

        if (!from) {
            return;
        }

        const to = this.clients.get(from.peer);

        if (to) {
            to.peer = null;

            this.deleteUserFromQueue(from.peer);

            Chat.sendClosedChatMessage(to.connection);
        }

        from.peer = null;
        this.deleteUserFromQueue(from.peer);
    }

    /**
     * Build client's match
     *
     * @return {Promise<boolean>}
     */
    async processMatchQueue() {

        if (this.isQueueBeingProcessed) {
            console.info("Queue already being processed");
            return true;
        } else {
            this.isQueueBeingProcessed = true;
            console.info("Start process queue");
        }

        let batchCounter = 0;

        const queueIterator = this.waitingQueue[Symbol.iterator]();

        while (this.waitingQueue.size >= 2) {

            try {
                const userId1 = queueIterator.next().value;
                const userId2 = queueIterator.next().value;

                if (this.clients.has(userId1) && this.clients.has(userId2)) {

                    const user1 = this.clients.get(userId1);
                    const user2 = this.clients.get(userId2);

                    user1.peer = userId2;
                    user2.peer = userId1;

                    this.deleteUserFromQueue(userId1);
                    this.deleteUserFromQueue(userId2);

                    Chat.sendMatchEncounter(user1.connection, user2.connection);

                    console.info(`New match between users: ${userId1} <-> ${userId2}`)

                } else if (!this.clients.has(userId1)) {

                    this.deleteUserFromQueue(userId1);

                } else {

                    this.deleteUserFromQueue(userId2);

                }

            } catch (error) {
                console.error("Error build matching", error);
            }

            batchCounter++;

            if ((batchCounter % 100) === 0) {
                await backoff(100);
            }
        }

        console.info("Queue was processed");

        this.isQueueBeingProcessed = false;

        return true;
    }


    /**
     * Send match event
     *
     * @param peersConnection
     */
    static sendMatchEncounter(...peersConnection) {
        for (let i = 0; i < peersConnection.length; i++) {
            if (peersConnection[i]) {
                peersConnection[i].write(`event: oper\ndata: {"oper":"match"}\n\n`, 'utf8')
            }
        }
    }

    /**
     * Send client userId
     *
     * @param {string} userId
     * @param connection
     */
    static sendClientUserId(userId, connection) {
        connection.write(`event: oper\ndata:{"oper":"id", "data":"${userId}"}\n\n`, 'utf8');
    }

    /**
     * Check if userId is present
     *
     * @param req
     * @param res
     * @return {*}
     */
    validateAction(req, res) {

        const cookies = cookie.parse(req.headers.cookie || '');

        if (!this.clients.has(cookies.user)) {
            console.log('user unknown');

            res.writeHead(401, {'content-type': 'text/plain'});
            res.end();

            return false;
        }

        return cookies.user;
    }

    /**
     * Checks if client is a bot
     *
     * @param {string} token
     * @return {Promise<boolean>}
     */
    isUserARobot(token) {

        return new Promise((resolve) => {

            const form = new FormData();

            form.append("secret", RECAPTCHA_KEY);
            form.append("response", token);

            const headers = form.getHeaders();

            const request = https.request({
                hostname: 'www.google.com',
                port: '443',
                path: '/recaptcha/api/siteverify',
                headers: headers,
                method: 'POST'

            }, (res => {

                if (res.statusCode > 299) {
                    console.log("Recaptcha request result on http error code", res.statusCode);

                    resolve(false);
                    return;
                }

                res.on('error', (error) => {
                    console.log("Response recaptcha error", error);
                    resolve(false);
                });

                let jsonString = '';

                res.on('data', (chunk) => {
                    jsonString += chunk;
                });

                res.on('end', () => {

                    try {
                        const payload = JSON.parse(jsonString);

                        if (payload.success && payload.score > 0.1) {
                            resolve(false);
                        } else if (payload.hasOwnProperty('score')) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } catch (e) {

                        console.log("Error parsing recaptcha payload", e);

                        resolve(true);
                    }
                });

            }));

            form.pipe(request);

            request.on('error', (error) => {
                console.log("Request error at recaptcha website", error);

                resolve(false);
            });

            request.end();

        });
    }

}

/**
 * Chat global instance
 *
 * @type {Chat}
 */
const theChat = new Chat();


/**
 * Push files
 *
 * @param {*} stream
 * @param {string} path
 */
function push(stream, path) {
    const file = publicFiles.get(path);

    if (!file) {
        return;
    }

    stream.pushStream({[HTTP2_HEADER_PATH]: path}, (err, pushStream) => {
        pushStream.respondWithFD(file.fileDescriptor, file.headers)
    });
}

/**
 * Request handler
 *
 * @param req
 * @param res
 */
const onRequest = (req, res) => {

    const requestUrl = req.url.split('?').shift();

    const reqPath = requestUrl === '/' ? '/index.html' : requestUrl;

    console.log("Request:", reqPath);

    if (reqPath === '/leave') {

        const userId = theChat.validateAction(req, res);

        if (userId) {

            theChat.processUserChatClose(userId);

            res.writeHead(200, {'content-type': 'text/plain'});
            res.write(JSON.stringify({ok: true}));
            res.end();
        }

        return;

    } else if (reqPath === '/match') {

        const userId = theChat.validateAction(req, res);

        if (userId) {

            if (req.headers['token']) {

                theChat.isUserARobot(req.headers['token'])
                    .then((isBot) => {

                        if (isBot) {
                            console.log("Bot detected", userId);
                            res.writeHead(409);
                            res.end();
                        } else {

                            theChat.addUserToQueue(userId);

                            res.writeHead(200, {'content-type': 'application/json'});
                            res.write(JSON.stringify({ok: true}));
                            res.end();
                        }

                    })
                    .catch((error) => {

                        console.log("Error while verifying if client is a bot", error);

                        theChat.addUserToQueue(userId);

                        res.writeHead(200, {'content-type': 'application/json'});
                        res.write(JSON.stringify({ok: true}));
                        res.end();
                    })

            } else {
                res.writeHead(400);
                res.write(JSON.stringify({ok: false, error: 'Token is missing'}));
                res.end();
            }
        }

        return;

    } else if (reqPath === '/typing') {

        const userId = theChat.validateAction(req, res);

        if (userId) {
            theChat.sendMessage(userId, '', true);
            res.writeHead(200, {'content-type': 'application/json'});
            res.write(JSON.stringify({ok: true}));
            res.end();
        }

        return;
    } else if (req.method === 'POST' && reqPath === '/message') {

        const userId = theChat.validateAction(req, res);

        if (!userId) {
            return;
        }

        theChat.sendMessage(userId, '', true);

        let jsonString = '';
        req.on('data', (data) => {
            jsonString += data;
        });

        req.on('end', () => {
            const json = JSON.parse(jsonString);
            theChat.sendMessage(userId, json.msg);
        });

        res.writeHead(200, {'content-type': 'application/json'});
        res.write(JSON.stringify({ok: true}));
        res.end();

        return;

    } else if (reqPath === '/register') {

        // req.setTimeout(Infinity);
        // req.socket.setTimeout(Number.MAX_VALUE);
        req.socket.setTimeout(2147483647);
        res.writeHead(200, {
            'Content-type': 'text/event-stream',
            'access-control-allow-origin': '*',
            'Cache-Control': 'no-cache'
        });

        const userId = theChat.registerClient(res);

        ((clientId) => {
            req.on("close", () => {

                console.log("Client was disconnected");

                theChat.unregisterClient(clientId);

            });
        })(userId);
        return;
    }

    const file = publicFiles.get(reqPath);

    if (!file) {
        res.writeHead(200, {'content-type': 'text/html'});
        res.write('<h1>Page Not Found</h1>');
        res.end();
        return
    }


    if (req.httpVersion !== '2.0') {

        res.writeHead(200, file.headers);

        const content = fs.readFileSync(path.join(PUBLIC_PATH, reqPath));

        res.write(content);

        res.end();

    } else {

        if (reqPath === '/index.html') {
            push(res.stream, '/script.js');
            push(res.stream, '/send.svg');
            push(res.stream, '/home.svg');
            push(res.stream, '/chat-story-logo.svg');
            push(res.stream, '/leave.svg');
            push(res.stream, '/home.svg');
            push(res.stream, '/favicon.ico');
            push(res.stream, '/chat.html');
            push(res.stream, '/manifest.json');
        }

        res.stream.respondWithFD(file.fileDescriptor, file.headers);
    }

    req.on('finish', () => console.log('con closed'))
};

http2.createSecureServer({
    cert: fs.readFileSync(path.join(__dirname, './ssl/cert3.pem')),
    key: fs.readFileSync(path.join(__dirname, './ssl/key3.pem')),
    allowHTTP1: true,
}, onRequest)
    .on("error", (error) => console.error("Server error", error))
    .listen(HTTP2_PORT, "0.0.0.0", (err) => {
        if (err) {
            console.error(err);
            return
        }
        console.info(`HTTP2 Server listening on ${HTTP2_PORT}`)
    });


http.createServer((req, res) => {
    res.writeHead(301, {'Location': 'https://chatstory.nunum.me'});
    res.end();
}).listen(HTTP_PORT, () => {
    console.info(`HTTP Server is listening on ${HTTP_PORT}`);
});

if (RECAPTCHA_KEY === '') {
    console.log("RECAPTCHA_KEY is not set");
}