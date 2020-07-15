//express setup
const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const app = require('express')();
const http = require('http').createServer(app);
const _ = require('lodash')

//Client and NS communications
const mqtt = require("mqtt");
const io = require('socket.io')(http);

// Data conversion
const decode = require('./decode.js')
//const encode = require('./encode.js')
const createUplinkJSON = require('./createUplinkJSON')
const createDownlinkJSON = require('./createDownlinkJSON')
const getAvailableSensors = require('./getAvailableSensors')
const ns = require('./ns')
const dc = require('./DataConverters')


let sessions = {}
let uplink = {}
let downlink = {}
let availableSensors;

let parameters = {
    "10": {
        "0x00 0xBA": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "6",
                "type": "unsigned",
                "parameter_name": "battery_life",
                "group_name": "",
                "round": "",
                "multiplier": "0.01"
            },
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "eos_alert",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x01 0x04": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "input1_frequency",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x02 0x02": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "input2_voltage",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x03 0x02": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "input3_voltage",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x04 0x02": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "input4_voltage",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x05 0x04": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "input5_frequency",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x06 0x04": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "input6_frequency",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x09 0x65": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "light_intensity",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x09 0x00": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "light_detected",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x0A 0x71": [
            {
                "data_size": "6",
                "bit_start": "0",
                "bit_end": "15",
                "type": "signed",
                "parameter_name": "acceleration_x",
                "group_name": "",
                "round": "",
                "multiplier": "0.01"
            },
            {
                "data_size": "6",
                "bit_start": "16",
                "bit_end": "31",
                "type": "signed",
                "parameter_name": "acceleration_y",
                "group_name": "",
                "round": "",
                "multiplier": "0.01"
            },
            {
                "data_size": "6",
                "bit_start": "32",
                "bit_end": "47",
                "type": "signed",
                "parameter_name": "acceleration_z",
                "group_name": "",
                "round": "",
                "multiplier": "0.01"
            }
        ],
        "0x0A 0x00": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "7",
                "type": "signed",
                "parameter_name": "acceleration_z",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x0B 0x67": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "ambient_temperature",
                "group_name": "",
                "round": "",
                "multiplier": "0.1"
            }
        ],
        "0x0B 0x68": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "relative_humidity",
                "group_name": "",
                "round": "",
                "multiplier": "0.5"
            }
        ],
        "0x0C 0x67": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "mcu_temperature",
                "group_name": "",
                "round": "",
                "multiplier": "0.1"
            }
        ]
    },
    "100": {
        "0x00": [
            {
                "data_size": "8",
                "bit_start": "0",
                "bit_end": "63",
                "type": "hexstring",
                "parameter_name": "device_eui",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x01": [
            {
                "data_size": "8",
                "bit_start": "0",
                "bit_end": "63",
                "type": "hexstring",
                "parameter_name": "app_eui",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x02": [
            {
                "data_size": "16",
                "bit_start": "0",
                "bit_end": "127",
                "type": "hexstring",
                "parameter_name": "app_key",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x03": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "hexstring",
                "parameter_name": "device_address",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x04": [
            {
                "data_size": "16",
                "bit_start": "0",
                "bit_end": "127",
                "type": "hexstring",
                "parameter_name": "network_session_key",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x05": [
            {
                "data_size": "16",
                "bit_start": "0",
                "bit_end": "127",
                "type": "hexstring",
                "parameter_name": "app_session_key",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x10": [
            {
                "data_size": "2",
                "bit_start": "7",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "loramac_otaa",
                "group_name": "loramac_join_mode",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x11": [
            {
                "data_size": "2",
                "bit_start": "4",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "loramac_confirm_mode",
                "group_name": "loramac_opts",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "2",
                "bit_start": "8",
                "bit_end": "8",
                "type": "unsigned",
                "parameter_name": "loramac_networks",
                "group_name": "loramac_opts",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "2",
                "bit_start": "10",
                "bit_end": "10",
                "type": "unsigned",
                "parameter_name": "loramac_duty_cycle",
                "group_name": "loramac_opts",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "2",
                "bit_start": "11",
                "bit_end": "11",
                "type": "unsigned",
                "parameter_name": "loramac_adr",
                "group_name": "loramac_opts",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x12": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "3",
                "type": "unsigned",
                "parameter_name": "loramac_dr_number",
                "group_name": "loramac_dr_tx_power",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "2",
                "bit_start": "8",
                "bit_end": "11",
                "type": "unsigned",
                "parameter_name": "loramac_tx_power",
                "group_name": "loramac_dr_tx_power",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x13": [
            {
                "data_size": "5",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "loramac_rx2_frequency",
                "group_name": "loramac_rx2",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "5",
                "bit_start": "32",
                "bit_end": "39",
                "type": "unsigned",
                "parameter_name": "loramac_rx2_dr",
                "group_name": "loramac_rx2",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x19": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "loramac_net_id_msb",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x1A": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "loramac_net_id_lsb",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x20": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "tick_seconds",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x21": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "tick_battery",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x22": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "tick_temperature",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x23": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "tick_relative_humidity",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x24": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "tick_light",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x25": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "tick_input1",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x26": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "tick_input2",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x27": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "tick_input5",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x28": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "tick_acceleration",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x29": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "tick_mcu_temp",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x30": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "temperature_relative_humidity_idle",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x31": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "temperature_relative_humidity_active",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x32": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "7",
                "type": "signed",
                "parameter_name": "temperature_high_threshold",
                "group_name": "amb_temp_threshold",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "2",
                "bit_start": "8",
                "bit_end": "15",
                "type": "signed",
                "parameter_name": "temperature_low_threshold",
                "group_name": "amb_temp_threshold",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
            }
        ],
        "0x34": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "relative_humidity_high_threshold",
                "group_name": "amb_rh_threshold",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "2",
                "bit_start": "8",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "relative_humidity_low_threshold",
                "group_name": "amb_rh_threshold",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
            }
        ],
        "0x36": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "input12_sample_period_idle",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x37": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "input12_sample_period_active",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x38": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "input1_frequency_high_threshold",
                "group_name": "input1_threshold",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "4",
                "bit_start": "16",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "input1_frequency_low_threshold",
                "group_name": "input1_threshold",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
            }
        ],
        "0x3A": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "input2_voltage_high_threshold",
                "group_name": "input2_threshold",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "4",
                "bit_start": "16",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "input2_voltage_low_threshold",
                "group_name": "input2_threshold",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
            }
        ],
        "0x3C": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "input5_sample_period_idle",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x3D": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "input5_sample_period_active",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x3E": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "input5_frequency_high_threshold",
                "group_name": "input5_threshold",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "4",
                "bit_start": "16",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "input5_frequency_low_threshold",
                "group_name": "input5_threshold",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
            }
        ],
        "0x40": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "mcu_temperature_sample_period_idle",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x41": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "mcu_temperature_sample_period_active",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x42": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "mcu_temperature_high_threshold",
                "group_name": "mcu_temp_threshold",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "2",
                "bit_start": "8",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "mcu_temperature_low_threshold",
                "group_name": "mcu_temp_threshold",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
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
                "multiplier": "1"
            }
        ],
        "0x49": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "light_intencity_high_threshold",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x4A": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "light_intencity_low_threshold",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x4B": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "light_threshold_timer",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x4C": [
            {
                "data_size": "4",
                "bit_start": "0",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "light_sample_period_active",
                "group_name": "",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
            },
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "0",
                "type": "unsigned",
                "parameter_name": "light_intensity",
                "group_name": "als_values_tx",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
            },
            {
                "data_size": "1",
                "bit_start": "7",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "acceleration_sensor_enable",
                "group_name": "accel_mode",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x51": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "1",
                "type": "unsigned",
                "parameter_name": "acceleration_measurement_range",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x52": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "2",
                "type": "unsigned",
                "parameter_name": "acceleration_sample_rate",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x53": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "acceleration_impact_threshold",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x54": [
            {
                "data_size": "2",
                "bit_start": "0",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "acceleration_impact_debounce_time",
                "group_name": "",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
            },
            {
                "data_size": "1",
                "bit_start": "1",
                "bit_end": "1",
                "type": "unsigned",
                "parameter_name": "acceleration_report_magnitude",
                "group_name": "accel_values_tx",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "1",
                "bit_start": "2",
                "bit_end": "2",
                "type": "unsigned",
                "parameter_name": "acceleration_report_full_precision",
                "group_name": "accel_values_tx",
                "round": "",
                "multiplier": "1"
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
                "multiplier": "1"
            },
            {
                "data_size": "2",
                "bit_start": "6",
                "bit_end": "6",
                "type": "unsigned",
                "parameter_name": "lora_configuration",
                "group_name": "write_to_flash",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "2",
                "bit_start": "8",
                "bit_end": "8",
                "type": "unsigned",
                "parameter_name": "restart_sensor",
                "group_name": "write_to_flash",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x71": [
            {
                "data_size": "7",
                "bit_start": "0",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "app_major_version",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "7",
                "bit_start": "8",
                "bit_end": "15",
                "type": "unsigned",
                "parameter_name": "app_minor_version",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "7",
                "bit_start": "16",
                "bit_end": "23",
                "type": "unsigned",
                "parameter_name": "app_revision",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "7",
                "bit_start": "24",
                "bit_end": "31",
                "type": "unsigned",
                "parameter_name": "loramac_major_version",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "7",
                "bit_start": "32",
                "bit_end": "39",
                "type": "unsigned",
                "parameter_name": "loramac_minor_version",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "7",
                "bit_start": "40",
                "bit_end": "47",
                "type": "unsigned",
                "parameter_name": "loramac_revision",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1"
            },
            {
                "data_size": "7",
                "bit_start": "48",
                "bit_end": "55",
                "type": "unsigned",
                "parameter_name": "region",
                "group_name": "firmware_version",
                "round": "",
                "multiplier": "1"
            }
        ],
        "0x72": [
            {
                "data_size": "1",
                "bit_start": "0",
                "bit_end": "7",
                "type": "unsigned",
                "parameter_name": "configuration_factory_reset",
                "group_name": "",
                "round": "",
                "multiplier": "1"
            }
        ]
    }
}

