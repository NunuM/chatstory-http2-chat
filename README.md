### HTTP2 Chat using NodeJS HTTP2 module

This is a chat similar to chat-roulette, where you chat with strangers. You
can check this chat application [here](https://chatstory.nunum.me)

<img src="https://i.ibb.co/VgmxKH4/Screenshot-20200905-182922-com-android-chrome.jpg" alt="Search for a new match" width="300"/> <img src="https://i.ibb.co/ph7QChK/Screenshot-20200905-183110-com-android-chrome.jpg" alt="Chating with a stranger" width="300"/> <img src="https://i.ibb.co/WWTxv9d/Screenshot-20200905-183127-com-android-chrome.jpg" alt="Stranger leaves chat" width="300" />


#### Installation

This chat is protected with Google's RecaptchaV3, you can create your keys
and you must change in [script import](https://github.com/NunuM/chatstory-http2-chat/blob/master/public/chat.html#L190) and [app script](https://github.com/NunuM/chatstory-http2-chat/blob/master/public/script.js#L151)

```bash
git clone https://github.com/NunuM/chatstory-http2-chat.git

cd chatstory-http2-chat

npm install
```


#### Run

````bash
HTTP_PORT=80 PORT=443 RECAPTCHA_KEY=YOUR_KEY npm start
````

