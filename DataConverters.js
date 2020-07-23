var encode_module = require("./encode.js");
var decode_module = require("./decode.js");
var Base64Binary_module = require("./Base64Binary.js");

module.exports = {
    encode: encode_module.encode,
    decode: decode_module.decode,

    bytes_to_base64: Base64Binary_module.encode,
    base64_to_bytes: Base64Binary_module.decode,
}