async function startup () {
    uplink.homeSensor = await createUplinkJSON('./resources/homeSensor.csv')
    // uplink.digitalSignage = createUplinkJSON('./resources/digitalSignage.csv')
    uplink.industrialSensor = await createUplinkJSON('./resources/industrialSensor.csv')
    uplink.industrialTracker = await createUplinkJSON('./resources/industrialTracker.csv')
    uplink.agriculturalSensor = await createUplinkJSON('./resources/agriculturalSensor.csv')
    downlink.homeSensor = await createDownlinkJSON('./resources/homeSensor.csv')
    //downlink.digitalSignage = createDownlinkJSON('./resources/digitalSignage.csv')
    downlink.industrialSensor = await createDownlinkJSON('./resources/industrialSensor.csv')
    downlink.industrialTracker = await createDownlinkJSON('./resources/industrialTracker.csv')
    downlink.agriculturalSensor = await createDownlinkJSON('./resources/agriculturalSensor.csv')
    //console.log(uplink)
    availableSensors = await getAvailableSensors("./resources/_availableSensors.csv")
    console.log(JSON.stringify(uplink.agriculturalSensor, null, 2))
    var decoded = dc.decode(parameters, [3, 2, 1, 126, 4, 2, 1, 140, 5, 4, 22, 50, 6, 4, 20, 13, 9, 101, 2, 70], 10)
    console.log(decoded)
}

