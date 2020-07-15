//CSV parsing
const fs = require('fs');
const papa = require('papaparse');

module.exports =  function getAvailableSensors(csvPath){
    const file_stream = fs.createReadStream(csvPath);
//   ./resources/homeSensor.csv
    return new Promise(resolve =>
        papa.parse(file_stream, {
            complete: (results) => {
                resolve(results.data)
            },
            header: true,
        })
    );

    function postParse(data) {

    }
}
