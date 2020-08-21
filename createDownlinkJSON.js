//CSV parsing
const fs = require('fs');
const papa = require('papaparse');

module.exports = async function createDownlinkJSON(csvPath){
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
        let newParameters = {};
        // Data structure of newParameters is as follows:
        // category > group? > field > {...all sorts of parameters}
        parameters.forEach(p => {
            let category = p["category_name"]
            let group = p["group_name"]
            let parameter = p["parameter_name"]

            if (!newParameters.hasOwnProperty(category) ) {
                newParameters[category] = {}
            }

            if (group !== "") {
                if ( !newParameters[category].hasOwnProperty(group) ) {
                    newParameters[category][group] = {header: p["header"], port: p["port"]}
                }
                newParameters[category][group][parameter] = {
                    data_size: p["data_size"],
                    bit_start: p["bit_start"],
                    bit_end: p["bit_end"],
                    type: p["type"],
                    round: p["round"],
                    multiplier: p["multiplier"],
                    access: p["access"]
                }
            } else {
                newParameters[category][parameter] = {
                    header: p["header"],
                    data_size: p["data_size"],
                    bit_start: p["bit_start"],
                    bit_end: p["bit_end"],
                    type: p["type"],
                    round: p["round"],
                    multiplier: p["multiplier"],
                    access: p["access"],
                    port: p["port"],
                }
            }

        });
        //console.log(JSON.stringify(newParameters, null, 2))
        return newParameters;
    }
}
