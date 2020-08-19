// Author: Ryan Mah
// Version: 0.0.1

// issue with how I'm doing operations: I need the leading zeros


BitManipulation = {
    // a "class" that can perform bitwise operations on an unlimited amount of bits
    // a replacement for "BigInt" since "BigInt" is not backwards compatible

    // represents bits as an array of booleans

    // you have to make sure everything is always a multiple of 8 otherwise ascii 
    // encoding is screwed up :(

    __make_multiple_of_8: function(bits) {
        // appends 0s to the bits until it's a multiple of 8
        while (bits.length % 8 != 0) {
            bits.unshift(false);
        }
    },

    __make_equal_number_of_bits: function(bits1, bits2) {
        if (bits1.length == bits2.length) {
            return
        }
        while (bits1.length > bits2.length) {
            bits2.unshift(false);
        }
        while (bits2.length > bits1.length) {
            bits1.unshift(false);
        }
    },

    __remove_leading_zeros(bits) {
        while ( (bits[0] != true) && (bits.length > 1) ) {

            bits.shift()
        }
    },
    
    __make_copy: function(bits) {
        // this function is needed since assignment in js doesn't actually make copies,
        // and I don't want any of the below functions to change the value of their arguments
        new_bits = [];
        for (i = 0; i < bits.length; i++) {
            new_bits.push(Boolean(bits[i]));
        }
        return new_bits;
    },

    get_bits: function(literal) {
        // literal is any datatype that is currently supported by this function
        var bit_arr = [];
        if (typeof(literal) == "number") {
            if (literal == 0) {
                return [0];
            }

            while (literal > 0) {
                bit_arr.unshift(Boolean(literal % 2));
                literal = Math.floor(literal/2);
            }
            this.__remove_leading_zeros(bit_arr);
            this.__make_multiple_of_8(bit_arr);
            return bit_arr;
        }
        else if (typeof(literal) == "string") {
            bit_arr = [];
            for (i = 0; i < literal.length; i++) {
                char_val = literal[i].charCodeAt(0);

                char_bits = this.get_bits(char_val)
                this.__make_multiple_of_8(char_bits)

                bit_arr = bit_arr.concat(char_bits);
                
            }
            this.__remove_leading_zeros(bit_arr);
            this.__make_multiple_of_8(bit_arr);
            return bit_arr;
        }   
    },
    
    init_mask: function(length, val) {
        // returns a mask of 1s or 0s, as given by the "val" arguement
        if (val === undefined) {
            val = true;
        }

        var mask = new Array(length);
        for (i = 0; i < length; i++) {
            mask[i] = val;
        }
        return mask;
    },

    to_byte_arr: function(bits, size) {
        this.__remove_leading_zeros(bits);
        this.__make_multiple_of_8(bits);

        var bytes_arr = new Array(bits.length/8);
        for (var i = 0; i < bits.length; i += 8) {
            var byte_val = 0;
            
            var k = 0
            for (var j = 7; j >= 0; j--) {
                byte_val += (bits[i + j] << k);
                k += 1
            }
            bytes_arr[i/8] = byte_val;
        }

        if (size === undefined) {
            return bytes_arr;
        }

        while (bytes_arr.length < Number(size)) {
            bytes_arr.unshift(0);
        }
        return bytes_arr;
    },

    print: function(bits) {
        var str = "0b";
        for (i = 0; i < bits.length; i++) {
            str += Number(bits[i]);
        }
        console.log(str);
        return str;
    },

    shift_left: function(bits, shift_val) {
        var new_bits = new Array(bits.length + shift_val);
        for (i = 0; i < bits.length; i++) {
            new_bits[i] = Boolean(bits[i]);
        }
        for (i = bits.length; i < new_bits.length; i++) {
            new_bits[i] = false;
        }

        this.__remove_leading_zeros(new_bits);
        this.__make_multiple_of_8(new_bits);
        return new_bits;
    },

    shift_right: function(bits, shift_val) {
        var new_bits = new Array(bits.length);
        
        for (j = 0; j < shift_val; j++) {
            new_bits[j] = false;
        }
        for (i = 0; i < bits.length - shift_val; i++) {
            new_bits[i + shift_val] = Boolean(bits[i]);
        }

        this.__remove_leading_zeros(new_bits);
        this.__make_multiple_of_8(new_bits);
        return new_bits;
    },

    AND: function(bits1, bits2) {
        // returns bits1 & bits2
        var bits1_copy = this.__make_copy(bits1);
        var bits2_copy = this.__make_copy(bits2);

        this.__make_equal_number_of_bits(bits1_copy, bits2_copy);
        var new_bits = new Array(bits1_copy.length);

        for (i = 0; i < bits1_copy.length; i++) {
            new_bits[i] = Boolean(bits1_copy[i] & bits2_copy[i]);
        }
        this.__remove_leading_zeros(new_bits);
        this.__make_multiple_of_8(new_bits);

        return new_bits;
    },

    OR: function(bits1, bits2) {
        // returns bits1 | bits2
        var bits1_copy = this.__make_copy(bits1);
        var bits2_copy = this.__make_copy(bits2);
        this.__make_equal_number_of_bits(bits1_copy, bits2_copy);
        var new_bits = new Array(bits1_copy.length);

        for (i = 0; i < bits1_copy.length; i++) {
            new_bits[i] = Boolean(bits1_copy[i] | bits2_copy[i]);
        }
        
        this.__remove_leading_zeros(new_bits);
        this.__make_multiple_of_8(new_bits);

        return new_bits;
    },

    XOR: function(bits1, bits2) {
        // returns bits1 ^ bits2
        bits1_copy = this.__make_copy(bits1);
        bits2_copy = this.__make_copy(bits2);
        this.__make_equal_number_of_bits(bits1_copy, bits2_copy);
        new_bits = new Array(bits1.length);

        for (i = 0; i < bits1_copy.length; i++) {
            new_bits[i] = Boolean(bits1_copy[i] ^ bits2_copy[i]);
        }
        
        this.__remove_leading_zeros(new_bits);
        this.__make_multiple_of_8(new_bits);

        return new_bits;
    }

}

module.exports = BitManipulation;


// str = "afio;ajfe;aln;oige"
// BitManipulation.print(BitManipulation.get_bits(str))

// BitManipulation.print(BitManipulation.get_bits(153))

// bits1 = [0,0,0,1,1,0,0,0,0,0,1,0,0,1,1,0,0]
// bits2 = [0,0,0,1,1,0,0,0,0,0,1,0,0,1,1,0,0,0,1,0,1,1]
// BitManipulation.print(bits1)
// BitManipulation.print(bits2)
// BitManipulation.print(BitManipulation.AND(bits1, bits2))
// // 01110111
// 11001100
// 00000001

// bits = BitManipulation.get_bits(0b1001101111011010)
// BitManipulation.print(bits)
// BitManipulation.print(BitManipulation.shift_right(bits, 5))



