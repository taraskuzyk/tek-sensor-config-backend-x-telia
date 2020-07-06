module.exports = {decode: decode}

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
    var arr = ["0x"];
    for (var i = 0; i < byteArray.length; ++i) {
        arr.push(('0' + (byteArray[i] & 0xFF).toString(16)).slice(-2).toUpperCase());
    }
    return arr.join('');
}

function byteArray_to_bigint(arr) {
    // Converts a string into an BigInt with all the bits of the string
    // Assumes that a char is suppossed to have 8 bits
    
    var arr_val = BigInt(0);
    j = 0;
    for (var i = arr.length - 1; i >= 0; i--) {
        byte = BigInt(arr[i]);            
        arr_val += (byte << BigInt(8*j));
        j += 1;
    }
    return arr_val;
}

function separate_bytes(value, byte_num) {
    // takes in a value and the number of bytes to be separated into, returns an array of bytes
    bytes = new Array(byte_num);
    
    // Base case
    for (var i = byte_num - 1; i >= 0; i--) {
        // We will and the value with a mask of 11111111 to isolate the 8 LSBs, then add it to the back of bytes
        mask = BigInt(0xFF);
        bytes[i] = Number(value & mask);
        value = value >> 8n;
    }

    return bytes;
}

function extract_bytes(chunk, startbit, endbit) {
    // So the "extractBytes" function was giving me some weird stuff,
    // and I couldn't figure out exactly what it was doing, so I couldn't debug it
    // So I'm gonna make my own function and see if it works
    
    // So ya I wrote this function and everything works now I guess

    // first, we get the "startbit" and "endbit" indices in terms of LSB = 0th bit, as the
    // rest of the program assumes that MSB = 0th bit. Getting LSB = 0th bit makes everything much easier
    var bit_end = (chunk.length*8 - 1) - startbit;
    var bit_start = (chunk.length*8 - 1) - endbit;

    var bits_num = (bit_end - bit_start) + 1;   // number of bits to be returned
    var bytes_num = bits_num % 8 === 0 ? toUint(bits_num / 8) : toUint(bits_num / 8) + 1;   // number of bytes to be returned

    chunk_val = byteArray_to_bigint(chunk);
    // bitshift chunk_val left by 1 until you hit "bit_start"
    for (var i = 0; i < bit_start; i++) {
        chunk_val = (chunk_val >> 1n);
    }

    mask = (1n << BigInt(bits_num)) - 1n;   // == 2^(chunk_length) - 1
    chunk_val &= mask;
    

    // finally, we put the bytes in chunk_val into an array
    new_byte_array = separate_bytes(chunk_val, bytes_num);
    return new_byte_array;
}

