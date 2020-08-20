/*
///////////////////////////////////////////////////////////////
/ Copyright (c) 2015-2020 Tektelic Communications Inc.
/
/ This code contains confidential information of Tektelic
/ Communications Inc.
/
/ Tektelic makes no warranties, express, implied or otherwise,
/ regarding its accuracy, completeness or performance.
/
/ date    2020-06-19
/
///////////////////////////////////////////////////////////////
*/

const BitManipulation = require("./BitManipulation.js");

module.exports = {encode: encode};

function check_command(group_or_field, lookup) {
    // returns true if an individual command is valid, and false otherwise

    // There are 2 things we need to check:
    //    1. Access - read-only? write-only?
    //    2. Number of fields

    if (group_or_field.hasOwnProperty("read")) {
        if (lookup["access"] == "W") {
            return {status: false, error_code: 'Tried reading from write-only field'};
        }
        else if ( typeof(group_or_field["read"]) == "object" ) {
            return {status: false, error_code: 'Syntax error, read commands cannot be of type "object"'};
        }
    }
    else if (group_or_field.hasOwnProperty("write")) {
        if (lookup["access"] == "R") {
            return {status: false, error_code: 'Tried writing to read-only field'};
        }
        if (typeof(group_or_field["write"]) === "object") {
            var fields = Object.keys(group_or_field["write"]);
            if (fields.length != Number(lookup["field_count"])) {
                return {status: false, error_code: 'Invalid number of fields in group'};
            }
            for (i = 0; i < fields.length; i++) {
                if (lookup[fields[i]] === undefined) {
                    return {status: false, error_code: 'Field "' + fields[i] + '" does not exist'}
                }
            }
        }

    }
    return {status: true, error_code: "No error"};
}

function is_valid(commands, sensor) {
    // returns true if commands are valid, returns false otherwise

    var valid = true;

    categories = Object.keys(commands);
    for (var i = 0; i < categories.length; i++) {
        var category_str = categories[i];
        var category = commands[category_str];

        var groups_and_fields = Object.keys(commands[category_str]);
        for (var j = 0; j < groups_and_fields.length; j++) {
            var group_or_field_str = groups_and_fields[j];
            var group_or_field = category[group_or_field_str];

            var lookup = sensor[category_str][group_or_field_str];
            if (lookup === undefined) {
                msg = (category_str + " -> " + group_or_field_str);
                return {valid: false, message: msg, error_code: 'Field/group "' + group_or_field_str + '" does not exist'};
            }

            valid = check_command(group_or_field, lookup);
            if (!valid["status"]) {
                msg = (category_str + " -> " + group_or_field_str);
                return {valid: false, message: msg, error_code: valid["error_code"]};
            }
        }
    }
    return {valid: true, message: "no message", error_code: "no error code"};
}

function write_bits(write_value, end_bit, start_bit, current_bits) {
    // write the bits in write_value to the specified location in current_bits and returns the result as a bit array
    // Arguments:
    //      write_value [Number or String] - value to write to "current_bits"
    //      end_bit [Number] - start bit to write to
    //      start_bit [Number] - end bit to write to
    //      current_bits [Bit Array] - bits to write "write_value" to
    if (current_bits === undefined) {
        current_bits = BitManipulation.get_bits(0);
    }

    var bits_to_write = BitManipulation.get_bits(write_value);

    var length = Number(start_bit) - Number(end_bit) + 1;
    var mask = BitManipulation.init_mask(length);

    bits_to_write = BitManipulation.AND(bits_to_write, mask);                   // AND bits_to_write with a mask of 1s
    bits_to_write = BitManipulation.shift_left(bits_to_write, end_bit);       // Shift the bits_to_write to end_bit

    current_bits = BitManipulation.OR(current_bits, bits_to_write);              // OR the bits_to_write with the current_bits

    return current_bits;
}

function format_header(header, read) {
    // takes in the header as a string, and handles the case of where the header is 2 bytes long
    if (read === undefined) {
        read = true;
    }

    if (header.length === 4) {
        if (read) {
            return [parseInt(header)];
        }
        else {
            return [parseInt(header) | 0x80];
        }
    }
    else {
        header1 = "";
        header0 = "";
        for (var i = 0; i < 4; i++) {
            header1 += header[i];
        }
        for (var i = 5; i < 9; i++) {
            header0 += header[i];
        }
        return [parseInt(header1), parseInt(header0)]
    }
}

