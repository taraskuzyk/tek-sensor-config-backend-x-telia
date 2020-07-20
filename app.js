//express setup
const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const app = require('express')();
const http = require('http').createServer(app);
const _ = require('lodash')

//Client and NS communications
const mqtt = require("mqtt");
const io = require('socket.io')(http);
const webSocket = require('ws')

// Data conversion
const getAvailableSensors = require('./getAvailableSensors')
const ns = require('./ns')
const dc = require('./DataConverters')

let sessions = {}
let uplink = {}
let downlink = {}
let availableSensors;

async function startup () {
    availableSensors = await getAvailableSensors("./resources/_availableSensors.csv")
    console.log(availableSensors)
}

startup()
// The code that follows *might* break if user connects the same time as the server starts
// if the packets need to be decoded immediately, as the decoding objects haven't been generated yet.

http.listen(13337);

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
        console.log(applicationId)

        let devices = await ns
            .getApplicationDevices(sessions[socket.id].nsUrl, sessions[socket.id].tokens.token, applicationId)

        console.log(devices)
        if (devices.hasOwnProperty("data"))
            socket.emit("applicationDevices", devices.data)
            //TODO: figure out if this DEV "feature" (different WS payload format) will be carried to production eventually
        else
            socket.emit("applicationDevices", devices)
        //socket.emit("applicationCredentials", credentials)
    })
    .on("openDevice", async (deviceId) => {
        getDeviceLog(socket, deviceId, sessions[socket.id].nsUrl, 443, sessions[socket.id].tokens.token)
    })
    .on("disconnect", ()=> {
        try {
            delete sessions[socket.id]
        } catch(error){
            console.log(error)
        }
    })
    .on("downlink", (message)=>{
        console.log("received message to send on app/tx", message)
        sessions[socket.id].mqttConnection.publish("app/tx", message)
    })
    .on("updateSensorId", (sensorId) => {
        sessions[socket.id].sensorId = sensorId;
        console.log("New sensorId")
        console.log(sensorId)
    })
    .on("getAvailableSensors", () => {
        socket.emit("availableSensors", availableSensors.map((el, i)=> {
            return {id: el.id, name: el.name}
        }))
    })

})

function getDeviceLog(socket, deviceId, nsUrl, port, token) {

    let device_id = deviceId; // save device id to a local variable

    sessions[socket.id].nsSocket = new webSocket(`wss://${nsUrl}:${port}/api/ws?token=${token}`);

    waitForSocketConnection(sessions[socket.id].nsSocket, function () {
        var subcsriptionMessageId = Math.floor(Math.random() * Math.floor(255));
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
    });

    function waitForSocketConnection(socket, callback) {
        setTimeout(() => {
            if (socket.readyState === 1) {
                console.log("Connected to server!");
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
        console.log("message received");
        let messages = JSON.parse(msg.data).data;
        if (messages.length > 1){
            let messagesToSend
            if (messages.length > 21) {
                messagesToSend = messages.slice(messages.length-20)
            } else {
                messagesToSend = messages
            }
            messagesToSend = messagesToSend.map((message, index)=>{

                return message
            })
            socket.emit("allDeviceMessages", messagesToSend)
        } else if (messages.length === 1) {
            socket.emit("newDeviceMessage", messages[0])
        }

    } // onmessage action
} // getDeviceLog function


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
