//CSV parsing
var fs = require('fs');
var papa = require('papaparse');

module.exports = function createUplinkJSON(csvPath, jsonPath){
    const file_stream = fs.createReadStream(csvPath);
//   ./resources/testHomeSensor.csv
    papa.parse(file_stream, {
        complete: (results) => {
            postParse(results.data)
        },
        header: true,
    });

    function postParse(parameters) {
        var newParameters = {};
        // Data structure of newParameters is as follows:
        // port > header > [array of parameters for a header]
        for (let i = 0; i < parameters.length; i++) {
            if (!newParameters.hasOwnProperty(parameters[i].port))
                newParameters[parameters[i].port] = {}

            if (!newParameters[parameters[i].port].hasOwnProperty(parameters[i].header))
                newParameters[parameters[i].port][parameters[i].header] = []

            newParameters[parameters[i].port][parameters[i].header].push({
                data_size: parameters[i].data_size,
                bit_start: parameters[i].bit_start,
                bit_end: parameters[i].bit_end,
                type: parameters[i].type,
                parameter_name: parameters[i].parameter_name,
                group_name: parameters[i].group_name,
                round: parameters[i].round,
                multiplier: parameters[i].multiplier
            });

            fs.writeFile(jsonPath, JSON.stringify(newParameters), function (err) {
                if (err) {
                    console.log(err);
                }
            });
        }
    }
}