function possibly_defective_extract_bytes(chunk, startBit, endBit) {
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

function applyDataType(bytes, dataType, coefficient, round, addition = 0) {
    var output = 0;
    coefficient = Number(coefficient)
    
    if(typeof(addition) == "undefined") {
        addition = 0
    }
    else {
        addition = Number(addition)
    }
    
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

function decodeField(chunk, startBit, endBit, dataType, coefficient, round, addition = 0) {
    var chunkSize = chunk.length;
    if (parseInt(endBit) >= parseInt(chunkSize) * 8) {
        return null; // Error: exceeding boundaries of the chunk
    }

    if (parseInt(endBit) < parseInt(startBit)) {
        return null; // Error: invalid input
    }
    var arr = extract_bytes(chunk, startBit, endBit);
    return applyDataType(arr, dataType, coefficient, round, addition = addition);
}

function decode_no_header(lookup, data, decodedData) {
    for (var i = 0; i < lookup.length; i++) {
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

    var bytes = byteArrayToArray(data);
    var decodedData = {};

    decodedData.raw = bytes.map(val => stringifyHex(val)).join(" ");
    decodedData.port = port;

    while (bytes.length > 0) {
        var keyLength = (Object.keys(parameters[port])[0].split(' ')).length;
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
                decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["coefficient"], p["round"])
        } else {
            decodedData[properties[0]["group_name"]] = {}
            for (var p in properties) {
                prop = properties[p];
                // if (prop["parameter_name"] == "position") {
                //     console.log(data)
                // }
                decodedData[ prop["group_name"] ][ prop["parameter_name"] ] =
                    decodeField(valueArray, prop["bit_start"], prop["bit_end"], prop["type"], prop["coefficient"], prop["round"], prop["addition"])
            }
        }
    }
    return flatten ? flattenObject(decodedData) : decodedData;
}

function decode_medical(parameters, data, port, flatten) {
    // takes in a lookup json (parameters), an array of bytes to be decoded (data), and the port for the medical sensor
    var decodedData = {};
    
    if (port == 10) {
        decodedData.raw = data.map(val => stringifyHex(val)).join(" ");
        decodedData.port = port;

        data.pop()  // remove the two RFU bytes
        data.pop()
        
        var lookup = parameters[port]["no_header"];

        decode_no_header(lookup, data, decodedData);
        decodedData = flatten ? flattenObject(decodedData) : decodedData;
    }
    
    else if (port == 100) {
        decodedData = decode_everything_else(parameters, data, port, flatten);
    }
    return decodedData;
}

function decode_BLE(parameters, data, port, flatten) {
    var decodedData = {};
    if (port == 25) {
        // We will insert the header after every device so we can decode it as normal
        decodedData["raw"] = data.map(val => stringifyHex(val)).join(" ");
        decodedData["port"] = port;

        var header = data[0];
        var lookup = parameters[port][stringifyHex(header)];
        
        var group_length = parseInt(lookup[0]["data_size"]);
        var device_count = (data.length - 1)/group_length;      // -1 for the header
        var index = group_length + 1;
        
        var devices = [];
        var prev_index = 0;
        var count = 1;
        while (count < device_count) {
            data.splice(index, 0, header);
            devices.push(data.slice(prev_index, index));

            count += 1;
            prev_index = index;
            index += (group_length + 1);
        }
        devices.push(data.slice(prev_index, index));

        decodedData["mode"] = lookup[0]["group_name"];
        for (var i = 0; i < devices.length; i++) {
            // console.log(decode_everything_else(parameters, devices[i], port, flatten));
            // console.log("\n")

            decodedData["device_" + i] = decode_everything_else(parameters, devices[i], port, flatten)[lookup[0]["group_name"]];
        }
    }

    else {
        decodedData = decode_everything_else(parameters, data, port, flatten);
    }
    return decodedData;
}

function decode_industrial_sensor(parameters, data, port, flatten) {
    decodedData = {};
    if (port == 20) {
        decodedData.raw = data.map(val => stringifyHex(val)).join(" ");
        decodedData.port = port;

        var header = "no_header";
        var lookup = parameters[port][header];
        var data_size = data.length;
        for (var i = 0; i < lookup.length; i++) {
            lookup[i]["data_size"] = data_size;
        }
        lookup[3]["bit_end"] = data.length*8 - 1;

        decode_no_header(lookup, data, decodedData);
        decodedData = flatten ? flattenObject(decodedData) : decodedData;
    }

    else {
        decodedData = decode_everything_else(parameters, data, port, flatten);
    }
    return decodedData;
}

function decode_industrial_tracker(parameters, data, port, flatten) {
    decodedData = {};
    if (port == 15) {
        if (data[0] != 0x03) {
            decodedData = decode_everything_else(parameters, data, port, flatten);
        }
        else {
            decodedData["raw"] = data.map(val => stringifyHex(val)).join(" ");
            decodedData["port"] = port;

            // we will insert the header (0x03) and the log fragment number after every utc and position
            // so we can decode it as normal    
            var header = data[0];
            var log_frag_num = data[1];

            var entries_length = (data.length - 2)/16;     // -2 for the header and log frag number
            var entries = [];

            var count = 0;
            var prev_index = 0;
            var index = 18;
            while (count < entries_length) {
                data.splice(index, 0, header);
                data.splice(index + 1, 0, log_frag_num);
                entries.push(data.slice(prev_index, index));

                count += 1;
                prev_index = index;
                index += 18;
            }

            // console.log(entries)
            var lookup = parameters[port][stringifyHex(header)];
            for (var i = 0; i < entries.length; i++) {
                // console.log(decode_everything_else(parameters, devices[i], port, flatten));
                // console.log("\n")
    
                decodedData["log_entry_" + i] = decode_everything_else(parameters, entries[i], port, flatten)[lookup[0]["group_name"]];
            }

        }

    }
    
    else if (port == 25) {
        decodedData = decode_BLE(parameters, data, port, flatten);
    }
    else {
        decodedData = decode_everything_else(parameters, data, port, flatten);
    }
    return decodedData;
}

function decode(sensor, data, port, flatten = false) {
    var isMedical = (sensor["sensor_name"] == "medical_sensor");
    var is_BLE_Tracker = (sensor["sensor_name"] == "BLE_tracker");
    var is_Industrial_Sensor = (sensor["sensor_name"] == "industrial_sensor");
    var is_Industrial_Tracker = (sensor["sensor_name"] == "industrial_tracker");

    if ( !(isMedical || is_BLE_Tracker || is_Industrial_Sensor || is_Industrial_Tracker) ) {
        return decode_everything_else(sensor, data, port, flatten);
    }
    else if (isMedical) {
        return decode_medical(sensor, data, port, flatten);
    }
    else if(is_BLE_Tracker) {
        return decode_BLE(sensor, data, port, flatten);
    }
    else if(is_Industrial_Sensor) {
        return decode_industrial_sensor(sensor, data, port, flatten);
    }
    else if (is_Industrial_Tracker) {
        return decode_industrial_tracker(sensor, data, port, flatten);
    }
}


// test = [0x00, 0x00, 0x01, 0x2C]
// thing = extract_bytes(test, 0, 31)
// console.log(thing)


// bytearr = [0b10010001, 0b01101001, 0b01000010];

// thing = extract_bytes(bytearr, 1, 15)
// other_thing = possibly_defective_extract_bytes(bytearr, 1, 15)
// console.log("my function = " + thing)
// console.log("existing function = " + other_thing)

//00010001 01101001

//00010001 01101001
