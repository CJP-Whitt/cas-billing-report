var fetch = require('node-fetch');
var json = require('json');
const { ExpectationFailed } = require('http-errors');


async function bdNetQuery(req){
	// Get network info for BD
	// - returns: array of objects {name(string), managed_machines(integer)}
	try {
		let companiesIdStr = await getCompaniesGroupId(); // Get companies id str
		if (process.env.VERBOSE_MODE) {console.log(' - Companies Group ID: ' + companiesIdStr + ' ' + typeof(companiesIdStr));}

		let clientsList = await getManagedClientsList(companiesIdStr); // Get json list of managed client ids
		if (process.env.VERBOSE_MODE) {
			console.log(' - Managed Clients List:');
			clientsList.forEach(item => console.log('\t' + JSON.stringify(item)));
			console.log('\t( ' + clientsList.length + ' Total )');
		}
		
		var bdReportList = await getClientReportList(clientsList); // Get json list of client names and managed machines count
		if (process.env.VERBOSE_MODE) {
			console.log(' - BD Report List:');
			bdReportList.forEach(item => console.log('\t' + item.name + ': ' + item.machines));
			console.log('\t( ' + bdReportList.length + ' Total )');
		}
	}
	catch(err) {
		console.log(err);
		req.session.dbgTxt += '> ' + err.message + '\n';
		return null;
	}


	return bdReportList;
}

async function getCompaniesGroupId(){	
	// Gets CAS Companies tree root id
	// - returns: id string *or null on failure

	let response = await bdNetworkFetchAssist("getNetworkInventoryItems", {parentId: process.env.BD_NET_ROOT_ID});
	if (!response.ok){
		throw new Error('getCompaniesGroupInfo:fetch --> error: ' + response.status);
	}
	let json = await response.json();	

	if (!json.result.items[0].id){ // Check for valid company id object
		throw new Error('getCompaniesGroupInfo:post-fetch --> error: null id');
	}

	return json.result.items[0].id;
}

async function getManagedClientsList(companiesGroupId){	
	// Gets managed members of Companies group
	// - args:
	//		- companiesGroupId(string): id for companies root tree parentId
	// - returns: array of json client objects {id}

	let response = await bdNetworkFetchAssist("getNetworkInventoryItems", {parentId: companiesGroupId, perPage: 100});
	if (!response.ok){
		throw new error('getManagedClientsList:fetch --> error: ' + response.status);
	}
	let json = await response.json();
	let mngdClients = json.result.items.filter(clnt => {
		return !clnt.isSuspended;
	});

	mngdClients = mngdClients.map(clnt => ({id: clnt.id, name: clnt.name}))

	if (!mngdClients){ // Check for valid company id object
		throw new Error('getManagedClientsList:post-fetch --> error: null managed clients list');
	}

	return mngdClients;
}

async function getClientReportList(clientsIdList){
	// Gets report on clients and managed machines
	// - args:
	// 		- clientsIdList(array): json objects of client ids
	// - returns: array of client report objects {name(string), managed_machines(int)}
	let clientReportList = []; // 
	for (let i=0; i < clientsIdList.length; i++){
		// Api query request
		let response = await bdNetworkFetchAssist("getNetworkInventoryItems", {
			parentId: clientsIdList[i].id, 
			perPage: 100,
			filters: {
				type: {
					computers: true,
					virtualMachines: true
				},
				depth: {
					allItemsRecursively: true
				}
			}
		});
		if (!response.ok){
			throw new error('getClientReportList:fetch --> error: ' + response.status);
		}
		let json = await response.json();
		let mngdMachineList = json.result.items.filter(clnt => {
			return clnt.details.isManaged;
		});
		clientReportList.push( {name: clientsIdList[i].name, machines: mngdMachineList.length} );
		//response = await bdNetworkFetchAssist("getManagedEndpointDetails", {endpointId: e.id});
		
		if (i == 0) {
			for (let j=0; j<mngdMachineList.length; j++){
				let subResponse = await bdNetworkFetchAssist("getManagedEndpointDetails", {endpointId: mngdMachineList[j].id});
				if (!subResponse.ok){
					throw new error('getClientReportList:fetch --> error: ' + subResponse.status);
				}
				let subJson = await subResponse.json();
				console.log(subJson.result);
			}
		}
	}

	if (!clientReportList){ // Check for valid company id object
		throw new Error('getClientReportList:post-fetch --> error: null clients list');
	}

	return clientReportList;
}


/* ------ Helper Functions ------ */

async function bdNetworkFetchAssist(targetMethod, targetParams){
	// Perform api queries to BD using network domain
	// - args: 
	// 		targetMethod(string): bd query method to use
	//		targetParams(obj): obj of bd query paramaters
	// - returns: query response
	let body = {
		id: process.env.BD_QUERY_ID,
		jsonrpc: "2.0",
		method: targetMethod,
		params: targetParams
	};

	// Api query request
	let response = await fetch(process.env.BD_DOMAIN+'/v1.0/jsonrpc/network', {
		method: "POST",
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
			"Authorization": "Basic " + btoa(process.env.BD_API_KEY)
		}
	});

	return response;
}



module.exports = { bdNetQuery: bdNetQuery};
