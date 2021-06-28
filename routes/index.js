var express = require('express');
var router = express.Router();
var request = require('request');
var fetch = require('node-fetch');
var json = require('json');


/* GET home page. */
router.get('/', (req, res, next) => {
	res.render('index', { title: 'CAS Billing Report', bdQuery: req.session.bdQuery, testQuery: req.session.testQuery});

	req.session.bdQuery = null;
	req.session.testQuery = null;
});

router.post('/query_test', (req, res) => {
	console.log('Test btn clicked!')
	req.session.testQuery = ['This', 'is', 'a', 'test'];

	res.redirect('/');
});

router.post('/query_bd', (req, res) => {
	console.log('BD Query btn clicked!')

	let key64 = btoa(process.env.BD_API_KEY);
	
	let body = {
		id: process.env.BD_QUERY_ID,
		jsonrpc: "2.0",
		method: "getAccountsList",
		params: {
			perPage: 20,
			page: 1
		}
	}

	// Api query request
	fetch(process.env.BD_DOMAIN+'/v1.0/jsonrpc/accounts', {
		method: "POST",
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
			"Authorization": "Basic " + key64
		}
	}).then(res => res.json())
	.then(json => {
		req.session.bdQuery = json;
		console.log(req.session.bdQuery);
		res.redirect('/');
	})
	.catch(err => {
		req.session.bdQuery = json;
		console.log(err);
		res.redirect('/')
	});

});

module.exports = router;