startup()

http.listen(13337);

//TODO: split up backend into Uplink and Downlink files?

io.on("connection", async (socket)=> {

    sessions[socket.id] = {}
    socket
    .on("login", async ({ nsUrl, username, password }) => {
        sessions[socket.id].tokens = await ns.getTokens(nsUrl, username, password)
        sessions[socket.id].nsUrl = nsUrl
        let applications = await ns.getCustomerApplications(nsUrl, sessions[socket.id].tokens.token)
        console.log(applications)
        socket.emit("userApplications", applications)
        socket.emit()
    })
    .on("getApplicationDevices", async (applicationId) => {
        console.log(applicationId)
        let devices = await ns.getApplicationDevices(sessions[socket.id].nsUrl, sessions[socket.id].tokens.token, applicationId)
        console.log(devices)
        socket.emit("applicationDevices", devices.data)
    })

    .on("mqttConnect", ({username, password, nsUrl, sensor})=> {
        //TODO: we need to wait for the user to connect and then send them the availableSensors
        socket.emit("availableSensors", availableSensors)
        socket.emit("sensorData")

        if (sessions[socket.id].hasOwnProperty("mqttConnection")){
            sessions[socket.id].mqttConnection.end() //TODO: check if this is needed by MQTT.js
        }
        sessions[socket.id].mqttConnection = mqtt.connect(nsUrl, {"username": username, "password": password})

        sessions[socket.id].mqttConnection
        .subscribe("app/#")
        .on("connect", ()=>{
            socket.emit("mqttConnected")
        })
        .on("disconnect", ()=>{
            socket.emit("mqttDisconnected")
        })
        .on("message", (topic, raw)=>{
            var receivedObject = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(raw)));

            receivedObject.serverTimestamp = Date.now()
            if (receivedObject.hasOwnProperty("payloadMetaData")) {

                var uplink = {
                    "payload": receivedObject.payload,
                    "port": receivedObject.payloadMetaData.fport,
                    "deveui": receivedObject.payloadMetaData.deviceMetaData.deviceEUI
                };

                //if (_.)
                var emitMsg = {
                    raw: receivedObject,
                    decoded:
                        uplink.hasOwnProperty(sensor) ? decode(
                            uplink[sensor],
                            Base64Binary.decode(uplink.payload),
                            uplink.port,
                            false
                        ) : "Your sensor doesn't have decoders yet..."
                }
                console.log("emitted the following message to", socket.id)
                console.log(emitMsg)
                socket.emit("mqttMessage", emitMsg)
                //TODO: edit the above once the data converters and CSVs are ready for other sensors
            }
        })
    })
    .on("disconnect", ()=> {
        try {
            delete sessions[socket.id]
        } catch(error){
            console.log(error)
        }
    })
    .on("downlink", (message)=>{
        console.log("received message to send on app/tx", message)
        sessions[socket.id].mqttConnection.publish("app/tx", message)
    })
    .on("HALLO", (msg)=>{
        console.log(msg)
    })

})

