//express setup
const createError = require("http-errors");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const app = require('express')();
const http = require('http').createServer(app);
const _ = require('lodash')

// ngrok is used to expose ports and create tunnels. used in http.listen()
const ngrok = require('ngrok')
const AUTHTOKEN = "1VGK7pyrNOS7FAQtRrKtcYhg26C_4j93cU8rAEzikLdpm4pfx"
const NGROK_CONFIG_PATH = "./ngrok.yml"

//Client and NS communications
//TODO: is there a way to send downlinks over websockets or REST?
const io = require('socket.io')(http);
const webSocket = require('ws')

// Data conversion
const lora = require("lora-packet") // WARNING: THIS MODULE IS TAKEN FROM taraskuzyk's FORK, NOT THE NPM PACKAGE.
// PULL REQUEST WAS CREATED, BUT NOT GUARANTEED THAT IT WAS ACCEPTED YET
const getAvailableSensors = require('./getAvailableSensors')
const ns = require('./ns')
const dc = require('./DataConverters')

let sessions = {}
let availableSensors;

async function startup() {
    //get available sensors with uplink and downlinks jsons
    availableSensors = await getAvailableSensors("./resources/_availableSensors.csv")
}

startup()
// The code that follows *might* break if user connects the same time as the server starts
// if the packets need to be decoded immediately, as the decoding objects haven't been generated yet.

http.listen(13337, async (err)=>{
    //setting up ngrok
    console.log("Auth ngrok...")
    //await ngrok.authtoken(AUTHTOKEN)
    console.log("Auth successful!\nConnecting ngrok...")
    try {
        const one = await ngrok.connect({
            addr: 3000,
            proto: "http",
            subdomain: "tek-sensor-config",
            authtoken: AUTHTOKEN
        })
        const two = await ngrok.connect({
            addr: 13337,
            proto: "http",
            subdomain: "tek-sensor-backend",
            authtoken: AUTHTOKEN
        })
        console.log(`Connected ngrok! ${one} and ${two}`)
    } catch(e){
        console.log(":C")
        console.log(e)
    }
});

//TODO: split up backend into Uplink and Downlink files?

io.on("connection", async (socket)=> {
    sessions[socket.id] = {}
    socket

    .on("login", async ({ nsUrl, username, password }) => {
        sessions[socket.id].tokens = await ns.getTokens(nsUrl, username, password)
        sessions[socket.id].nsUrl = nsUrl
        let applications = await ns.getCustomerApplications(nsUrl, sessions[socket.id].tokens.token)
        socket.emit("userApplications", applications)
    })

    .on("openApplication", async (applicationId) => {
        let credentials = await ns.getApplicationCredentials(sessions[socket.id].nsUrl, sessions[socket.id].tokens.token, applicationId)
        // Credentials needed to send downlinks later on. No way to send them over REST or websockets so far.
        console.log(credentials)
        sessions[socket.id].mqttUsername = credentials.keyId
        sessions[socket.id].mqttPassword = credentials.keyValue

        let devices = await ns
            .getApplicationDevices(sessions[socket.id].nsUrl, sessions[socket.id].tokens.token, applicationId)
        if (devices.hasOwnProperty("data"))
            socket.emit("applicationDevices", devices.data)
            //TODO: figure out if this DEV "feature" (different WS payload format) will be carried to production eventually
        else
            socket.emit("applicationDevices", devices)
    })

    .on("openDevice", async (device) => {
        getDeviceLog(socket, device.id.id, sessions[socket.id].nsUrl, 443, sessions[socket.id].tokens.token,
            device.appSKey, device.nwkSKey)
    })

    .on("disconnect", ()=> {
        try {
            delete sessions[socket.id]
        } catch(error){
            console.log(error)
        }
    })

    .on("downlink", async ({deveui, port, base64})=>{
        ns.sendDownlink(sessions[socket.id].nsUrl, sessions[socket.id].mqttUsername, sessions[socket.id].mqttPassword,
            deveui, port, base64)
    })

    .on("updateSensorId", (sensorId) => {
        sessions[socket.id].sensorId = sensorId;
    })

    .on("getAvailableSensors", () => {
        socket.emit("availableSensors", availableSensors)
    })

})

