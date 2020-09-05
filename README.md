### HTTP2 Chat using NodeJS HTTP2 module

This is a chat similar to chat-roulette, where you chat with strangers. You
can check this chat application [here](https://chatstory.nunum.me)

![Search for a new match](https://i.ibb.co/VgmxKH4/Screenshot-20200905-182922-com-android-chrome.jpg "Search for a new match")
![Chatting with a stranger](https://i.ibb.co/ph7QChK/Screenshot-20200905-183110-com-android-chrome.jpg "Chatting with a stranger")
![Stranger leaves chat](https://i.ibb.co/WWTxv9d/Screenshot-20200905-183127-com-android-chrome.jpg "Stranger leaves chat")


#### Installation

This chat is protected with Google's RecaptchaV3, you can create your keys
and you must change in: 

```bash
git clone https://github.com/NunuM/chatstory-http2-chat.git

cd chatstory-http2-chat

npm install
```


#### Run

````bash
HTTP_PORT=80 PORT=443 RECAPTCHA_KEY=YOUR_KEY npm start
````

