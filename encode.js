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
        if ( (lookup["access"] == "W") || (lookup["access"] == "S") ) {
            return false;
        }
        else if ( typeof(group_or_field["read"]) == "object" ) {
            return false;
        }
    }
    else if (group_or_field.hasOwnProperty("write")) {
        if ( (lookup["access"] == "R") || (lookup["access"] == "S")) {
            return false;
        }
        if (typeof(group_or_field["write"]) === "object") {
            var fields = Object.keys(group_or_field["write"]);
            if (fields.length != Number(lookup["field_count"])) {
                return false;
            }
        }
    }
    else {  // send
        if ( (lookup["access"] == "RW") || (lookup["access"] == "R") || (lookup["access"] == "W") ) {
            return false;
        }
        else if (Object.keys(group_or_field["send"]).length != Number(lookup["field_count"])) {
            return false;
        }
    }
    return true;
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

            valid = check_command(group_or_field, lookup);
            if (!valid) {
                return {valid: false, message: category_str + " -> " + group_or_field_str};
            }
        }
    }
    return {valid: true, message: "no message"};
}

function write_bits(write_value, start_bit, end_bit, current_bits = BitManipulation.get_bits(0)) {
    // write the bits in write_value to the specified location in current_bits and returns the result as a bit array
    // Arguments:
    //      write_value [Number or String] - value to write to "current_bits"
    //      start_bit [Number] - start bit to write to
    //      end_bit [Number] - end bit to write to
    //      current_bits [Bit Array] - bits to write "write_value" to
    
    var bits_to_write = BitManipulation.get_bits(write_value);
        
    var length = Number(end_bit) - Number(start_bit) + 1;
    var mask = BitManipulation.init_mask(length, val = 1);
    
    bits_to_write = BitManipulation.AND(bits_to_write, mask);                   // AND bits_to_write with a mask of 1s
    bits_to_write = BitManipulation.shift_left(bits_to_write, start_bit);       // Shift the bits_to_write to start_bit

    current_bits = BitManipulation.OR(current_bits, bits_to_write);              // OR the bits_to_write with the current_bits

    return current_bits;
}

function format_header(header, read = true) {
    // takes in the header as a string, and handles the case of where the header is 2 bytes long
    
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

    val_to_write = command["write"];
    if (lookup["type"] != "string") {
        val_to_write = Math.round(Number(val_to_write)/Number(lookup["coefficient"]));
    }
    
    written_bits = write_bits(
        val_to_write,
        parseInt(lookup["bit_start"]),
        parseInt(lookup["bit_end"]),
        current_value = 0,
    );

    written_bytes = BitManipulation.to_byte_arr(written_bits, size = lookup["data_size"]);
    bytes = bytes.concat(written_bytes);

    write_to_port(bytes, lookup["port"], encoded_data);     // Add the bytes to the appropriate port in "encoded data"
}

function encode_write_group(commands, group_lookup, encoded_data) {
    header = group_lookup["header"];
    var bytes = format_header(header, read = false);

    var written_bits = BitManipulation.get_bits(0);
    var field_names = Object.keys(commands["write"])
    var field_write_vals = Object.values(commands["write"]);
    for (var i = 0; i < field_names.length; i++) {
        var field_name = field_names[i];
        var lookup = group_lookup[field_name];

        var field_write_val = field_write_vals[i];
        if (lookup["type"] != "string") {
            field_write_val = Math.round(Number(field_write_val)/Number(lookup["coefficient"]));
        }

        written_bits = write_bits(
            field_write_val,
            parseInt(lookup["bit_start"]),
            parseInt(lookup["bit_end"]),
            current_bits = written_bits
        );
    }
    written_bytes = BitManipulation.to_byte_arr(written_bits, size = lookup["data_size"]);
    bytes = bytes.concat(written_bytes)

    write_to_port(bytes, group_lookup["port"], encoded_data);
}

function encode(commands, sensor) {
    // encodes the commands object into a nested array of bytes
    
    if (!is_valid(commands, sensor)["valid"]) {
        // check if commands is valid. If not, raise an error
        message = "Commands are invalid, failed at: " + is_valid(commands, sensor)["message"];

        foo = {error : message};
        return foo;
    }
    
    var lookup_all = {...sensor};   // clones the sensor object
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
            //  1. The read case. This is the same regardless of if the current key is a group or a field
            //  2. The send case (for the digital sign and stuff). This case sucks hard. For real, I'm sorry.
            //  3. The write case where the current key is a field
            //  4. The write case where the current key is a group (will require another for loop)
            // console.log()
            // console.log(lookup)

            if (command.hasOwnProperty("read")) {
                // CASE 1
                encode_read(lookup, encoded_data);
            }
            else if (command.hasOwnProperty("write") && (typeof(command["write"]) != "object")) {
                // CASE 3
                encode_write_field(command, lookup, encoded_data);
            }
            else {
                // CASE 4
                encode_write_group(command, lookup, encoded_data);
            }
            
        }
    }
    return encoded_data;
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////



// home_sensor = require("./DL_Home_Sensor.json")


// commands = {
//     ticks_config : {                        // Configure the ticks
//         tick_seconds : { write : 60 },          // Write 60 to seconds per tick
//         tick_temperature : { read : true },     // Read from ticks per temperature
//         tick_battery : { write : 1 }            // Write ticks per battery to 1
//     },

//     accelerometer : {                       // Configure the accelerometer
//         accelerometer_mode : {                  // Configure the acceleromter's mode
//             write : {
//                 accelerometer_break_in_threshold_enable : 1,    // Enable break-in threshold
//                 accelerometer_impact_threshold_enable : 1,      // Enable impact threshold
//                 accelerometer_enable : 1                        // Enable accelerometer
//             }
//         },
//         accelerometer_values_to_transmit : { read : true }      // Read accelerometer's tx values
//     },

//     reed_switch: {
//         reed_switch_mode: {
//             write: {
//                 reed_switch_rising_edge: 1,
//                 reed_switch_falling_edge: 0
//             }
//         },
//         reed_switch_value_to_tx: { read: true }
//     },
//     external_connector: {
//         external_connector_mode: {
//             write: {
//                 external_connector_rising_edge: 1,
//                 external_connector_falling_edge: 0,
//                 external_connector_functionality: 1
//             }
//         }
//     }
// }

// encoded_data = encode(commands, home_sensor);
// console.log(encoded_data);





