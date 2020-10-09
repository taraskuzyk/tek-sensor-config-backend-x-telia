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
        // category > group? > parameter > {...all sorts of parameters}
        for (const p of parameters){
            if (p["access"] === "")
                continue;
            let category = p["category_name"]
            let group = p["group_name"]
            let parameter = p["parameter_name"]

            if (!newParameters.hasOwnProperty(category) ) {
                newParameters[category] = {category_description: p["category_description"]}
            }

            if (group !== "") {
                if ( !newParameters[category].hasOwnProperty(group) ) {
                    newParameters[category][group] = {
                        header: p["header"],
                        or_80_to_write: p["or_80_to_write"],
                        port: p["port"]
                    }
                }
                newParameters[category][group][parameter] = {
                    data_size: p["data_size"],
                    bit_start: p["bit_start"],
                    bit_end: p["bit_end"],
                    type: p["type"],
                    round: p["round"],
                    coefficient: p["coefficient"],
                    access: p["access"],
                    multiple: p["multiple"],
                }
            } else {
                newParameters[category][parameter] = {
                    header: p["header"],
                    data_size: p["data_size"],
                    bit_start: p["bit_start"],
                    bit_end: p["bit_end"],
                    type: p["type"],
                    round: p["round"],
                    coefficient: p["coefficient"],
                    access: p["access"],
                    multiple: p["multiple"],
                    port: p["port"],
                    or_80_to_write: p["or_80_to_write"],
                }
            }
        }
        return newParameters;
    }
}
