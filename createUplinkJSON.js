//CSV parsing
var fs = require('fs');
var papa = require('papaparse');

module.exports = async function createUplinkJSON(csvPath){
    const file_stream = fs.createReadStream(csvPath);
//   ./resources/homeSensor.csv
    return new Promise(resolve =>
        papa.parse(file_stream, {
            complete: (results) => {
                resolve(postParse(results.data))
            },
            header: true,
        })
    );

    function postParse(parameters) {
        var newParameters = {};
        // Data structure of newParameters is as follows:
        // port > header > [array of parameters for a header]
        parameters.forEach(p => {
            if (!newParameters.hasOwnProperty(p.port))
                newParameters[p.port] = {}

            if (!newParameters[p.port].hasOwnProperty(p.header))
                newParameters[p.port][p.header] = []

            newParameters[p.port][p.header].push({
                data_size: p.data_size,
                bit_start: p.bit_start,
                bit_end: p.bit_end,
                type: p.type,
                parameter_name: p.parameter_name,
                group_name: p.group_name,
                round: p.round,
                multiplier: p.multiplier,
                multiple: p.multiple
            });
        })
        //console.log(newParameters)
        return newParameters;
    }
}
