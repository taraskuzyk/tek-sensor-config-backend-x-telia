module.exports = function decode(parameters, data, port){
    // ASSUMPTION:
    // There will never be headers on the same port like 0x01 and 0x01 0xFF.
    // If this ever changes, this code will need to be reworked.
    if (typeof(port)==="number")
        port = port.toString();

    var bytes = byteArrayToArray(data);
    var decodedData = {};

    decodedData.raw = bytes.map(val => stringifyHex(val)).join(" ");
    decodedData.port = port;

    while (bytes.length > 0) {

        var keyLength = (Object.keys(parameters['10'])[0].split(' ')).length;
        //get the length of header of the first key in the given port
        //e.g. '0x12 0x12' turns into ['0x12', '0x12'], it's length is 2.
        // 0x01 0x00 0x00 0x08
        var key = bytes.slice(0, keyLength);
        bytes = bytes.slice(keyLength)
        if (keyLength === 1) {
            key = stringifyHex(key[0]);
        } else {
            key = stringifyHex(key[0]) + " " + stringifyHex(key[1])
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
            for (var p in properties){
                decodedData[ p["group_name"] ][ p["parameter_name"] ] =
                    decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"])
            }
        }
    }
    return decodedData

    function stringifyHex(key) {
        // expects Number, returns stringified hex number in format (FF -> 0xFF) || (A -> 0x0A)
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
        var totalBits = endBit - startBit + 1;
        var totalBytes = totalBits % 8 === 0 ? toUint(totalBits / 8) : toUint(totalBits / 8) + 1;
        var offsetInByte = startBit % 8;
        var endBitChunk = totalBits % 8;

        var arr = new Array(totalBytes);

        for (var byte = 0; byte < totalBytes; ++byte) {
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

    function applyDataType(bytes, dataType, multiplier, round) {
        var output = 0;
        if (dataType === "unsigned") {
            for (var i = 0; i < bytes.length; ++i) {
                output = (toUint(output << 8)) | bytes[i];
            }
            return round ? (output*multiplier).toFixed(round) : (output*multiplier);
        }

        if (dataType === "signed") {
            for (var i = 0; i < bytes.length; ++i) {
                output = (output << 8) | bytes[i];
            }
            // Convert to signed, based on value size
            if (output > Math.pow(2, 8*bytes.length-1))
                output -= Math.pow(2, 8*bytes.length);
            return round ? (output*multiplier).toFixed(round) : (output*multiplier);
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

    function decodeField(chunk, startBit, endBit, dataType, multiplier) {
        var chunkSize = chunk.length;
        if (endBit >= chunkSize * 8) {
            return null; // Error: exceeding boundaries of the chunk
        }

        if (endBit < startBit) {
            return null; // Error: invalid input
        }

        var arr = extractBytes(chunk, startBit, endBit);
        return applyDataType(arr, dataType, multiplier);
    }

}
