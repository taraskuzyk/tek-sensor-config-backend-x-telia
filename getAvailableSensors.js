const fs = require('fs');
const papa = require('papaparse');
const createUplinkJSON = require('./createUplinkJSON')
const createDownlinkJSON = require('./createDownlinkJSON')
const createRawJSON = require('./createRawJSON')
const PATH = "./resources/"

module.exports = async function getAvailableSensors(csvPath){
    const file_stream = fs.createReadStream(csvPath);
    return new Promise((resolve, reject) => {
        papa
            .parse(file_stream, {
                complete: async (results) => {
                    let sensors = await postParse(results.data)

                    resolve(sensors)
                },
                header: true,
            })
    })

    async function postParse(sensors) {
        return new Promise(async (resolve, reject) => {
            for (let i = 0; i < sensors.length; i++) {
                console.log(sensors.length)
                sensors[i].uplink = await createUplinkJSON(`${PATH}/${sensors[i].id}.csv`)
                sensors[i].downlink = await createDownlinkJSON(`${PATH}/${sensors[i].id}.csv`)
                sensors[i].raw = await createRawJSON(`${PATH}/${sensors[i].id}.csv`)
            }
            resolve(sensors)
        })
    }
}
