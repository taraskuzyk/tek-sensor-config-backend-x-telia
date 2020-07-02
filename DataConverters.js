var encode_module = require("./encode.js");
var decode_module = require("./decode.js");
var Base64Binary_module = require("./Base64Binary.js");

var Digital_Sign_DL = require("./DL_Digital_Signage.json");
var Home_Sensor_DL = require("./DL_Home_Sensor.json");
var Industrial_Sensor_DL = require("./DL_Industrial_Sensor.json");

var Home_Sensor_UL = require("./uplinkHomeSensor.json");
var Medical_Sensor_UL = require("./uplinkMedicalSensor.json");

module.exports = {
    encode: encode_module.encode,
    decode: decode_module.decode,

    bytes_to_base64: Base64Binary_module.encode,
    base64_to_bytes: Base64Binary_module.decode,

    Digital_Sign_DL: Digital_Sign_DL,
    Home_Sensor_DL: Home_Sensor_DL,
    Industrial_Sensor_DL: Industrial_Sensor_DL,

    Home_Sensor_UL: Home_Sensor_UL,
    Medical_Sensor_UL: Medical_Sensor_UL
}


