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
		throw new Error('getManagedClientsList:fetch --> error: ' + response.status);
	}
	let json = await response.json();
	let mngdClients = json.result.items.filter(clnt => { return !clnt.isSuspended; }); // Filter out suspended clients
	mngdClients = mngdClients.map(clnt => ({id: clnt.id, name: clnt.name, companyId: clnt.companyId })); // Client group ids, and name objects

	if (!mngdClients){ // Check for valid company id object
		throw new Error('getManagedClientsList:post-fetch --> error: null managed clients list');
	}

	return mngdClients;
}


async function getClientReportList(clientsIdList){
	// Gets report on clients and managed machines
	// - args:
	// 		- clientsIdList(array): json client objects {id, name, companyId}
	// - returns: array of client report objects {name(string), managed_machines(int)}
	let clientReportList = []
	for (let i=0; i < clientsIdList.length; i++){ // Loop through clients

		let validGrpIds = await getClientValidGroups(clientsIdList[i].id); // Valid group ids per client
		console.log("CompanyId: " + clientsIdList[i].companyId);
		
		let usageResponse = await bdLicenseFetchAssist("getMonthlyUsagePerProductType", {
			companyId: clientsIdList[i].companyId,
			targetMonth: '07/2021'
		});
		if (!usageResponse.ok){
			throw new Error('getClientReportList:fetch --> error: ' + response.status);
		}

		let json = await usageResponse.json();
		console.log(json.result);


		for (let k=0; k < validGrpIds.length; k++){ // Loop through valid folders within client
			let response = await bdNetworkFetchAssist("getEndpointsList", {
				parentId: validGrpIds[k], 
				perPage: 100
			});
			if (!response.ok){
				throw new Error('getClientReportList:fetch --> error: ' + response.status);
			}

			let json = await response.json();
			let mngdMachineList = json.result.items.filter(clnt => { return clnt.isManaged; }); // Get amount of managed machines per client

			let endpointCount = 0; // Counter for machine endpoints
			for (let j=0; j<mngdMachineList.length; j++){ // Loop through machines to add endpoints
				let subResponse = await bdNetworkFetchAssist("getManagedEndpointDetails", { endpointId: mngdMachineList[j].id });
				if (!subResponse.ok){
					throw new Error('getClientReportList:fetch --> error: ' + subResponse.status);
				}
				let subJson = await subResponse.json();
				if (subJson.result.agent.licensed == 1) { endpointCount++; } // Add licensed endpoints
			}

			clientReportList.push( { name: clientsIdList[i].name, machines: mngdMachineList.length, endpoints: endpointCount });
			// TODO! - Get enpoint validity and sandbox anlalyer valdity 
			//response = await bdNetworkFetchAssist("getManagedEndpointDetails", {endpointId: e.id});
		}
	}
	
	if (!clientReportList){ // Check for valid company id object
		throw new Error('getClientReportList:post-fetch --> error: null clients list');
	}

	return clientReportList;
}

async function getClientValidGroups(clientId){
	// Gets valid groups in client folder (exclude delted, everything else is good)
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

	if (!validGroupIds || !validGroupIds.length){ // Check for valid company id object
		throw new Error('getClientValidGroups:post-fetch --> error: null or empty valid group id array');
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
			"Authorization": "Basic " + btoa(process.env.BD_API_KEY)
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
			"Authorization": "Basic " + btoa(process.env.BD_API_KEY)
		}
	});

	return response;
}



module.exports = { bdNetQuery: bdNetQuery};
