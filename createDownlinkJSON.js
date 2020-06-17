//CSV parsing
const fs = require('fs');
const papa = require('papaparse');

module.exports = function createDownlinkJSON(csvPath, jsonPath){
    const file_stream = fs.createReadStream(csvPath);
//   ./resources/testHomeSensor.csv
    papa.parse(file_stream, {
        complete: (results) => {
            postParse(results.data)
        },
        header: true,
    });

    function postParse(parameters) {
        let newParameters = {};
        // Data structure of newParameters is as follows:
        // port > header > [array of parameters for a header]
        console.log(parameters)
        parameters.forEach((p)=>{
            let group_name = p["group_name"] === "" ? "nogroup" : p["group_name"]

            if ( !newParameters.hasOwnProperty(group_name) ) {
                newParameters[group_name] = {}
            }

            newParameters[group_name][p["parameter_name"]] =
                {
                    header: p.header,
                    port: p.port,
                    data_size: p.data_size,
                    bit_start: p.bit_start,
                    bit_end: p.bit_end,
                    type: p.type,
                    round: p.round,
                    multiplier: p.multiplier
                };
        });

        fs.writeFile(jsonPath, JSON.stringify(newParameters), function (err) {
            if (err) {
                console.log(err);
            }
        });
    }
}
