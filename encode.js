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

// replace with appropriate directories
home_sensor_json = require("C:\\Users\\rmah\\VS-Code\\Data_Converters\\DL_Home_Sensor.json");
industrial_sensor_json = require("C:\\Users\\rmah\\VS-Code\\Data_Converters\\DL_Industrial_Sensor.json");
digital_sign_json = require("C:\\Users\\rmah\\VS-Code\\Data_Converters\\DL_Digital_Signage.json");


function check_command(group_or_field, lookup) {
    // returns true if an individual command is valid, and false otherwise

    // There are 2 things we need to check:
    //    1. Access - read-only? write-only?
    //    2. Number of fields

    if (group_or_field.hasOwnProperty("read")) {
        if ( (lookup["access"] == "W") || (lookup["access"] == "S")) {
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

function is_valid(commands, sensor_json) {
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

            var lookup = sensor_json[category_str][group_or_field_str];

            valid = check_command(group_or_field, lookup);
            if (!valid) {
                return [false, category_str + " -> " + group_or_field_str];
            }
        }
    }
    return [true, undefined];
}

function write_bits(write_value, start_bit, end_bit, current_value, multiplier) {
    // write the bits in write_value to the specified location in current_value and returns the result

    if (typeof(write_value) === "bigint") {
        // Base Case
        var length = end_bit - start_bit + 1n;
        current_value |= ( ( write_value & ((1n << length) - 1n) ) << start_bit );
    }

    else if (typeof(write_value) === "number") {
        write_value = BigInt( Math.round(Number(write_value)/multiplier) );
        current_value = write_bits(write_value, start_bit, end_bit, current_value, multiplier);
    }

    else if (typeof(write_value) === "string") {
        write_value = string_to_bigint(write_value);
        current_value = write_bits(write_value, start_bit, end_bit, current_value, multiplier);
    }
    return current_value;
}

function separate_bytes(value, byte_num) {
    // takes in a value and the number of bytes to be separated into, returns an array of bytes
    bytes = new Array(byte_num);
    
    if (typeof(value) == "bigint") {
        // Base case
        for (var i = byte_num - 1; i >= 0; i--) {
            // We will and the value with a mask of 11111111 to isolate the 8 LSBs, then add it to the back of bytes
            mask = BigInt(0xFF);
            bytes[i] = value & mask;
            value = value >> BigInt(8);
        }
    }

    else if (typeof(value) === "number") {
        value = BigInt(value);
        bytes = separate_bytes(value, byte_num);
    }

    else if (typeof(value) === "string") {
        // Javascript characters are 16 bits long if I'm correct
        value = string_to_bigint(value);
        bytes = separate_bytes(value, byte_num);
    }
    return bytes;
}

function bigint_to_num(encoded_data) {
    // converts all BigInts in "encoded_data" to numbers again

    for (var i = 0; i < encoded_data.length; i++) {
        encoded_data[i] = Number(encoded_data[i])
    }
    // console.log(encoded_data)
    return encoded_data;
}

function string_to_bigint(str) {
    // Converts a string into an BigInt with all the bits of the string
    // Assumes that a char is suppossed to have 8 bits
    
    var string_value = BigInt(0);
    j = 0;
    for (var i = str.length - 1; i >= 0; i--) {
        char_value = BigInt(str[i].charCodeAt(0));            
        string_value += (char_value << BigInt(8*j));
        j += 1;
    }
    return string_value;
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
        encoded_data[port].push(bytes);
    }
    else {
        // if the port doesn't exist as a key yet, create the key and push "bytes" onto it
        encoded_data[port] = [bytes];
    }    
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////
function encode(commands, sensor_json) {
    // encodes the commands object into a nested array of bytes
    // console.log(is_valid(commands, sensor_json))
    if (!is_valid(commands, sensor_json)[0]) {
        // check if commands is valid. If not, raise an error
        message = "Commands are invalid, failed at: " + is_valid(commands, sensor_json)[1];

        foo = {error : message};
        return foo;
    }

    var categories = Object.keys(commands);
    var encoded_data = {};

    for (var i = 0; i < categories.length; i++) {   // iterates over the categories of commands
        var category_str = categories[i];
        var category = commands[categories[i]];
        var groups_and_fields = Object.keys(category);

        for (var j = 0; j < groups_and_fields.length; j++) {    // iterates over the groups of commands
            var group_or_field_str = groups_and_fields[j];
            var group_or_field = category[groups_and_fields[j]];
            
            // console.log(category_str)
            // console.log(group_or_field_str)
            // Now that we are iterating over all of the commands, the cases that we have to handle are as such:
            //  1. The read case. This is the same regardless of if the current key is a group or a field
            //  2. The send case (for the digital sign and stuff). This case sucks hard. For real, I'm sorry.
            //  3. The write case where the current key is a field
            //  4. The write case where the current key is a group (will require another for loop)
            
            if (group_or_field.hasOwnProperty("read")) {
                // CASE 1
                var header = sensor_json[category_str][group_or_field_str]["header"];
                var bytes = format_header(header, read = true);
                bytes = bigint_to_num(bytes);

                var port = sensor_json[category_str][group_or_field_str]["port"];
                
                write_to_port(bytes, port, encoded_data);     // Add the bytes to the appropriate port in "encoded data"
            }
            
            else if (group_or_field.hasOwnProperty("send")) {
                // CASE 2
                var lookup = sensor_json[category_str][group_or_field_str];
                var header = lookup["header"];
                var port = lookup["port"];
                var ack = Boolean(group_or_field["send"]["ACK"]);
                var bytes = format_header(header, read = !ack);     // If it's not ACKed, then you don't do "header | 0x80"
                bytes = bigint_to_num(bytes);

                if (Object.keys(group_or_field["send"]).length === 1) {
                    // for the fields that are only for ACK/NACK
                    write_to_port(bytes, port, encoded_data);
                }

                else {
                    // for every other field
                    if ( (!ack) && (header != "0x33") ) {
                        // For every field but 0x33, if it's NACK, you just send the MessageID
                        write_to_port(bytes, port, encoded_data);
                        continue;
                    }
                    var fields = Object.keys(group_or_field["send"]);
                    var n = group_or_field["send"]["string_size"];     // define a variable "n" to represent "n" bytes in the string which
                    var current_val = BigInt(0);                       // will be used with the eval() function to allow for dynamic sizing
                    for (var k = 0; k < fields.length - 1; k++) {                        
                        var field_str = fields[k];

                        lookup = sensor_json[category_str][group_or_field_str][field_str];

                        var start_bit = BigInt(eval(lookup["bit_start"]));
                        var end_bit = BigInt(eval(lookup["bit_end"]));
                        
                        var temp_val = group_or_field["send"][fields[k]];
                        var multiplier = Number(lookup["multiplier"]);
                        current_val = write_bits(temp_val, start_bit, end_bit, current_val, multiplier);                        
                    }
                    var byte_num = eval(lookup["data_size"]);
                    bytes = bytes.concat(separate_bytes(current_val, byte_num - 1));    // -1 because we already added the ACK
                    bytes = bigint_to_num(bytes);
                    write_to_port(bytes, port, encoded_data);                    
                }
            }

            else if (group_or_field.hasOwnProperty("write") && (typeof(group_or_field["write"]) != "object")) {
                // CASE 3
                var lookup = sensor_json[category_str][group_or_field_str];
                var bytes = [];

                var byte_num = lookup["data_size"];
                var start_bit = BigInt(lookup["bit_start"]);
                var end_bit = BigInt(lookup["bit_end"]);
                var header = lookup["header"];
                bytes = format_header(header, read = false);

                var val = group_or_field["write"];
                var multiplier = Number(lookup["multiplier"]);
                val = write_bits(val, start_bit, end_bit, BigInt(0), multiplier);

                bytes = bytes.concat(separate_bytes(val, byte_num));
                bytes = bigint_to_num(bytes);

                var port = lookup["port"];
                
                write_to_port(bytes, port, encoded_data);     // Add the bytes to the appropriate port in "encoded data"
            }
            
            else {
                // CASE 4
                var bytes = [];

                var lookup = sensor_json[category_str][group_or_field_str];

                var port = lookup["port"];

                var header = lookup["header"];
                bytes = format_header(header, read = false);

                var fields = Object.keys(group_or_field["write"]);
                var byte_num = lookup[fields[0]]["data_size"];
                var current_val = BigInt(0);
                for (var k = 0; k < fields.length; k++) {   // iterate over the fields in the group
                    lookup = sensor_json[category_str][group_or_field_str][fields[k]];
                    
                    var start_bit = BigInt(lookup["bit_start"]);
                    var end_bit = BigInt(lookup["bit_end"]);

                    var temp_val = group_or_field["write"][fields[k]];
                    var multiplier = Number(lookup["multiplier"]);
                    current_val = write_bits(temp_val, start_bit, end_bit, current_val, multiplier);
                }
                bytes = bytes.concat(separate_bytes(current_val, byte_num));
                bytes = bigint_to_num(bytes);

                write_to_port(bytes, port, encoded_data);   // Add the bytes to the appropriate port in "encoded data"
            }
            
        }
    }
    return encoded_data;
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////

// Test commands
home_sensor_commands = {
    loramac : {                     // category
        loramac_opts : {                 // group
            write : {
                loramac_confirm_mode : 1,   // field
                loramac_networks : 1,       // field
                loramac_duty_cycle : 0,     // field
                loramac_adr : 1             // field
            }
        },
        loramac_dr_tx_power : { read : true },     // group
        loramac_net_id_msb : { write : 0x0B01 },   // field
    },
    mcu_temperature : { // category
        mcu_temperature_sample_period_idle : { write : "lmao" },         // field
        mcu_temperature_sample_period_active : { write : 0x00202215 },   // field
        mcu_temp_threshold : { read : true }                      // group
    },
    lorawan : {
        network_session_key : { read : true }           // field
    }
};

industrial_sensor_commands = {
    loramac : {                                     // category
        loramac_opts : {                            // group
            write : {
                loramac_class : 0b1011,             // field
                loramac_confirmed_uplink : 1,       // field
                loramac_duty_cycle : 0,             // field
                loramac_adr : 1                     // field
            }
        },
        loramac_dr_tx_power : { read : true },     // group
        loramac_net_id_msb : { write : 0x0B01 },   // field
    },
    sensor_config : {                                                    // category
        mcu_temperature_sample_period_idle : { write : "lmao" },         // field
        mcu_temperature_sample_period_active : { write : 0x00202215 },   // field
        mcu_temp_threshold : { read : true },                             // group
        input2_threshold : {
            write : {
                input2_current_high_threshold : 0.018,
                input2_current_low_threshold : 0.006
            }
        }
    },
    change_output_states : {                // On port 10
        output_2 : { write : 0b01101101 }
    },
    lorawan : {
        device_eui : { read : true },
        app_eui : { read : true }
    }
};


digital_sign_commands = {
    lorawan : {
        appEUI : { read : true }
    },
    
    book_app : {
        bookNowRsp : { send : {ACK : 1} },
        roomStatusRsp : {
            send : {
                booked_by : "Barack Obama",
                string_size : "Barack Obama".length,
                time_min : 30,
                time_hr : 12,
                PM_AM : 1,
                Nx_C : 1,
                TS_E : 0,
                EPD_E : 1,
                ACK : 1
            }
        },
        roomInfoRsp : {
            send : {
                room_name : "This is a really long string that I don't think we will ever need to send but oh well",
                string_size : "This is a really long string that I don't think we will ever need to send but oh well".length,
                total_room_capacity : 69,
                tv : 1,
                projector : 0,
                web_cam : 0,
                white_board : 1,
                ACK : 1
            }
        },
        finishRsp : { send : {ACK : 0} }
    }
}

console.time("encode");
encoded_data = encode(home_sensor_commands, home_sensor_json);
console.timeEnd("encode");

console.log()
console.log(encoded_data);
