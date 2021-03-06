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
	// - returns: array of json client objects {id, name}

	let response = await bdNetworkFetchAssist("getNetworkInventoryItems", {parentId: companiesGroupId, perPage: 100});
	if (!response.ok){
		throw new Error('getManagedClientsList:fetch --> error: ' + response.status);
	}
	let json = await response.json();
	let mngdClients = json.result.items.filter(clnt => { return !clnt.isSuspended; }); // Filter out suspended clients
	mngdClients = mngdClients.map(clnt => ({id: clnt.id, name: clnt.name})); // Client group ids, and name objects

	if (!mngdClients){ // Check for valid company id object
		throw new Error('getManagedClientsList:post-fetch --> error: null managed clients list');
	}

	return mngdClients;
}


async function getClientReportList(clientsIdList){
	// Gets report on clients and managed machines
	// - args:
	// 		- clientsIdList(array): json client objects {id, name}
	// - returns: array of client report objects {name(string), managed_machines(int)}
	let clientReportList = []
	for (let i=0; i < clientsIdList.length; i++){ // Loop through clients

		let validGrpIds = await getClientValidGroups(clientsIdList[i].id); // Valid group ids per client
		
		let usageResponse = await bdLicenseFetchAssist("getMonthlyUsagePerProductType", {
			companyId: clientsIdList[i].companyId,
			targetMonth: getLastPeriodDate()
		});
		if (!usageResponse.ok){
			throw new Error('getClientReportList:fetch --> error: ' + response.status);
		}

		let json = await usageResponse.json();
		if (process.env.VERBOSE_MODE) {
			console.log("Client Name: " + clientsIdList[i].name + "\n" +
						"ValidGrps: " + validGrpIds
				);
			console.log(json.result);
		}
		

		let mngdMachineList = []; // List of managed machines for client
		let endpointCount = 0; // Counter for machine endpoints
		
		for (let k=0; k < validGrpIds.length; k++){ // Loop through valid folders within client, and add mnged machines to list
			let response = await bdNetworkFetchAssist("getEndpointsList", {
				parentId: validGrpIds[k], 
				perPage: 100
			});
			if (!response.ok){
				throw new Error('getClientReportList:fetch --> error: ' + response.status);
			}

			let json = await response.json();
			mngdMachineList = mngdMachineList.concat(json.result.items.filter(clnt => { return clnt.isManaged; })); // Get amount of managed machines per client
		}

		for (let j=0; j<mngdMachineList.length; j++){ // Loop through machines to add endpoints
			let subResponse = await bdNetworkFetchAssist("getManagedEndpointDetails", { endpointId: mngdMachineList[j].id });
			if (!subResponse.ok){
				throw new Error('getClientReportList:fetch --> error: ' + subResponse.status);
			}
			let subJson = await subResponse.json();
			if (subJson.result.agent.licensed == 1) { endpointCount++; } // Add licensed endpoints
			// TODO! - Get enpoint validity and sandbox anlalyzer valdity 
			//response = await bdNetworkFetchAssist("getManagedEndpointDetails", {endpointId: e.id});
		}

		clientReportList.push( { name: clientsIdList[i].name, machines: mngdMachineList.length, endpoints: endpointCount }); // Add client and info to list
	}
	
	if (!clientReportList){ // Check for valid company id object
		throw new Error('getClientReportList:post-fetch --> error: null clients list');
	}

	return clientReportList;
}

async function getClientValidGroups(clientId){
	// Gets valid groups in client folder (exclude deleted, everything else is good)
	// Recursivly look through valid groups for more groups
	// - args: 
	// 		clientId(string): clients id to search for non-deleted folders
	// - returns: array of valid group ids (string)
	let validGroupIds = []
	let response = await bdNetworkFetchAssist("getCustomGroupsList", { parentId: clientId });
	if (!response.ok){
		throw new Error('getClientValidGroups:fetch --> error: ' + response.status);
	}

	let json = await response.json();
	let validGroupObjs = json.result.filter(group => { return group.name != 'Deleted'; });
	validGroupObjs.forEach(group => { validGroupIds.push(group.id) });

	if (!validGroupIds){ // Check for valid company id object
		throw new Error('getClientValidGroups:post-fetch --> error: null or empty valid group id array');
	}

	if (validGroupIds.length > 0){ // Recursivly collect all valid groups
		for(let i=0; i < validGroupIds.length; i++){
			let moreValidGroupIds = await getClientValidGroups(validGroupIds[i]);
			validGroupIds = validGroupIds.concat(moreValidGroupIds);
		}
	}


	return validGroupIds;
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
			"Authorization": "Basic " + Buffer.from(process.env.BD_API_KEY).toString('base64')
		}
	});

	return response;
}

async function bdLicenseFetchAssist(targetMethod, targetParams){
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
	let response = await fetch(process.env.BD_DOMAIN+'/v1.0/jsonrpc/licensing', {
		method: "POST",
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
			"Authorization": "Basic " + Buffer.from(process.env.BD_API_KEY).toString('base64')
		}
	});

	return response;
}

function getLastPeriodDate(){
	// Get last months date fromatted as MM/YYYY
	// - args: N/A
	// - returns: string of date (MM/YYYY)
	var today = new Date();
	var month = today.getMonth() + 1;
	var year = today.getFullYear();

	// Offset month back once, change to MM format
	if(month == 1){
		month = 12;
	}else if(month < 11) {
		month = '0' + (month - 1)
	}else {
		month = month - 1;
	}

	return month + '/' + year;
}


module.exports = { bdNetQuery: bdNetQuery};