function write_to_port(bytes, port, encoded_data) {
    // write "bytes" to the appropriate "port" in "encoded_data"
    if (encoded_data.hasOwnProperty(port)) {
        // try pushing "bytes" onto the appropriate port in "encoded_data"
        encoded_data[port] = encoded_data[port].concat(bytes);
    }
    else {
        // if the port doesn't exist as a key yet, create the key and push "bytes" onto it
        encoded_data[port] = bytes;
    }
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////
function encode_read(lookup, encoded_data) {
    bytes = format_header(lookup["header"], read = true);
    write_to_port(bytes, lookup["port"], encoded_data);
}

function encode_write_field(command, lookup, encoded_data) {
    var bytes = format_header(lookup["header"], read = false);
    port = lookup["port"];

    var val_to_write = command["write"];
    if ( (lookup["type"] != "string") && (lookup["type"] != "hexstring") ) {
        val_to_write = Math.round(Number(val_to_write)/Number(lookup["coefficient"]));
    }

    written_bits = write_bits(
        val_to_write,
        parseInt(lookup["bit_start"]),
        parseInt(lookup["bit_end"]),
        current_value = 0,
    );

    if ( (lookup["multiple"] == 0) || (lookup["multiple"] === undefined) ) {
        size = lookup["data_size"];
    }
    else {
        size = written_bits.length/8;
    }

    written_bytes = BitManipulation.to_byte_arr(written_bits, size = size);
    bytes = bytes.concat(written_bytes);

    write_to_port(bytes, lookup["port"], encoded_data);     // Add the bytes to the appropriate port in "encoded data"
}

function encode_write_group(commands, group_lookup, encoded_data) {
    header = group_lookup["header"];
    var bytes = format_header(header, read = false);

    var written_bits = BitManipulation.get_bits(0);
    var field_names = Object.keys(commands["write"])
    var field_write_vals = Object.values(commands["write"]);

    var bytes_num = parseInt(group_lookup[field_names[0]]["data_size"]);
    var multiple_field_bits = [];    // A variable to contain the bits of the "multiple" field if it exists

    for (var i = 0; i < field_names.length; i++) {
        var field_name = field_names[i];
        var lookup = group_lookup[field_name];

        var field_write_val = field_write_vals[i];
        if (lookup["type"] != "string") {
            field_write_val = Math.round(Number(field_write_val)/Number(lookup["coefficient"]));
        }

        if( (lookup["multiple"] == 0) || (lookup["multiple"] === undefined) ) {
            written_bits = write_bits(
                field_write_val,
                parseInt(lookup["bit_start"]),
                parseInt(lookup["bit_end"]),
                current_bits = written_bits
            );
        }
        else {
            multiple_field_bits = BitManipulation.get_bits(field_write_val);
            bytes_num += multiple_field_bits.length/8;
        }
    }

    written_bits = written_bits.concat(multiple_field_bits);  // must add multiple_field_bits at the end

    written_bytes = BitManipulation.to_byte_arr(written_bits, size = bytes_num);
    bytes = bytes.concat(written_bytes)

    write_to_port(bytes, group_lookup["port"], encoded_data);
}

function encode(commands, sensor) {
    // encodes the commands object into a nested array of bytes

    valid = is_valid(commands, sensor);
    if (!valid["valid"]) {
        // check if commands is valid. If not, raise an error
        message = "Commands are invalid, failed at: " + valid["message"];
        error_code = valid["error_code"];

        foo = {error : message, error_code: error_code};
        return foo;
    }

    var lookup_all = {...sensor};   // clones the sensor json
    var encoded_data = {};
    var categories = Object.keys(commands);
    for (var i = 0; i < categories.length; i++) {   // iterates over the categories of commands
        var command_categories = commands[categories[i]];
        lookup_categories = lookup_all[categories[i]];

        var groups_and_fields = Object.keys(command_categories);
        for (var j = 0; j < groups_and_fields.length; j++) {    // iterates over the groups of commands
            var command = command_categories[groups_and_fields[j]];
            lookup = lookup_categories[groups_and_fields[j]];

            // Now that we are iterating over all of the commands, the cases that we have to handle are as such:
            //  1. The read case -> handled by encode_read(...)
            //  2. The write case where the current key is a field -> handled by encode_write_field(...)
            //  3. The write case where the current key is a group -> handled by encode_write_group(...)

            // Within cases 2 and 3, there is the case of "multiple" or not "multiple". These cases are handled
            // inside of their corresponding functions

            case_1 = command.hasOwnProperty("read");
            case_2 = command.hasOwnProperty("write") && (typeof(command["write"]) != "object");
            case_3 = !(case_1 || case_2);

            if (case_1) { encode_read(lookup, encoded_data); }
            else if (case_2) { encode_write_field(command, lookup, encoded_data); }
            else if (case_3) { encode_write_group(command, lookup, encoded_data); }

        }
    }
    return encoded_data;
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////

// home_sensor = require("./DL_Home_Sensor.json")


// commands = {
//     lorawan: {
//         app_key: { write: "this is a string" }
//     },

//     ticks_config : {                        // Configure the ticks
//         tick_temperature : { read : true },     // Read from ticks per temperature
//         tick_seconds : { write : 60 },          // Write 60 to seconds per tick
//         tick_battery : { write : 1 }            // Write ticks per battery to 1
//     },

//     // accelerometer : {                       // Configure the accelerometer
//         accelerometer_mode : {                  // Configure the acceleromter's mode
//             write : {
//                 accelerometer_impact_threshold_enable : 0,      // Enable impact threshold
//                 accelerometer_enable : 0,                        // Enable accelerometer
//                 accelerometer_break_in_threshold_enable : "this is a really long string a;sldfjaoiwva;oijea;oifejawofmsw;",    // Enable break-in threshold
//             }
//     //     }
//     //     // accelerometer_values_to_transmit : { read : true }      // Read accelerometer's tx values
//     // }

//     reed_switch: {
//         reed_switch_mode: {
//             write: {
//                 reed_switch_falling_edge: 0,
//                 reed_switch_rising_edge: 1
//             }
//         },
//         reed_switch_value_to_tx: { read: true }
//     },

//     external_connector: {
//         external_connector_mode: {
//             write: {
//                 external_connector_falling_edge: 0,
//                 external_connector_rising_edge: 1,
//                 external_connector_functionality: 0
//             }
//         }
//     }
// }

digital_sign = {
    "booking": {
        "room_info_ack": {
            "port": "102",
            "header": "0x34",
            "field_count": "7",
            "access": "RW",

            "Room_Name": {
                "multiple": "1",
                "data_size": "3",
                "bit_start": "0",
                "bit_end": "0",
                "type": "string",
                "coefficient": "1"
            },
            "String_Size": {
                "multiple": "0",
                "data_size": "3",
                "bit_start": "0",
                "bit_end": "7",
                "type": "unsigned",
                "coefficient": "1"
            },

            "Total_Room_Capacity": {
                "multiple": "0",
                "data_size": "3",
                "bit_start": "8",
                "bit_end": "15",
                "type": "unsigned",
                "coefficient": "1"
            },

            "TV": {
                "multiple": "0",
                "data_size": "3",
                "bit_start": "16",
                "bit_end": "16",
                "type": "unsigned",
                "coefficient": "1"
            },
            "Projector": {
                "multiple": "0",
                "data_size": "3",
                "bit_start": "17",
                "bit_end": "17",
                "type": "unsigned",
                "coefficient": "1"
            },
            "Web_Cam": {
                "multiple": "0",
                "data_size": "3",
                "bit_start": "18",
                "bit_end": "18",
                "type": "unsigned",
                "coefficient": "1"
            },
            "White_Board": {
                "multiple": "0",
                "data_size": "3",
                "bit_start": "19",
                "bit_end": "19",
                "type": "unsigned",
                "coefficient": "1"
            }
        }
    }
}

commands = {
    booking: {
        room_info_ack: {
            write: {
                Room_Name: "this is a long ass string a;oia;wgho;;p9ag;o<>npOJABIU#!@)#(_%#&(@_+}|{pnawop;g8ha3889af2?",
                String_Size: "this is a long ass string a;oia;wgho;;p9ag;o<>OJABIU#!@)#(_%#&(@_+}|{pnawop;g8ha3889af2?".length,
                Total_Room_Capacity: 69,
                TV: 0,
                Projector: 1,
                Web_Cam: 0,
                White_Board: 1
            }
        }
    }
}


encoded_data = encode(commands, digital_sign);
console.log(encoded_data);





