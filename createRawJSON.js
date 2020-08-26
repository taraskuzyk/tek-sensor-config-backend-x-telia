//CSV parsing
const fs = require('fs');
const papa = require('papaparse');

module.exports = async function createDownlinkJSON(csvPath){
    const file_stream = fs.createReadStream(csvPath);
    return new Promise(resolve =>
        papa.parse(file_stream, {
            complete: (results) => {
                resolve(results.data)
            },
            header: true,
        })
    );
}
