module.exports = {decode: decode}

function stringifyHex(key) {
    // expects Number, returns stringified hex number in format (FF -> 0xFF) || (A -> 0x0A)
    //
    var ret = key.toString(16).toUpperCase()
    if (ret.length === 1) {
        return "0x0" + ret;
    }
    return "0x" + ret;
}

function toUint(x) {
    return x >>> 0;
}

function byteArrayToArray(byteArray) {
    arr = [];
    for(var i = 0; i < byteArray.length; i++) {
        arr.push(byteArray[i]);
    }
    return arr;
}

function byteArrayToHexString(byteArray) {
    var arr = [];
    for (var i = 0; i < byteArray.length; ++i) {
        arr.push(('0' + (byteArray[i] & 0xFF).toString(16)).slice(-2));
    }
    return arr.join('');
}

function extractBytes(chunk, startBit, endBit) {
    // console.log("\n\nNEW FUNCTION CALL")
    var totalBits = endBit - startBit + 1;
    var totalBytes = totalBits % 8 === 0 ? toUint(totalBits / 8) : toUint(totalBits / 8) + 1;
    var offsetInByte = startBit % 8;
    var endBitChunk = totalBits % 8;
    var arr = new Array(totalBytes);

    for (var byte = 0; byte < totalBytes; ++byte) {
        // console.log("infinite loop?")
        var chunkIdx = toUint(startBit / 8) + byte;
        var lo = chunk[chunkIdx] >> offsetInByte;
        var hi = 0;
        if (byte < totalBytes - 1) {
            hi = (chunk[chunkIdx + 1] & ((1 << offsetInByte) - 1)) << (8 - offsetInByte);
        } else if (endBitChunk !== 0) {
            // Truncate last bits
            lo = lo & ((1 << endBitChunk) - 1);
        }
        arr[byte] = hi | lo;
    }
    return arr;
}

function applyDataType(bytes, dataType, coefficient, round, addition) {
    addition = (typeof addition !== 'undefined') ?  addition : 0
    var output = 0;
    coefficient = Number(coefficient)
    addition = Number(addition)
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
        if (output > Math.pow(2, 8*bytes.length-1))
            output -= Math.pow(2, 8*bytes.length);
        return round ? Number( (output*coefficient + addition).toFixed(round) ) : Number(output*coefficient + addition);
    }

    if (dataType === "bool") {
        return !(bytes[0] === 0);
    }

    if (dataType === "hexstring") {
        return byteArrayToHexString(bytes);
    }

    // Incorrect data type
    return null;
}

function decodeField(chunk, startBit, endBit, dataType, coefficient, round, addition) {
    addition = (typeof addition !== 'undefined') ?  addition : 0
    var chunkSize = chunk.length;
    if (parseInt(endBit) >= parseInt(chunkSize) * 8) {
        return null; // Error: exceeding boundaries of the chunk
    }

    if (parseInt(endBit) < parseInt(startBit)) {
        return null; // Error: invalid input
    }

    var arr = extractBytes(chunk, startBit, endBit);
    return applyDataType(arr, dataType, coefficient, round, addition);
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

function decode_everything_else(parameters, data, port, flatten){
    // ASSUMPTION:
    // There will never be headers on the same port like 0x01 and 0x01 0xFF.
    // If this ever changes, this code will need to be reworked.
    if (typeof(port)==="number")
        port = port.toString();
    var preArray = byteArrayToArray(data);
    var bytes = []
    for (var i = 0; i < preArray.length; i++){
        bytes.push(preArray[i] < 0 ? preArray[i]+256 : preArray[i])
    }
    var decodedData = {};

    var string_bytes = "["
    for (var i = 0; i < bytes.length; i++){
        if (i !== 0)
            string_bytes+=", "
        let byte = bytes[i].toString(16).toUpperCase()
        if (byte.split("").length === 1)
            byte = "0" + byte
        string_bytes+= byte
    }
    string_bytes+="]"

    decodedData.raw = string_bytes;
    decodedData.port = port;

    if (port !== "10" && port !== "100") {
        decodedData.error = "Wrong port number " + port;
        return decodedData
    }

    while (bytes.length > 0) {
        var keyLength = (Object.keys(parameters[port])[0].split(' ')).length;
        //get the length of header of the first key in the given port
        //e.g. '0x12 0x12' turns into ['0x12', '0x12'], it's length is 2.
        // 0x01 0x00 0x00 0x08
        var key = bytes.slice(0, keyLength);
        bytes = bytes.slice(keyLength)
        if (keyLength === 1) {
            key = stringifyHex(key[0]);
        } else if (keyLength === 2) {
            key = stringifyHex(key[0]) + " "
                + stringifyHex(key[1])
        }

        if (!parameters[port].hasOwnProperty(key)) {
            decodedData.error = "Error. Couldn't find key " + key + ". are you decoding the correct sensor?";
            return decodedData;
        }

        var properties = parameters[port][key];

        if (properties.length === 0) {
            decodedData.error = "Error. Something is most likely wrong with the decoder data fed in. Check " +
                "port "+ port + ", key " + key + " .\nThis is a settings or a server-side issue." +
                " If not, report a bug."
            return decodedData;
        }

        var bytesToConsume = parseInt(properties[0]["data_size"])
        var valueArray = []
        for (var i = 0; i < bytesToConsume; i++) {
            valueArray.push(bytes[0])
            bytes = bytes.slice(1)
        }

        if (properties.length === 1) {
            var p = properties[0];
            decodedData[p["parameter_name"]] =
                decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"])
        } else {
            decodedData[properties[0]["group_name"]] = {}
            properties.forEach((p, i) => {
                decodedData[ p["group_name"] ][ p["parameter_name"] ] =
                    decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"])
            })
        }
    }
    return flatten ? flattenObject(decodedData) : decodedData;
}

function decode_medical(parameters, data, port, flatten) {
    // takes in a lookup json (parameters), an array of bytes to be decoded (data), and the port for the medical sensor
    var decodedData = {};

    if (port == 10) {
        data.pop()  // remove the two RFU bytes
        data.pop()

        var string_bytes = "["
        for (var i = 0; i < bytes.length; i++){
            if (i !== 0)
                string_bytes+=", "
            string_bytes+= (bytes[i] < 0 ? bytes[i]+256 : bytes[i]).toString(16)
        }
        string_bytes+="]"

        decodedData.raw = string_bytes;
        decodedData.port = port;

        // This makes the other already existing functions work with the payload format of
        // the medical sensor. Don't judge me
        data.reverse()

        var lookup = parameters[port]["no_header"];
        for (var i = lookup.length - 1; i >= 0; i--) {
            var prop = lookup[i];

            decodedData[ prop["parameter_name"] ] = decodeField(
                data,
                prop["bit_start"],
                prop["bit_end"],
                prop["type"],
                prop["coefficient"],
                prop["round"],
                addition = prop["addition"] )
        }
        decodedData = flatten ? flattenObject(decodedData) : decodedData;
    }

    else if (port == 100) {
        decodedData = decode_everything_else(parameters, data, port, flatten);
    }
    return decodedData;
}

function decode(parameters, data, port, flatten, isMedical) {
    flatten = (typeof flatten !== 'undefined') ?  flatten : false
    isMedical = (typeof isMedical !== 'undefined') ?  isMedical : false
    if (!isMedical) {
        return decode_everything_else(parameters, data, port, flatten);
    }
    else {
        return decode_medical(parameters, data, port, flatten);
    }
}
