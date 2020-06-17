//express setup
const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const app = require('express')();
const http = require('http').createServer(app);

//Client and NS communications
const mqtt = require("mqtt");

const homeSensor = require('./homeSensor.json')
const decode = require('./decode.js')

const createDownlinkJSON = require('./createDownlinkJSON.js')
const createUplinkJSON = require('./createUplinkJSON.js')

createUplinkJSON('./resources/testHomeSensor.csv', 'uplinkHomeSensor.json')
createDownlinkJSON('./resources/testHomeSensor.csv', 'downlinkHomeSensor.json')

http.listen(2000);

const mqttClient = mqtt.connect("https://lorawan-ns-na.tektelic.com",
    {"username": "taras", "password": "test"});

mqttClient.on("connect", ()=> {
    mqttClient.subscribe("app/#")
    console.log("MQTT connection established.")
});

mqttClient.on("message", async function (topic, message) {
    const receivedObject = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(message)));
    if (receivedObject.hasOwnProperty("payloadMetaData")) {
        const uplink = {
            "payload": receivedObject.payload,
            "port": receivedObject.payloadMetaData.fport,
            "deveui": receivedObject.payloadMetaData.deviceMetaData.deviceEUI
        };
        console.log(decode(homeSensor, Base64Binary.decode(uplink.payload), uplink.port))
    }
});

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
