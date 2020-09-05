'use strict';

console.log('Script loaded');

let source = null;
let isConnectionOld = false;

/**
 * Accidentally prevents user leaving without wanting
 *
 * @return {string|null}
 */
window.onbeforeunload = () => {
    if (!isChatInputDisabled()) {
        return 'You will leave this chat!';
    }

    return null;
};

let titleObj = {
    handler: null
};

/**
 * Starts chatting logic
 */
window.onload = () => {

    showLoading();

    enterChat()
        .then(() => {
            findMatch();
        })
        .catch(() => {

        });

    registerChatInputKeyEvent();

    document.addEventListener("visibilitychange", titleFocusHandler, false);
};

/**
 * Debounce factory with continuous lag
 * on successive invocations
 *
 * @param {function} func
 * @param {number} wait
 * @param {boolean} [immediate=false]
 * @return {function(boolean=false): (void)}
 */
const debounce = function (func, wait, immediate) {
    let timeout;
    return function (toClear) {
        let context = this, args = arguments;

        if (toClear === true && timeout) {
            clearTimeout(timeout);
            func.apply(context, args);
            return;
        }

        let later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };

        let callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);

    };
};


/**
 * Debounce factory with interval lag
 * on successive invocations
 *
 * @param {function} func
 * @param {number} wait
 * @param {boolean} [immediate=false]
 * @return {function(): (void)}
 */
const intervalDebounce = function (func, wait, immediate) {
    let timeout;
    return function () {
        let context = this, args = arguments;
        let later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        let callNow = immediate && !timeout;

        if (!timeout) {
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        }
        if (callNow) func.apply(context, args);
    };
};

/**
 * When peer is typing
 *
 * @type {function(boolean): void}
 */
const typeHintDebounce = debounce(() => {
    $("#hint").hide();
}, 2000);


/**
 * Takes user input and sends to server
 */
const sendMsg = () => {
    const input = document.getElementById('inputMessage');

    if (input.value.length === 0 || /^\s+$/.test(input.value)) {
        input.value = '';
        return;
    }


    fetch('/message', {
        method: "POST",
        credentials: 'include',
        headers: {"content-type": "application/json"},
        body: JSON.stringify({msg: input.value})
    }).catch(err => console.error("Error sending message to server ", err));

    insertMessage(input.value, false);

    input.value = '';

    scrollBottom();

};

/**
 * Queues this client for a match
 */
const findMatch = () => {

    showLoading();

    grecaptcha.ready(function () {
        grecaptcha.execute('6LcQ88QZAAAAAHQ46e1vFkvWRU0u8Y0zx8EQgYPk', {action: 'submit'})
            .then(function (token) {
                fetch('/match', {
                    headers: {'token': token}
                }).then((rsp) => {

                    if (rsp.status === 401 && source) {
                        source.close();
                        enterChat().then(() => {
                            findMatch();
                        });

                    } else if (rsp.status === 409) {

                        alert("You were considered of being a bot");
                        quitChat();

                    } else {
                        console.log("Finding new match");
                    }
                })
                    .catch((error) => {
                        console.error("Error marking available for a new chat", error);
                    });
            });
    });
};


/**
 * Leave current chat conversation sessions
 */
const leaveChat = () => {
    fetch('/leave')
        .then(rsp => {
            newChatButton("Keep going");
            disableLeaveBtn();
            disableSendBtn();
            disableChatInput();

        })
        .catch(error => console.error("Error sending leaving message", error))
};


const hideLoading = () => {

    const element = $('#loadingmodal');

    console.log("dismiss loading");

    if (isLoadingVisible()) {
        element.modal('hide');

        requestInputFocus();
    }

};

/**
 * Create document title swap effect when
 * user is not in this browser tab
 *
 * @param {string} [msg='default message']
 */
const titleAlert = (msg) => {

    let idx = 0;
    const messages = ['Chat | ChatStory', msg || "You have a new message | ChatStory"];

    if ('hidden' in document && document.hidden) {

        if (!titleObj.handler) {
            titleObj.handler = setInterval(() => {
                document.title = messages[idx];

                idx += 1;

                if (idx === 2) {
                    idx = 0;
                }
            }, 1500);
        }
    }
};

/**
 * Browser tab visibility change event handler
 */
const titleFocusHandler = () => {

    if ('hidden' in document && !document.hidden) {
        if (titleObj.handler) {
            clearInterval(titleObj.handler);
        }
        titleObj.handler = null;

        document.title = "Chat | ChatStory";
    }
};

const isLoadingVisible = () => {
    return $('#loadingmodal').hasClass('show');
};

const showLoading = () => {

    console.log("open loading");

    const element = $('#loadingmodal');

    if (!isLoadingVisible()) {
        element.modal({
            backdrop: 'static',
            keyboard: false,
            show: true,
        });
    }
};

/**
 * Communicate with server that this user is typing
 *
 * @type {function(boolean): void}
 */
const inputDebounce = intervalDebounce(() => {
    fetch('/typing').catch(error => console.error("Error sending typing event", error));
}, 1000, true);


const registerChatInputKeyEvent = () => {
    const inputElement = document.getElementById("inputMessage");

    inputElement.addEventListener("keyup", (event) => {
        if (event.which === 13 || event.keyCode === 13) {

            event.preventDefault();

            sendMsg();
        } else {
            inputDebounce();
        }
    });
};

