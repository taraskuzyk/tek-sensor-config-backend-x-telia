const fetch = require('node-fetch')
const mqtt = require("mqtt"); //only used to send downlinks

module.exports = {
    getCustomerApplications: async (nsUrl, token) => {
        try {
            let response = await fetch(`${nsUrl}/api/customer/applications`, {
                method: 'GET',
                //mode: 'no-cors',
                headers: {
                    'accept': '*/*',
                    'X-Authorization': `Bearer ${token}`,
                    //'Access-Control-Allow-Origin': 'https://localhost:3000'
                },
            });
            return await response.json();
        } catch (error) {
            console.warn(error);
        }
    },
    getTokens: async (nsUrl, username, password) => {
        try {
            let response = await fetch(`${nsUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "username": username,
                    "password": password
                })
            });
            return await response.json();
        } catch (error) {
            console.warn(error);
        }
    },
    getApplicationDevices: async (nsUrl, token, applicationId) => {
        try {
            let response = await fetch(`${nsUrl}/api/application/${applicationId}/devices`, {
                method: 'GET',
                headers: {
                    'accept': '*/*',
                    'X-Authorization': `Bearer ${token}`
                }
            });
            return await response.json();
        } catch (error) {
            console.warn(error);
        }
    },
    getApplicationCredentials: async (nsUrl, token, applicationId) => {
        try {
            let response = await fetch(`${nsUrl}/api/credentials/APPLICATION/${applicationId}`, {
                method: 'GET',
                headers: {
                    'accept': '*/*',
                    'X-Authorization': `Bearer ${token}`,
                }
            });
            return await response.json();
        } catch (error) {
            console.warn(error);
        }
    },
    sendDownlink: (nsUrl, username, password, deveui, port, base64) => {
        console.log(`Sending to ${nsUrl} with U: ${username} P: ${password}`)
        let mqttConnection = mqtt.connect( `${nsUrl.replace("8082", "1883")}`, {
            "username": username,
            "password": password
        })

        console.log(deveui, port, base64)
        let msg = "{\"msgId\":\"1\", \"devEUI\":\"" + deveui + "\", \"port\":" +
            port + ", \"confirmed\": false, \"data\": \"" + base64 + "\"}"
        mqttConnection.publish("app/tx", msg)

    }


}