function getDeviceLog(socket, deviceId, nsUrl, port, token, appSKey, nwkSKey) {

    let device_id = deviceId; // save device id to a local variable

    sessions[socket.id].nsSocket = new webSocket(`wss://${nsUrl}:${port}/api/ws?token=${token}`);

    waitForSocketConnection(sessions[socket.id].nsSocket, function () {
        var subcsriptionMessageId = Math.floor(Math.random() * Math.floor(255));
        try {
            sessions[socket.id].nsSocket.send(JSON.stringify({
                "subCmds": [
                    {
                        "entityType": "DEVICE",
                        "entityId": device_id,
                        "type": "STATS",
                        "cmdId": subcsriptionMessageId
                    }
                ]
            }));
        } catch (e) {
            console.log(e)
        }

    });

    function waitForSocketConnection(socket, callback) {
        setTimeout(() => {
            if (socket.readyState === 1) {
                // console.log("Connected to server!");
                if (callback != null) {
                    callback();
                }
            }
            else { // server didn't respond
                waitForSocketConnection(socket, callback);
            }
        }, 1000);
    }

    sessions[socket.id].nsSocket.onerror = function(e){
        console.error(`[Packet Logger] Error in the websocket connection: ${e.message}...Exiting`);
        if(sessions[socket.id].nsSocket != null)
            sessions[socket.id].nsSocket.close();
        process.exit(1);
    };

    sessions[socket.id].nsSocket.on('unexpected-response', (res) => {
        console.error(`[Packet Logger] Unexpected response from the server: Response code: ${res.statusCode} and Response Message: ${res.statusMessage}...Exiting`);
        if(sessions[socket.id].nsSocket != null)
            sessions[socket.id].nsSocket.close();
    });

    sessions[socket.id].nsSocket.onmessage = function (msg) {

        let messages = JSON.parse(msg.data).data;
        if (messages.length > 1){
            let messagesToSend
            if (messages.length > 21) {
                messagesToSend = messages.slice(messages.length-20)
            } else {
                messagesToSend = messages
            }
            messagesToSend = messagesToSend.map((message, index)=>{
                let newMessage = {}
                //network server layer
                newMessage.ns = message

                //LoRaMAC layer
                //console.log(message)
                try {
                    newMessage.lora = decodeLoraPacket(message.rawPayload, appSKey, nwkSKey)

                    //app layer
                    let indexOfSensorId =
                        indexOfObjectWithPropertyVal(availableSensors, "id", sessions[socket.id].sensorId);

                    if (indexOfSensorId !== -1 && newMessage.lora.type === "data")
                        newMessage.app = dc
                            .decode(availableSensors[indexOfSensorId].uplink, newMessage.lora.payload, newMessage.lora.MACPayload.FPort)
                    else
                        newMessage.app = {
                            error: "No Application data present in this packet. Packet type: " + message.mtype
                        }
                } catch(e) {
                    newMessage.lora = {error: "Something went wrong while decoding this packet..." + e}
                    newMessage.app = {error: "Something went wrong while decoding this packet..."+ e}
                }

                return newMessage;
            })
            socket.emit("allDeviceMessages", messagesToSend)
        } else if (messages.length === 1) {
            socket.emit("newDeviceMessage", messages[0])
        }

    } // onmessage action
} // getDeviceLog function

function indexOfObjectWithPropertyVal(array, property, val){
    for (let i = 0; i < array.length; i++) {
        if (array[i][property]===val){
            return i
        }
    }
    return -1
}