const requestInputFocus = () => {
    const inputElement = document.getElementById("inputMessage");

    inputElement.focus();
};

const isChatInputDisabled = () => {

    const inputElement = document.getElementById("inputMessage");

    return inputElement.hasAttribute("disabled");
};

const disableChatInput = () => {

    const inputElement = document.getElementById("inputMessage");

    inputElement.setAttributeNode(document.createAttribute("disabled"));

};

const disableLeaveBtn = () => {

    const leaveElement = document.getElementById("leavebtn");

    leaveElement.setAttributeNode(document.createAttribute("disabled"));

};

const disableSendBtn = () => {

    const sendElement = document.getElementById("sendbtn");

    sendElement.setAttributeNode(document.createAttribute("disabled"));

};

const enableLeaveBtn = () => {
    const leaveElement = document.getElementById("leavebtn");

    leaveElement.removeAttribute("disabled");
};

const enableSendBtn = () => {

    const sendElement = document.getElementById("sendbtn");

    sendElement.removeAttribute("disabled");

};

const enableChatInput = () => {

    const inputElement = document.getElementById("inputMessage");

    inputElement.removeAttribute("disabled");

};

/**
 * Let this user know that is no longer on
 * a conversation but it can keep up with a new match.
 *
 * @param {string} msg
 * @return {boolean}
 */
const newChatButton = (msg) => {

    if (!isChatInputDisabled()) {
        const chatElement = document.getElementById('chat-log');

        const messageHolder = document.createElement("div");

        messageHolder.innerHTML = `<p class="text-center" style="margin-top: 10px;">${msg || ''} <button class="btn btn-outline-info" onclick="findMatch(); clearOldMessages();">Find new chat</button></p>`;

        chatElement.appendChild(messageHolder);
    }

    scrollBottom();

    typeHintDebounce(true);

    return true;
};

const clearOldMessages = () => {

    const chatElement = document.getElementById('chat-log');

    chatElement.innerHTML = '';

    return true;
};


const vibrate = () => {
    if ("vibrate" in navigator) {
        navigator.vibrate(500);
    }
};


const clearInput = () => {
    const inputElement = document.getElementById("inputMessage");
    inputElement.value = '';
};

const scrollBottom = () => {
    const divElement = document.getElementById('chat-log');
    divElement.scrollTop = divElement.scrollHeight - divElement.clientHeight;
};


/**
 * Draw new message
 *
 * @param {string} msg
 * @param {boolean} isLeft is from the chat peer
 */
const insertMessage = (msg, isLeft) => {

    try {
        let name;
        const messageElement = document.createElement("div");

        if (isLeft) {
            messageElement.classList.add("chat-message");
            name = 'Stanger';
        } else {
            messageElement.classList.add("chat-message", "chat-message--right");
            name = 'Me';
        }

        messageElement.innerHTML = '<span class="chat-message__avatar-frame"><img src="https://eu.ui-avatars.com/api/?rounded=true&name=' + name + '" alt="avatar" class="chat-message__avatar"></span><p class="chat-message__text">' + msg + '</p>'.trim();


        $("#chat-log").append(messageElement);

    } catch (e) {
        console.error("Error inserting message:", e);
    }
};

/**
 * Leave, clean and redirect user to main page
 */
const quitChat = () => {
    source.close();
    console.log('Chat closed');
    document.cookie = `user=`;

    window.location.href = '/index.html';
};


/**
 * Establish SSE connection with server.
 *
 * @return {Promise<boolean>}
 */
const enterChat = () => {

    return new Promise((resolve, reject) => {

        console.log('start sse');

        source = new EventSource("/register");

        source.onerror = (e) => {
            console.error("EventSource failed", e);
            reject(false);
        };


        source.addEventListener("info", (e) => {

            hideLoading();


            try {
                const payload = JSON.parse(e.data);
                insertMessage(payload.msg, true);
            } catch (e) {
                console.error("Error parsing message", e);
            }

            scrollBottom();

            vibrate();

            titleAlert();

            typeHintDebounce(true);

            console.log('sse info event');

        }, false);


        source.addEventListener("hint", (e) => {

            if (!isChatInputDisabled()) {

                $("#hint").show();
                typeHintDebounce();
            }
        });

        source.addEventListener("oper", (e) => {
            console.log('sse oper', e.data);

            try {

                const data = JSON.parse(e.data);

                if (data.hasOwnProperty('oper')) {
                    if (data.oper === 'match') {

                        enableLeaveBtn();
                        enableSendBtn();
                        enableChatInput();
                        hideLoading();

                        titleAlert('New match | ChatStory');

                    } else if (data.oper === 'plve') {

                        newChatButton("Oops, the user have disconnected! Keep going");

                        disableLeaveBtn();
                        disableSendBtn();
                        clearInput();
                        disableChatInput();


                    } else if (data.oper === 'id') {
                        document.cookie = "user=" + data.data;

                        if (!isConnectionOld) {
                            isConnectionOld = true;
                        } else {
                            newChatButton("Oops, the user have disconnected! Keep going");

                            disableLeaveBtn();
                            disableSendBtn();
                            clearInput();
                            disableChatInput();

                        }

                        resolve(true);
                    }
                }

            } catch (e) {
                console.error("Error parsing data", e);
            }
        }, false);

    });

};
