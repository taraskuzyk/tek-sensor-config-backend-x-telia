# tek-sensor-config-backend
The project runs on Node v12.6.3 (download and install the appropriate version from here https://nodejs.org/dist/v12.16.3/)

To start, clone the project into your directory.
```bash
git clone https://github.com/taraskuzyk/tek-sensor-config-backend.git
```
Then, go to the project directory and run
```bash
npm install
```
Once all the files have been installed, to start the project run
```bash
npm start
```

To run the project without NGROK you will need to comment out the following piece of the code (between the stars) inside **app.js**.
```javascript
http.listen(13337, async (err)=>{
    // COMMENT OUT FROM HERE ***********************
    //setting up ngrok
    console.log("Auth ngrok...")
    //await ngrok.authtoken(AUTHTOKEN)
    console.log("Auth successful!\nConnecting ngrok...")
    try {
        const one = await ngrok.connect({
            addr: 3000,
            proto: "http",
            subdomain: "tek-sensor-config",
            authtoken: AUTHTOKEN
        })
        const two = await ngrok.connect({
            addr: 13337,
            proto: "http",
            subdomain: "tek-sensor-backend",
            authtoken: AUTHTOKEN
        })
        console.log(`Connected ngrok! ${one} and ${two}`)
    } catch(e){
        console.log(":C")
        console.log(e)
    }
    // UNTIL HERE **********************************
});
```

You can change 13337 to the port you want the backend to run on.
