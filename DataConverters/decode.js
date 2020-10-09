module.exports = {decode: decode}

// polyfill for backward compatibility with ES 5 and Nashorn
if (typeof Object.assign !== 'function') {
    // Must be writable: true, enumerable: false, configurable: true
    Object.defineProperty(Object, "assign", {
        value: function assign(target, varArgs) { // .length of function is 2
            'use strict';
            if (target === null || target === undefined) {
                throw new TypeError('Cannot convert undefined or null to object');
            }

            var to = Object(target);

            for (var index = 1; index < arguments.length; index++) {
                var nextSource = arguments[index];

                if (nextSource !== null && nextSource !== undefined) {
                    for (var nextKey in nextSource) {
                        // Avoid bugs when hasOwnProperty is shadowed
                        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                            to[nextKey] = nextSource[nextKey];
                        }
                    }
                }
            }
            return to;
        },
        writable: true,
        configurable: true
    });
}

function trunc(v){
    v = +v;
    if (!isFinite(v)) return v;
    return (v - v % 1)   ||   (v < 0 ? -0 : v === 0 ? v : 0);
}

function stringifyHex(header) {
    // expects Number, returns stringified hex number in format (FF -> 0xFF) || (A -> 0x0A)
    var ret = header.toString(16).toUpperCase()
    if (ret.length === 1) {
        return "0x0" + ret;
    }
    return "0x" + ret;
}

function toUint(x) {
    return x >>> 0;
}

function byteArrayToArray(byteArray) {
    var array = []
    for (i = 0; i < byteArray.length; i++){
        array.push(byteArray[i] < 0 ? byteArray[i]+256 : byteArray[i])
        // adding 256 turns this into an unsigned byte array, which is what we want.
    }
    return array;
}

function byteArrayToHexString(byteArray) {
    var arr = [];
    for (var i = 0; i < byteArray.length; ++i) {
        arr.push(('0' + (byteArray[i] & 0xFF).toString(16).toUpperCase()).slice(-2));
    }
    return arr.join('');
}

function extractBytes(chunk, startBit, endBit) {
    // example:
    //          chunk = [ 0b00000100, 0b11111000 ]
    // we'll be going from      ^    to    ^   to go from bit 11 to bit 4
    // startBit =  11
    // endBit = 4
    // RETURN: [ 01001111 ]. Array is expanded to fit an appropriate number of bits.

    // You are heavily encouraged to run this function with debug to get a "feel" for what it does.
    // A great examples would be LoRaMAC options

    var totalBits = startBit - endBit + 1;
    var totalBytes = totalBits % 8 === 0 ? toUint(totalBits / 8) : toUint(totalBits / 8) + 1;
    var bitOffset = endBit % 8;
    var arr = new Array(totalBytes);

    for (var byte = totalBytes-1; byte >= 0; byte--) {
        // we'll be looking at up to 2 bytes at a time: hi (the right one) and lo (the left one).
        // in the above example those would be byte 0 (from which we took 0b0100)
        // and byte 1 (from which we took 0b1111)
        // after which we *hi | lo* and received 0b01000000 | 0b00001111 = 0b01001111

        var chunkIndex = byte + (chunk.length - 1 - trunc(startBit / 8));
        var lo = chunk[chunkIndex] >> bitOffset; // from the example: 0b11111000 >> 4 = 0b1111 (0b1000 was trunc'ed)
        var hi = 0;
        if (byte !== 0) {
            var hi_bitmask = (1 << bitOffset) - 1 // same as 2^bitOffset - 1
            var bits_to_take_from_hi = 8 - bitOffset // in the example above this var is 4, because we take 4 bits from hi
            hi = (chunk[chunkIndex - 1] & (hi_bitmask << bits_to_take_from_hi));
        } else {
            // Truncate last bits
            lo = lo & ((1 << (totalBits % 8 ? totalBits % 8 : 8)) - 1);
        }
        arr[byte] = hi | lo;
    }
    return arr;
}

function byteTo8Bits(byte){
    var bits = byte.toString(2).split('')
    for (var i = 0; i < bits.length; i++) {
        bits[i] = bits[i] === '1'
    }
    while (bits.length % 8 !== 0) { //turns 1111 into 00001111
        bits.unshift(false);
    }
    return bits
}