function decodeLoraPacket(payload, appSKey, nwkSKey){

    let packet = lora.fromWire(new Buffer(payload, 'base64'))
    let packetJSON = packet.toJSON()
    if (packet.isDataMessage())
        packetJSON.payload = lora.decrypt(
            packet,
            new Buffer(appSKey, 'hex'),
            new Buffer(nwkSKey, 'hex'),
        )
    if (packet.isJoinAcceptMessage())
        packetJSON.joinPayload = lora.decryptJoinAccept(
            packet,
            new Buffer(appSKey, 'hex')
        )
    return packetJSON
}

//for decoding Base64 encoded payloads, source: https://gist.github.com/lidatui/4064479#file-gistfile1-js-L8
var Base64Binary = {
    _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

    /* will return a  Uint8Array type */
    decodeArrayBuffer: function(input) {
        const bytes = (input.length / 4) * 3;
        const ab = new ArrayBuffer(bytes);
        this.decode(input, ab);

        return ab;
    },

    removePaddingChars: function(input){
        const lkey = this._keyStr.indexOf(input[input.length - 1]);
        if(lkey === 64){
            return input.substring(0,input.length - 1);
        }
        return input;
    },

    decode: function (input, arrayBuffer) {
        //get last chars to see if are valid
        input = this.removePaddingChars(input);
        input = this.removePaddingChars(input);

        const bytes = parseInt((input.length / 4) * 3, 10);

        let uarray;
        let chr1, chr2, chr3;
        let enc1, enc2, enc3, enc4;
        let i = 0;
        let j = 0;

        if (arrayBuffer)
            uarray = new Uint8Array(arrayBuffer);
        else
            uarray = new Uint8Array(bytes);

        //input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

        for (i=0; i<bytes; i+=3) {
            //get the 3 octets in 4 ascii chars
            enc1 = this._keyStr.indexOf(input[j++]);
            enc2 = this._keyStr.indexOf(input[j++]);
            enc3 = this._keyStr.indexOf(input[j++]);
            enc4 = this._keyStr.indexOf(input[j++]);

            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;

            uarray[i] = chr1;
            if (enc3 !== 64) uarray[i+1] = chr2;
            if (enc4 !== 64) uarray[i+2] = chr3;
        }

        return uarray;
    }
};

// Converts array to base64, source: https://gist.github.com/jonleighton/958841
function ArrayToBase64(arrayBuffer) {
    let base64 = '';
    const encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    const bytes = new Uint8Array(arrayBuffer);
    const byteLength = bytes.byteLength;
    const byteRemainder = byteLength % 3;
    const mainLength = byteLength - byteRemainder;

    let a, b, c, d;
    let chunk;

    // Main loop deals with bytes in chunks of 3
    for (let i = 0; i < mainLength; i = i + 3) {
        // Combine the three bytes into a single integer
        chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

        // Use bitmasks to extract 6-bit segments from the triplet
        a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
        b = (chunk & 258048)   >> 12; // 258048   = (2^6 - 1) << 12
        c = (chunk & 4032)     >>  6; // 4032     = (2^6 - 1) << 6
        d = chunk & 63;               // 63       = 2^6 - 1

        // Convert the raw binary segments to the appropriate ASCII encoding
        base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
    }

    // Deal with the remaining bytes and padding
    if (byteRemainder === 1) {
        chunk = bytes[mainLength];

        a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

        // Set the 4 least significant bits to zero
        b = (chunk & 3)   << 4; // 3   = 2^2 - 1

        base64 += encodings[a] + encodings[b] + '==';
    } else if (byteRemainder === 2) {
        chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

        a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
        b = (chunk & 1008)  >>  4; // 1008  = (2^6 - 1) << 4

        // Set the 2 least significant bits to zero
        c = (chunk & 15)    <<  2; // 15    = 2^4 - 1

        base64 += encodings[a] + encodings[b] + encodings[c] + '=';
    }

    return base64;
}
