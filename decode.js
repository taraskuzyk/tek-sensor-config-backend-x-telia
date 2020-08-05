module.exports = {decode: decode}

function stringifyHex(header) {
    // expects Number, returns stringified hex number in format (FF -> 0xFF) || (A -> 0x0A)
    //
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
    }
    return array;
}

function byteArrayToHexString(byteArray) {
    var arr = [];
    for (var i = 0; i < byteArray.length; ++i) {
        arr.push(('0' + (byteArray[i] & 0xFF).toString(16)).slice(-2));
    }
    return arr.join('');
}

function extractBytes(chunk, startBit, endBit) {

    var totalBits = startBit - endBit + 1;
    var totalBytes = totalBits % 8 === 0 ? toUint(totalBits / 8) : toUint(totalBits / 8) + 1;
    var bitOffset = endBit % 8;
    var arr = new Array(totalBytes);

    for (var byte = totalBytes-1; byte >= 0; byte--) {

        var chunkIndex = byte + (chunk.length - 1 - Math.trunc(startBit / 8));
        var lo = chunk[chunkIndex] >> bitOffset;
        var hi = 0;
        if (byte !== 0) {
            hi = (chunk[chunkIndex - 1] & ((1 << bitOffset) - 1)) << (8 - bitOffset);
        } else {
            // Truncate last bits
            lo = lo & ((1 << (totalBits % 8 ? totalBits % 8 : 8)) - 1);
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
        var headerLength = (Object.keys(parameters[port])[0].split(' ')).length;
        // ASSUMPTION:
        // There will never be headers on the same port that have different lengths
        // like 0x01      and 0x01 0x00
        //     (0x01 0xFF and 0x01 0x00 is OK).

        //get the length of header of the first header in the given port
        //e.g. '0x12 0x12' turns into ['0x12', '0x12'], it's length is 2.
        // 0x01 0x00 0x00 0x08

        var header
        if (parameters[port].hasOwnProperty("none")){
            // none can only be on its own. if we send a non-header uplink on a port, it can't have other header ULs.
            header = "none"
        } else {
            header = bytes.slice(0, headerLength);
            bytes = bytes.slice(headerLength)
            if (headerLength === 1) {
                header = stringifyHex(header[0]);
            } else if (headerLength === 2) {
                header = stringifyHex(header[0]);
                    + stringifyHex(header[1])
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

        // TODO: holy mother of everything copy-paste, i will burn in hell for this code below. please refactor,
        // I think I'm brain-dead.

        var i, j, p, bytesToConsume, valueArray
        // WARNING: arrays can only ever be in the end of the properties for a given port / header
        if (properties.length === 1) {
            // if property array has only one element, then its either going to be a value or a value array,
            // since a group would require at least 2 elements

            p = properties[0];
            if (p["multiple"] == 0) {
                // value
                bytesToConsume = parseInt( p["data_size"] )
                valueArray = []
                for (i = 0; i < bytesToConsume; i++) {
                    valueArray.push(bytes[0])
                    bytes = bytes.slice(1)
                }
                decodedData[p["parameter_name"]] =
                    decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"])
            } else {
                // array of values
                decodedData[ p["parameter_name"] ] = []
                while (bytes.length > 0) {
                    bytesToConsume = parseInt(p["data_size"])
                    valueArray = []
                    for (i = 0; i < bytesToConsume; i++) {
                        valueArray.push(bytes[0])
                        bytes = bytes.slice(1)
                    }
                    decodedData[ p["parameter_name"] ].push(
                        decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"])
                    )
                }
            }
        } else {
            decodedData[properties[0]["group_name"]] = {}
            for (i = 0; i < properties.length && bytes.length > 0; i++) {
                p = properties[i];

                if (p["multiple"] != 1){
                    // != is intentional, since it may be a string or number depending on NS
                    // group
                    bytesToConsume = parseInt(p["data_size"])
                    valueArray = []
                    for (j = 0; j < bytesToConsume; j++) {
                        valueArray.push(bytes[0])
                        bytes = bytes.slice(1)
                    }
                    for (j = i; j < properties.length; j++) {
                        p = properties[j]
                        //console.log("hi")
                        if (p["multiple"] != 1)
                        decodedData[ p["group_name"] ][ p["parameter_name"] ] =
                            decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"])
                    }
                    continue
                }

                if (p["group_name"] === "") {
                    //array of values after some values - e.g. for Industrial Sensor serial port communication.
                    decodedData[ p["parameter_name"] ] = []
                    while (bytes.length > 0) {
                        bytesToConsume = parseInt(p["data_size"])
                        valueArray = []

                        for (j = 0; j < bytesToConsume; j++) {
                            valueArray.push(bytes[0])
                            bytes = bytes.slice(1)
                        }
                        decodedData[ p["parameter_name"] ].push(
                            decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"])
                        )
                    }
                } else {
                    //array of groups (after some values)
                    decodedData[ p["group_name"] ] = []
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
                                decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"])
                        }
                        decodedData[ p["group_name"]].push(obj)
                    }

                }

            }
        }
    }
    return flat ? flattenObject(decodedData) : decodedData;
}

function stringifyBytes(bytes){
    var stringBytes = "["
    for (var i = 0; i < bytes.length; i++){
        if (i !== 0)
            stringBytes+=", "
        let byte = bytes[i].toString(16).toUpperCase()
        if (byte.split("").length === 1)
            byte = "0" + byte
        stringBytes+= byte
    }
    stringBytes+="]"

    return stringBytes
}