//for decoding Base64 encoded payloads, source: https://gist.github.com/lidatui/4064479#file-gistfile1-js-L8
var Base64Binary = {
    _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

    /* will return a  Uint8Array type */
    decodeArrayBuffer: function(input) {
        const bytes = (input.length / 4) * 3;
        const ab = new ArrayBuffer(bytes);
        this.decode(input, ab);

        return ab;
    },

    removePaddingChars: function(input){
        const lkey = this._keyStr.indexOf(input[input.length - 1]);
        if(lkey === 64){
            return input.substring(0,input.length - 1);
        }
        return input;
    },

    decode: function (input, arrayBuffer) {
        //get last chars to see if are valid
        input = this.removePaddingChars(input);
        input = this.removePaddingChars(input);

        const bytes = parseInt((input.length / 4) * 3, 10);

        let uarray;
        let chr1, chr2, chr3;
        let enc1, enc2, enc3, enc4;
        let i = 0;
        let j = 0;

        if (arrayBuffer)
            uarray = new Uint8Array(arrayBuffer);
        else
            uarray = new Uint8Array(bytes);

        //input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

        for (i=0; i<bytes; i+=3) {
            //get the 3 octets in 4 ascii chars
            enc1 = this._keyStr.indexOf(input[j++]);
            enc2 = this._keyStr.indexOf(input[j++]);
            enc3 = this._keyStr.indexOf(input[j++]);
            enc4 = this._keyStr.indexOf(input[j++]);

            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;

            uarray[i] = chr1;
            if (enc3 !== 64) uarray[i+1] = chr2;
            if (enc4 !== 64) uarray[i+2] = chr3;
        }

        return uarray;
    }
};

// Converts array to base64, source: https://gist.github.com/jonleighton/958841
function ArrayToBase64(arrayBuffer) {
    let base64 = '';
    const encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    const bytes = new Uint8Array(arrayBuffer);
    const byteLength = bytes.byteLength;
    const byteRemainder = byteLength % 3;
    const mainLength = byteLength - byteRemainder;

    let a, b, c, d;
    let chunk;

    // Main loop deals with bytes in chunks of 3
    for (let i = 0; i < mainLength; i = i + 3) {
        // Combine the three bytes into a single integer
        chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

        // Use bitmasks to extract 6-bit segments from the triplet
        a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
        b = (chunk & 258048)   >> 12; // 258048   = (2^6 - 1) << 12
        c = (chunk & 4032)     >>  6; // 4032     = (2^6 - 1) << 6
        d = chunk & 63;               // 63       = 2^6 - 1

        // Convert the raw binary segments to the appropriate ASCII encoding
        base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
    }

    // Deal with the remaining bytes and padding
    if (byteRemainder === 1) {
        chunk = bytes[mainLength];

        a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

        // Set the 4 least significant bits to zero
        b = (chunk & 3)   << 4; // 3   = 2^2 - 1

        base64 += encodings[a] + encodings[b] + '==';
    } else if (byteRemainder === 2) {
        chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

        a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
        b = (chunk & 1008)  >>  4; // 1008  = (2^6 - 1) << 4

        // Set the 2 least significant bits to zero
        c = (chunk & 15)    <<  2; // 15    = 2^4 - 1

        base64 += encodings[a] + encodings[b] + encodings[c] + '=';
    }

    return base64;
}
