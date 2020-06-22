module.exports =
function decode(parameters, data, port){
    // Maybe it would make more sense to use ES6 Maps, but it shouldn't impact performance too much.
    // Sorry if you have to cringe when maintaining it :)
    Object.keys(data).forEach(category => {
        // Due to the way the data is edited, we may have a field or a group beneath a category.
        // Checks will be performed below to determine what it is, and data will be encoded accordingly.
        // I hope our fix to legacy code doesn't become legacy code.
        Object.keys(category).forEach(fieldOrGroup => {
            const header = parseInt( parameters[category][fieldOrGroup]["header"] );
            if ( fieldOrGroup.hasOwnProperty("read") ){
                return [header];
            } else if ( fieldOrGroup.hasOwnProperty("write") ) {
                let returnList = [ header | 0x80];
                returnList.concat(getCommandBytes());
            } else {
                return []
            }
        })
    });
}

function getCommandBytes(value, size, startBit, endBit, type, multiplier){
    if (typeof value === "number"){
        return getValueBytes( Math.round(value*multiplier) )
    } else if (typeof value === "object") {
        Object.keys(value).forEach(field => {

        });
    }
}

function getValueBytes(value, ){

}