function bytesToValue(bytes, dataType, coefficient, round, addition) {
    var output = 0;
    if (dataType === "unsigned") {
        for (var i = 0; i < bytes.length; ++i) {
            output = (toUint(output << 8)) | bytes[i];
        }
        return round ? Number( (output*coefficient + addition).toFixed(round) ) : Number(output*coefficient + addition);
    }

    if (dataType === "signed") {
        for (var i = 0; i < bytes.length; ++i) {
            output = (output << 8) | bytes[i];
        }
        // Convert to signed, based on value size
        if (output > Math.pow(2, 8*bytes.length-1)) {
            output -= Math.pow(2, 8*bytes.length);
        }

        return Number( (output*coefficient + addition).toFixed(round) )
    }

    if (dataType === "hexstring") {
        return byteArrayToHexString(bytes);
    }

    if (dataType === "double") {
        if (bytes.length !== 8)
            return 0;
        //as per IEEE 754 implementation
        var bit_arr = [];
        for (var i = 0; i < bytes.length; i++) {
            bit_arr = bit_arr.concat(byteTo8Bits(bytes[i]))
        }
        var sign = bit_arr[0] ? -1 : 1;
        var exp = 0;
        for (var i_here = 11; i_here >= 1; i_here--) {
            exp += Math.pow(2, 11-i_here) * (bit_arr[i_here] ? 1 : 0)
        }
        var fraction = 1;
        for (var i = 12; i < bit_arr.length; i++) {
            fraction += Math.pow(2, -(i-11)) * (bit_arr[i] ? 1 : 0)
        }
        return sign*fraction*Math.pow(2, exp-1023)
    }

    // Incorrect data type
    return null;
}

function decodeField(chunk, p) {
    //decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["coefficient"], p["round"], p["addition"])
    var startBit = p["bit_start"]
    var endBit = p["bit_end"]
    var dataType = p["type"]
    var addition = (typeof p["addition"] !== 'undefined') ?  Number(p["addition"]) : 0;
    var coefficient = (typeof p["coefficient"] !== 'undefined') ? Number(p["coefficient"]) : 1;
    var round = (typeof p["round"] !== 'undefined') ? Number(p["round"]) : 0;

    var bytes = extractBytes(chunk, startBit, endBit);
    return bytesToValue(bytes, dataType, coefficient, round, addition);
}

function flattenObject(ob) {
    var toReturn = {};

    for (var i in ob) {
        if (!ob.hasOwnProperty(i)) continue;

        if ((typeof ob[i]) == 'object') {
            var flatObject = flattenObject(ob[i]);
            for (var x in flatObject) {
                if (!flatObject.hasOwnProperty(x)) continue;

                toReturn[i + '.' + x] = flatObject[x];
            }
        } else {
            toReturn[i] = ob[i];
        }
    }
    return toReturn;
}

