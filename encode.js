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
/ @date    2020-06-19
/
///////////////////////////////////////////////////////////////
*/

/*
NOTE: At the moment, these routines assume that "commands" will always contain valid commands,
      and that the sensor JSONs are all correct

ALSO: Idk what to do with the rounding thing oof oof

For the hexstring, I'll probably just modify write_bits and separate bytes so that they work with both numbers and strings

Something like:
    if typeof(value) == "number" {
        // Do stuff
    }

*/

// replace with appropriate directory
sensor_json = require("C:\\Users\\rmah\\VS-Code\\Encoder-Decoder-JSON-Generator\\DL\\downlinkHomeSensor.json");

function write_bits(write_value, start_bit, end_bit, current_value = 0) {
    // write the bits in write_value to the specified location in current_value and returns the result

    length = end_bit - start_bit + 1;
    // console.log(1 << length - 1)
    current_value |= ( ( write_value & ((1 << length) - 1) ) << start_bit );

    return current_value
}

function separate_bytes(value, byte_num) {
    // takes in a value and the number of bytes to be separated into, returns an array of bytes
        
    bytes = new Array(byte_num);    // This is to avoid using .unshift()
    for (var i = byte_num - 1; i >= 0; i--) {
        // We will and the value with a mask of 11111111 to isolate the 8 LSBs, then add it to the back of bytes
        mask = 0xFF;
        bytes[i] = value & mask;
        value = value >> 8;
    }
    return bytes
}

function encode(commands, sensor_json) {
    // encodes the commands object into a nested array of bytes
    
    var categories = Object.keys(commands);
    var encoded_data = [];

    // We will iterate over: (categories) -> (groups and fields)
    for (var i = 0; i < categories.length; i++) { // iterates over the categories of commands
        var category_str = categories[i];
        var category = commands[categories[i]];
        var groups_and_fields = Object.keys(category);
        // console.log(groups_and_fields)

        for (var j = 0; j < groups_and_fields.length; j++) { // iterates over the groups of commands
            var group_or_field_str = groups_and_fields[j];
            var group_or_field = category[groups_and_fields[j]];
            
            // console.log(category_str)
            // console.log(group_or_field_str)
            // Now that we are iterating over all of the commands, there are three cases to handle:
            //  1. The read case. This is the same regardless of if the current key is a group or a field
            //  2. The write case where the current key is a field
            //  3. The write case where the current key is a group (will require another for loop)


            if (group_or_field.hasOwnProperty("read")) {
                // CASE 1
                var header = sensor_json[category_str][group_or_field_str]["header"];
                encoded_data.push([parseInt(header)]);    // get the header and push it onto the array
            }

            else if (group_or_field.hasOwnProperty("write") && (typeof(group_or_field["write"]) != "object")) {
                // CASE 2
                var lookup = sensor_json[category_str][group_or_field_str];
                var bytes = [];

                var byte_num = lookup["data_size"];
                var start_bit = lookup["bit_start"];
                var end_bit = lookup["bit_end"];
                var header = lookup["header"];
                header |= 0x80;
                bytes.push(parseInt(header));

                val = group_or_field["write"];
                bytes = bytes.concat(separate_bytes(val, byte_num));

                encoded_data.push(bytes);
            }
            
            else {
                // CASE 3
                // console.log("poggers")
                var bytes = [];

                var lookup = sensor_json[category_str][group_or_field_str];

                var header = lookup["header"];
                header |= 0x80;
                bytes.push(parseInt(header));
                // console.log(header)

                var fields = Object.keys(group_or_field["write"]);
                var byte_num = lookup[fields[0]]["data_size"];
                var current_val = 0;
                for (var k = 0; k < fields.length; k++) {   // iterate over the fields in the group
                    lookup = sensor_json[category_str][group_or_field_str][fields[k]];
                    
                    var start_bit = lookup["bit_start"];
                    var end_bit = lookup["bit_end"];
                    // console.log(start_bit)

                    temp_val = group_or_field["write"][fields[k]];
                    // console.log(temp_val)
                    current_val = write_bits(temp_val, start_bit, end_bit, current_val);
                }
                // console.log(current_val)
                bytes = bytes.concat(separate_bytes(current_val, byte_num));
                encoded_data.push(bytes);
            }

        }

    }
    return encoded_data
}

// Test commands
commands = {
    loramac : { // category
        options : { // group
            write : {
                confirm_mode : 1, // field
                networks : 1, // field
                duty_cycle : 0, // field
                adr : 1 // field
            }
        },

        dr_tx_power : { // group
            read : true
        },

        net_id_msb : { write : 0x0B01 }

    },
    mcu_temperature : { // category
        sample_period_idle : { write : 0x0010102B }, // field
        sample_period_active : { write : 0x00202215}, // field
        threshold : { // group
            read : true
        }
    }
}

console.log(encode(commands, sensor_json));

// var thing = 0;
// thing = write_bits(1, 2, 2)
// console.log(thing)

// thing = write_bits(2,3,4,thing)
// console.log(thing)

// cat = commands["loramac"]
// group = cat["net_id_msb"]
// console.log(group.hasOwnProperty("write"))

// object = {}
// console.log(typeof(object))

// console.log(separate_bytes(1052715, 4))
// console.log(write_bits(1052715, 0, 31))

// var array1 = [1,2,3];
// var array2 = [4,5,6];
// console.log(array1.concat(array2))
