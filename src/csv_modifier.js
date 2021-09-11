const { JSONCookie } = require("cookie-parser");
const { parse } = require('json2csv');


function bdCsvCreate(clients){
    // Gets csv object for client billing data
    // - args: 
    //      - clients(array): array of client report objects {name(string), managed_machines(int)}
    // - returns: csv text

    let fields = ['Company name', 'Managed machines', 'Endpoints']

    let content = fields.join(',') + '\n'
            + clients.map(e => ['\"' + e.name + '\"',e.machines,e.endpoints].join(',')).join('\n');
    
    return content;
}

module.exports = {bdCsvCreate: bdCsvCreate};