function decode(parameters, bytes, port, flat){
    if (typeof(port)==="number")
        port = port.toString();
    //below is performed in case the NS the decoder is used on supplies a byteArray that isn't an array
    bytes = byteArrayToArray(bytes)

    var decodedData = {};
    decodedData.raw = stringifyBytes(bytes);
    decodedData.port = port;

    if (!parameters.hasOwnProperty(port)) {
        decodedData.error = "Wrong port: " + port;
        return decodedData
    }

    while (bytes.length > 0) {
        // To find the length of the header, we will search for a header in the decoder object that starts with the same
        // byte, and then see how many bytes the header contains.
        var firstByte = stringifyHex(bytes[0])
        var headers = Object.keys(parameters[port])
        var headerLength = null // setting this to null doesn't affect the algorithm unless the decoder object
        // is erroneous, in which case it's fine. headerLength SHOULD be changed by the for loop below.
        for (var i = 0; i < headers.length; i++){
            if ( firstByte === (headers[i].split(' '))[0] ) {
                headerLength = (headers[i].split(' ')).length;
            }
        }

        var header
        if (parameters[port].hasOwnProperty("none")){
            header = "none"
        } else {
            header = bytes.slice(0, headerLength);
            bytes = bytes.slice(headerLength)
            if (headerLength === 1) {
                header = stringifyHex(header[0]);
            } else if (headerLength === 2) {
                header = stringifyHex(header[0]) + " " + stringifyHex(header[1])
            }
        }

        if (!parameters[port].hasOwnProperty(header)) {
            decodedData.error = "Couldn't find header " + header + " in decoder object." +
                " Are you decoding the correct sensor?";
            return decodedData;
        }

        var properties = parameters[port][header];

        if (properties.length === 0) {
            decodedData.error = "Something is wrong with the decoder object. Check " +
                "port "+ port + ", header " + header + ""
            return decodedData;
        }

        var i, j, p, bytesToConsume, valueArray
        // WARNING: arrays can only ever be in the end of the properties for a given port / header
        if (properties.length === 1) {
            // if property array has only one element, then its either going to be a value or a value array,
            // since a group would require at least 2 elements

            p = properties[0];
            if (!decodedData.hasOwnProperty(p["category_name"]))
                decodedData[p["category_name"]] = {}

            if (p["multiple"] == 0) {

                // CASE 1:
                // value
                bytesToConsume = parseInt( p["data_size"] )
                valueArray = []
                for (i = 0; i < bytesToConsume; i++) {
                    valueArray.push(bytes[0])
                    bytes = bytes.slice(1)
                }

                decodedData[p["category_name"]][p["parameter_name"]] =
                    decodeField(valueArray, p)

            } else {
                // CASE 2:
                // array of values (without anything in front)
                decodedData[ p["category_name"] ][ p["parameter_name"] ] = []
                while (bytes.length > 0) {
                    bytesToConsume = parseInt(p["data_size"])
                    valueArray = []
                    for (i = 0; i < bytesToConsume; i++) {
                        valueArray.push(bytes[0])
                        bytes = bytes.slice(1)
                    }
                    decodedData[ p["category_name"] ][ p["parameter_name"] ].push(
                        decodeField(valueArray, p)
                    )
                }
            }
        } else {
            for (i = 0; i < properties.length && bytes.length > 0; i++) {
                p = properties[i];

                if (!decodedData.hasOwnProperty(p["category_name"]))
                    decodedData[p["category_name"]] = {}

                if (p["multiple"] == 0){
                    if (p["group_name"] == "") {
                        // CASE 3:
                        // a stand-alone value that comes right before a group, like in port 15 of Industrial Tracker
                        bytesToConsume = parseInt(p["data_size"])
                        valueArray = []
                        for (j = 0; j < bytesToConsume; j++) {
                            valueArray.push(bytes[0])
                            bytes = bytes.slice(1)
                        }
                        decodedData[p["category_name"]][ p["parameter_name"] ] =
                            decodeField(valueArray, p)
                    } else {
                        // CASE 4:
                        // a group of values
                        if (!decodedData[p["category_name"]].hasOwnProperty(p["group_name"]))
                            decodedData[p["category_name"]][ p["group_name"] ] = {}
                        bytesToConsume = parseInt(p["data_size"])
                        valueArray = []
                        for (j = 0; j < bytesToConsume; j++) {
                            valueArray.push(bytes[0])
                            bytes = bytes.slice(1)
                        }
                        for (j = i; j < properties.length; j++) {
                            p = properties[j]
                            if (p["multiple"] == 0) // there could be an array following a group/value and we don't want to eat that up
                                decodedData[p["category_name"]][ p["group_name"] ][ p["parameter_name"] ] =
                                    decodeField(valueArray, p)
                        }
                    }
                }

                if (p["multiple"] == 0){
                    if (properties[i+1] && properties[i+1]["multiple"] == "1")
                        continue
                    else
                        break;
                }

                if (p["group_name"] === "") {
                    // CASE 5:
                    // array of values (after a group or a value)
                    // e.g. for Industrial Sensor serial port communication
                    decodedData[p["category_name"]][ p["parameter_name"] ] = []
                    while (bytes.length > 0) {
                        bytesToConsume = parseInt(p["data_size"])
                        valueArray = []

                        for (j = 0; j < bytesToConsume; j++) {
                            valueArray.push(bytes[0])
                            bytes = bytes.slice(1)
                        }
                        decodedData[p["category_name"]][ p["parameter_name"] ].push(
                            decodeField(valueArray, p)
                        )
                    }
                } else {
                    // CASE 6:
                    // array of groups (stand-alone OR after a value/group)
                    var isInsideGroup = false;
                    if (typeof decodedData[ p["category_name"] ][ p["group_name"] ] === "object") {
                        decodedData[ p["category_name"] ][ p["group_name"] ][ p["parameter_name"] ] = []
                        isInsideGroup = true;
                    }
                    else
                        decodedData[ p["category_name"] ][ p["group_name"] ] = []
                    // else throw new Error("Fail in CASE 6. If multiple == 1, the parameter must be a part of an existing group or a stand alone array of groups/values.")
                    while (bytes.length > 0) {
                        bytesToConsume = parseInt(p["data_size"])
                        valueArray = []
                        for (j = 0; j < bytesToConsume; j++) {
                            valueArray.push(bytes[0])
                            bytes = bytes.slice(1)
                        }
                        var obj = {}
                        for (j = i; j < properties.length; j++) {
                            p = properties[j]
                            obj[ p["parameter_name"] ] =
                                decodeField(valueArray, p)
                        }
                        if (isInsideGroup)
                            decodedData[ p["category_name"] ][ p["group_name"] ][ p["parameter_name"] ].push(obj)
                        else
                            decodedData[ p["category_name"] ][ p["group_name"] ].push(obj)
                    }
                }
            }
        }
    }
    if (decodedData.hasOwnProperty("")) {                     // Uplink-only fields have an empty string category,
        decodedData = Object.assign(decodedData, decodedData[""])  // this will take care of it
        delete decodedData[""]
    }

    return flat ? flattenObject(decodedData) : decodedData;
}

function stringifyBytes(bytes){
    var stringBytes = "["
    for (var i = 0; i < bytes.length; i++){
        if (i !== 0)
            stringBytes+=", "
        var byte = bytes[i].toString(16).toUpperCase()
        if (byte.split("").length === 1)
            byte = "0" + byte
        stringBytes+= byte
    }
    stringBytes+="]"

    return stringBytes
}




