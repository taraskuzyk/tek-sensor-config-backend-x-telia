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
                    decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"], p["addition"])
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
                        decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"], p["addition"])
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
                            decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"], p["addition"])
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
                            decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"], p["addition"])
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
                                decodeField(valueArray, p["bit_start"], p["bit_end"], p["type"], p["multiplier"], p["round"], p["addition"])
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
        var byte = bytes[i].toString(16).toUpperCase()
        if (byte.split("").length === 1)
            byte = "0" + byte
        stringBytes+= byte
    }
    stringBytes+="]"

    return stringBytes
}

parameters = {
    "10": {
        "0x00 0xBA": [
            {
                "data_size": "1",
                "bit_start": "6",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "battery_life",
                "group_name": "battery",
                "round": "",
                "multiplier": "0.01",
                "multiple": "0",
                "addition": "2.5"
            },
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "eos_alert",
                "group_name": "battery",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x01 0x04": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input1_frequency",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x02 0x02": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input2_voltage",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x03 0x02": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input3_voltage",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x04 0x02": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input4_voltage",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x05 0x04": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input5_frequency",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x06 0x04": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input6_frequency",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x09 0x65": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_intensity",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x09 0x00": [
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_detected",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x0A 0x71": [
            {
                "data_size": "6",
                "bit_start": "47",
                "bit_end": "32",
                "type": "signed",
                "parameter_name": "x",
                "group_name": "acceleration",
                "round": "",
                "multiplier": "0.01",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "6",
                "bit_start": "31",
                "bit_end": "16",
                "type": "signed",
                "parameter_name": "y",
                "group_name": "acceleration",
                "round": "",
                "multiplier": "0.01",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "6",
                "bit_start": "15",
                "bit_end": "0",
                "type": "signed",
                "parameter_name": "z",
                "group_name": "acceleration",
                "round": "",
                "multiplier": "0.01",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x0A 0x00": [
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "0",
                "type": "signed",
                "parameter_name": "orientation_alarm",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x0B 0x67": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "ambient_temperature",
                "group_name": "",
                "round": "",
                "multiplier": "0.1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x0B 0x68": [
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "relative_humidity",
                "group_name": "",
                "round": "",
                "multiplier": "0.5",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x0C 0x67": [
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "mcu_temperature",
                "group_name": "",
                "round": "",
                "multiplier": "0.1",
                "multiple": "0",
                "addition": ""
            }
        ]
    },
    "100": {
        "0x10": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "loramac_otaa",
                "group_name": "loramac_join_mode",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x11": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "12",
                "type": "unsigned",
                "parameter_name": "class",
                "group_name": "loramac_opts",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "3",
                "bit_end": "3",
                "type": "unsigned",
                "parameter_name": "adr",
                "group_name": "loramac_opts",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "2",
                "bit_end": "2",
                "type": "unsigned",
                "parameter_name": "duty_cycle",
                "group_name": "loramac_opts",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "1",
                "bit_end": "1",
                "type": "unsigned",
                "parameter_name": "sync_word",
                "group_name": "loramac_opts",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "confirm_mode",
                "group_name": "loramac_opts",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x12": [
            {
                "data_size": "2",
                "bit_start": "11",
                "bit_end": "8",
                "type": "unsigned",
                "parameter_name": "dr_number",
                "group_name": "loramac_dr_tx",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "3",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tx_power",
                "group_name": "loramac_dr_tx",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x13": [
            {
                "data_size": "5",
                "bit_start": "39",
                "bit_end": "8",
                "type": "unsigned",
                "parameter_name": "frequency",
                "group_name": "loramac_rx2",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "5",
                "bit_start": "7",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "dr_number",
                "group_name": "loramac_rx2",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x19": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "loramac_net_id_msb",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x1A": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "loramac_net_id_lsb",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x20": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_seconds",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x21": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_battery",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x22": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_temperature",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x23": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_relative_humidity",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x24": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_light",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x25": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_input1",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x26": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_input2",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x27": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_input3",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x28": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_input4",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x29": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_input5",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x2A": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_input6",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x2C": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_accelerometer",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x2D": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_orientation_alarm",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x2E": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "tick_mcu_temperature",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x30": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "temperature_relative_humidity_idle",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x31": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "temperature_relative_humidity_active",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x32": [
            {
                "data_size": "2",
                "bit_start": "7",
                "bit_end": "0",
                "type": "signed",
                "parameter_name": "temperature_high_threshold",
                "group_name": "amb_temp_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "8",
                "type": "signed",
                "parameter_name": "temperature_low_threshold",
                "group_name": "amb_temp_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x33": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "temperature_threshold_enable",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x34": [
            {
                "data_size": "2",
                "bit_start": "7",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "relative_humidity_high_threshold",
                "group_name": "amb_rh_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "8",
                "type": "unsigned",
                "parameter_name": "relative_humidity_low_threshold",
                "group_name": "amb_rh_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x35": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "relative_humidity_threshold_enable",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x36": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input12_sample_period_idle",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x37": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input12_sample_period_active",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x38": [
            {
                "data_size": "4",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input1_frequency_high_threshold",
                "group_name": "input1_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "16",
                "type": "unsigned",
                "parameter_name": "input1_frequency_low_threshold",
                "group_name": "input1_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x39": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input1_threshold_enable",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x3A": [
            {
                "data_size": "4",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input2_voltage_high_threshold",
                "group_name": "input2_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "16",
                "type": "unsigned",
                "parameter_name": "input2_voltage_low_threshold",
                "group_name": "input2_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x3B": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input2_threshold_enable",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x3C": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input5_sample_period_idle",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x3D": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input5_sample_period_active",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x3E": [
            {
                "data_size": "4",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input5_frequency_high_threshold",
                "group_name": "input5_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "16",
                "type": "unsigned",
                "parameter_name": "input5_frequency_low_threshold",
                "group_name": "input5_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x3F": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "input5_threshold_enable",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x40": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "mcu_temperature_sample_period_idle",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x41": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "mcu_temperature_sample_period_active",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x42": [
            {
                "data_size": "2",
                "bit_start": "7",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "mcu_temperature_high_threshold",
                "group_name": "mcu_temp_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "8",
                "type": "unsigned",
                "parameter_name": "mcu_temperature_low_threshold",
                "group_name": "mcu_temp_threshold",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x43": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "mcu_temp_threshold_enable",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x48": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_interrupt_enabled",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x49": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_intencity_high_threshold",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x4A": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_intencity_low_threshold",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x4B": [
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_threshold_timer",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x4C": [
            {
                "data_size": "4",
                "bit_start": "31",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_sample_period_active",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x4D": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_alarm",
                "group_name": "als_values_tx",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_intensity",
                "group_name": "als_values_tx",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x50": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "acceleration_impact_threshold_enable",
                "group_name": "accel_mode",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "acceleration_sensor_enable",
                "group_name": "accel_mode",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x51": [
            {
                "data_size": "1",
                "bit_start": "1",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "acceleration_measurement_range",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x52": [
            {
                "data_size": "1",
                "bit_start": "2",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "acceleration_sample_rate",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x53": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "acceleration_impact_threshold",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x54": [
            {
                "data_size": "2",
                "bit_start": "15",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "acceleration_impact_debounce_time",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x55": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "acceleration_report_alarm",
                "group_name": "accel_values_tx",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "1",
                "bit_start": "1",
                "bit_end": "1",
                "type": "unsigned",
                "parameter_name": "acceleration_report_magnitude",
                "group_name": "accel_values_tx",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "1",
                "bit_start": "2",
                "bit_end": "2",
                "type": "unsigned",
                "parameter_name": "acceleration_report_full_precision",
                "group_name": "accel_values_tx",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x70": [
            {
                "data_size": "2",
                "bit_start": "5",
                "bit_end": "5",
                "type": "unsigned",
                "parameter_name": "app_configuration",
                "group_name": "write_to_flash",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "6",
                "bit_end": "6",
                "type": "unsigned",
                "parameter_name": "lora_configuration",
                "group_name": "write_to_flash",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "2",
                "bit_start": "8",
                "bit_end": "8",
                "type": "unsigned",
                "parameter_name": "restart_sensor",
                "group_name": "write_to_flash",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x71": [
            {
                "data_size": "7",
                "bit_start": "7",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "app_major_version",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "7",
                "bit_start": "15",
                "bit_end": "8",
                "type": "unsigned",
                "parameter_name": "app_minor_version",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "7",
                "bit_start": "23",
                "bit_end": "16",
                "type": "unsigned",
                "parameter_name": "app_revision",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "7",
                "bit_start": "31",
                "bit_end": "24",
                "type": "unsigned",
                "parameter_name": "loramac_major_version",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "7",
                "bit_start": "39",
                "bit_end": "32",
                "type": "unsigned",
                "parameter_name": "loramac_minor_version",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "7",
                "bit_start": "47",
                "bit_end": "40",
                "type": "unsigned",
                "parameter_name": "loramac_revision",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            },
            {
                "data_size": "7",
                "bit_start": "55",
                "bit_end": "48",
                "type": "unsigned",
                "parameter_name": "region",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ],
        "0x72": [
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "configuration_factory_reset",
                "group_name": "",
                "round": "",
                "multiplier": "1",
                "multiple": "0",
                "addition": ""
            }
        ]
    }
}

console.log(decode(parameters, [0x01, 0x04, 0x05, 0x79, 0x02, 0x02, 0x02, 0x9A, 0x09, 0x65, 0x03, 0x2E, 0x0B, 0x67, 0x00, 0xF8, 0x0B, 0x68, 0x3A, 0x00, 0xBA, 0x6C], 10, true))
