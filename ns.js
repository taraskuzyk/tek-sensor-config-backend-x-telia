const fetch = require('node-fetch')

module.exports = {
    getCustomerApplications: async (nsUrl, token) => {
        try {
            let response = await fetch(`https://${nsUrl}/api/customer/applications`, {
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
            let response = await fetch(`https://${nsUrl}/api/auth/login`, {
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
            let response = await fetch(`https://${nsUrl}/api/application/${applicationId}/devices`, {
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
            let response = await fetch(`https://${nsUrl}/api/credentials/APPLICATION/${applicationId}`, {
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
    }
}
